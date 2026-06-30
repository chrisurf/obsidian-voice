import { App, SuggestModal, TFolder, setIcon } from "obsidian";
import type { Voice } from "../utils/VoicePlugin";
import { normalizeFolderPath } from "../utils/chapters";
import {
  orderFoldersForPicker,
  toggleDefaultFolder,
  toggleFavorite,
} from "../utils/audioFolders";

/** A pickable vault folder, or the "create a new folder" affordance. */
type FolderSuggestion =
  | {
      kind: "folder";
      path: string;
      isFavorite: boolean;
      isDefault: boolean;
      /** First "plain" folder below the default/favorite block — draws a divider. */
      sectionStart?: boolean;
    }
  | { kind: "create"; path: string };

/**
 * Quick folder picker for the custom audio-folder feature (issue #57).
 *
 * Lists every vault folder with fuzzy-ish search, pins the user's starred
 * folders to the top, lets them star/unstar inline, and offers to create a
 * folder that does not exist yet. Resolves to the chosen folder path, or null
 * if the user dismisses the modal.
 */
export class FolderPickerModal extends SuggestModal<FolderSuggestion> {
  private plugin: Voice;
  private allFolders: string[];
  private resolve: (value: string | null) => void = () => {};
  private settled = false;

  private constructor(app: App, plugin: Voice) {
    super(app);
    this.plugin = plugin;
    this.allFolders = app.vault
      .getAllLoadedFiles()
      .filter((f): f is TFolder => f instanceof TFolder)
      .map((f) => normalizeFolderPath(f.path));

    this.setPlaceholder("Search folders to save audio…");
    this.setInstructions([
      { command: "↵", purpose: "save here" },
      { command: "📌", purpose: "set default" },
      { command: "★", purpose: "favorite" },
      { command: "esc", purpose: "cancel" },
    ]);
  }

  /**
   * Open the picker and resolve with the chosen folder path, or null if the
   * user cancels.
   */
  static open(app: App, plugin: Voice): Promise<string | null> {
    const modal = new FolderPickerModal(app, plugin);
    return new Promise((resolve) => {
      modal.resolve = resolve;
      modal.open();
    });
  }

  getSuggestions(query: string): FolderSuggestion[] {
    const { favoriteAudioFolders, defaultAudioFolder } = this.plugin.settings;
    const ordered = orderFoldersForPicker(
      this.allFolders,
      favoriteAudioFolders,
      defaultAudioFolder,
    );
    const q = query.trim().toLowerCase();

    const matches = (
      q === ""
        ? ordered
        : ordered.filter((f) => f.path.toLowerCase().includes(q))
    ).map(
      (f): FolderSuggestion => ({
        kind: "folder",
        path: f.path,
        isFavorite: f.isFavorite,
        isDefault: f.isDefault,
      }),
    );

    // Mark the first plain folder (neither default nor favorite) so the list
    // shows a divider between the picked-out block at the top and the rest.
    // Ordering puts default/favorites first, so anything before it is "picked".
    const firstOther = matches.findIndex(
      (m) => m.kind === "folder" && !m.isFavorite && !m.isDefault,
    );
    if (firstOther > 0) {
      const item = matches[firstOther];
      if (item.kind === "folder") {
        item.sectionStart = true;
      }
    }

    // Offer to create a folder when the query does not name an existing one.
    const normalizedQuery = normalizeFolderPath(query.trim());
    if (q !== "" && !this.allFolders.some((p) => p.toLowerCase() === q)) {
      matches.push({ kind: "create", path: normalizedQuery });
    }

    return matches;
  }

  renderSuggestion(item: FolderSuggestion, el: HTMLElement): void {
    el.addClass("voice-folder-suggestion");

    if (item.kind === "create") {
      const icon = el.createSpan({ cls: "voice-folder-suggestion-icon" });
      setIcon(icon, "folder-plus");
      el.createSpan({
        cls: "voice-folder-suggestion-name",
        text: `Create folder “${item.path}”`,
      });
      return;
    }

    // Highlight the active default folder and favorites so they stand out at
    // the top, and start a new section at the first plain folder below them.
    el.toggleClass("is-default", item.isDefault);
    el.toggleClass("is-favorite", item.isFavorite);
    el.toggleClass("is-section-start", !!item.sectionStart);

    const icon = el.createSpan({ cls: "voice-folder-suggestion-icon" });
    setIcon(icon, item.path === "/" ? "home" : "folder");
    el.createSpan({
      cls: "voice-folder-suggestion-name",
      text: item.path === "/" ? "Vault root" : item.path,
    });
    if (item.isDefault) {
      el.createSpan({
        cls: "voice-folder-suggestion-badge",
        text: "Default",
      });
    }

    // Inline default-folder toggle (pin). The default is where a tap on the save
    // button stores audio; only one folder can be the default at a time, so
    // pinning a new one replaces the previous, and pinning the active one
    // clears it. stopPropagation keeps the click from also choosing the folder.
    const pin = el.createSpan({ cls: "voice-folder-suggestion-pin" });
    setIcon(pin, item.isDefault ? "pin" : "pin-off");
    pin.toggleClass("is-default", item.isDefault);
    pin.setAttribute(
      "aria-label",
      item.isDefault ? "Clear default folder" : "Set as default folder",
    );
    pin.addEventListener("click", (evt) => {
      evt.stopPropagation();
      evt.preventDefault();
      void this.toggleDefaultFor(item.path);
    });

    // Inline star toggle (favorite), independent of the default.
    const star = el.createSpan({ cls: "voice-folder-suggestion-star" });
    setIcon(star, item.isFavorite ? "star" : "star-off");
    star.toggleClass("is-favorite", item.isFavorite);
    star.setAttribute(
      "aria-label",
      item.isFavorite ? "Remove from favorites" : "Add to favorites",
    );
    star.addEventListener("click", (evt) => {
      evt.stopPropagation();
      evt.preventDefault();
      void this.toggleFavoriteFor(item.path);
    });
  }

  onChooseSuggestion(item: FolderSuggestion): void {
    this.settle(item.path);
  }

  onClose(): void {
    super.onClose();
    // Treat the close as a cancel only if no suggestion was chosen. The null is
    // deferred so that a selection click — which fires onChooseSuggestion right
    // around the same time the modal closes — always wins the race regardless
    // of the order Obsidian invokes the two callbacks in.
    window.setTimeout(() => this.settle(null), 0);
  }

  /** Resolve the open() promise exactly once with the first settled value. */
  private settle(value: string | null): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolve(value);
  }

  /** Star/unstar a folder and re-render the list in place. */
  private async toggleFavoriteFor(path: string): Promise<void> {
    this.plugin.settings.favoriteAudioFolders = toggleFavorite(
      this.plugin.settings.favoriteAudioFolders,
      path,
    );
    await this.plugin.saveSettings();
    this.refreshList();
  }

  /** Set/clear the default folder (only one at a time) and re-render. */
  private async toggleDefaultFor(path: string): Promise<void> {
    this.plugin.settings.defaultAudioFolder = toggleDefaultFolder(
      this.plugin.settings.defaultAudioFolder,
      path,
    );
    await this.plugin.saveSettings();
    this.refreshList();
  }

  /** Re-run getSuggestions so icons and ordering refresh immediately. */
  private refreshList(): void {
    this.inputEl.dispatchEvent(new Event("input"));
  }
}
