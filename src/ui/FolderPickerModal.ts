import { App, SuggestModal, TFolder, setIcon } from "obsidian";
import type { Voice } from "../utils/VoicePlugin";
import { normalizeFolderPath } from "../utils/chapters";
import {
  isFavoriteFolder,
  orderFoldersForPicker,
  toggleFavorite,
} from "../utils/audioFolders";

/** A pickable vault folder, or the "create a new folder" affordance. */
type FolderSuggestion =
  | { kind: "folder"; path: string; isFavorite: boolean }
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
  private chosen = false;

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
      { command: "click ★", purpose: "favorite" },
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
    const favorites = this.plugin.settings.favoriteAudioFolders;
    const ordered = orderFoldersForPicker(this.allFolders, favorites);
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
      }),
    );

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

    const icon = el.createSpan({ cls: "voice-folder-suggestion-icon" });
    setIcon(icon, item.path === "/" ? "home" : "folder");
    el.createSpan({
      cls: "voice-folder-suggestion-name",
      text: item.path === "/" ? "Vault root" : item.path,
    });

    // Inline star toggle. stopPropagation keeps a star click from also choosing
    // the folder (which would close the modal).
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
    this.chosen = true;
    this.resolve(item.path);
  }

  onClose(): void {
    super.onClose();
    // If the modal closed without a choice (esc / click-away), report a cancel.
    if (!this.chosen) {
      this.resolve(null);
    }
  }

  /** Star/unstar a folder and re-render the list in place. */
  private async toggleFavoriteFor(path: string): Promise<void> {
    this.plugin.settings.favoriteAudioFolders = toggleFavorite(
      this.plugin.settings.favoriteAudioFolders,
      path,
    );
    await this.plugin.saveSettings();
    // Re-run getSuggestions so the star icon and ordering refresh immediately.
    this.inputEl.dispatchEvent(new Event("input"));
  }

  /** Whether a folder is currently a favorite (used by callers/tests). */
  isFavorite(path: string): boolean {
    return isFavoriteFolder(this.plugin.settings.favoriteAudioFolders, path);
  }
}
