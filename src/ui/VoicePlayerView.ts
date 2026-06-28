import {
  ItemView,
  WorkspaceLeaf,
  TFile,
  setIcon,
  Notice,
  normalizePath,
} from "obsidian";
import type { Voice } from "../utils/VoicePlugin";
import type { TtsProvider } from "../settings/VoiceSettings";
import {
  listChapters,
  listMp3Folders,
  normalizeFolderPath,
  type ChapterFile,
  type Mp3Folder,
} from "../utils/chapters";
import { attachPressGesture } from "../utils/pressGesture";

export const VIEW_TYPE_VOICE_PLAYER = "voice-player-view";

const MIN_SPEED = 0.5;
const MAX_SPEED = 2.0;

type RepeatMode = "none" | "one" | "all";

/** Selectable TTS providers, mirroring the settings tab. */
const PROVIDERS: { id: TtsProvider; label: string }[] = [
  { id: "polly", label: "AWS Polly" },
  { id: "elevenlabs", label: "ElevenLabs" },
  { id: "google", label: "Google Cloud" },
  { id: "azure", label: "Azure Speech" },
  { id: "openai", label: "OpenAI" },
];

/**
 * VoicePlayerView - a collapsible audiobook-style player.
 *
 * On desktop it lives in the right sidebar; on mobile it opens as a
 * full-screen pane. It binds to the active speech provider's audio element
 * (polling, so provider swaps and chapter playback are handled uniformly) and
 * offers transport controls, a scrubber, speed, and a "chapters" list built
 * from the MP3 files in the selected folder. A folder picker lists every vault
 * folder that contains MP3s so the player can browse audio across the vault.
 */
export class VoicePlayerView extends ItemView {
  private plugin: Voice;

  private titleEl: HTMLElement;
  private subtitleEl: HTMLElement;
  private currentTimeEl: HTMLElement;
  private durationEl: HTMLElement;
  private scrubberEl: HTMLInputElement;
  private playPauseBtn: HTMLElement;
  private prevTrackBtn: HTMLElement;
  private nextTrackBtn: HTMLElement;
  private repeatBtn: HTMLElement;
  private speedEl: HTMLElement;
  private chaptersListEl: HTMLElement;
  private downloadBtn: HTMLButtonElement;
  private providerSelect: HTMLSelectElement;
  private voiceSelect: HTMLSelectElement;
  private folderSelect: HTMLSelectElement;
  private codeBtn: HTMLElement;
  private loadingBarEl: HTMLElement;
  private loadingFillEl: HTMLElement;

  private isScrubbing = false;
  private currentChapterPath: string | null = null;
  private chapters: ChapterFile[] = [];
  // Folders in the vault that contain at least one MP3, and the one currently
  // selected in the folder picker (drives the chapter list).
  private folders: Mp3Folder[] = [];
  private selectedFolderPath: string | null = null;
  private repeatMode: RepeatMode = "none";
  private endedHandled = false;

  constructor(leaf: WorkspaceLeaf, plugin: Voice) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_VOICE_PLAYER;
  }

  getDisplayText(): string {
    return "Voice player";
  }

  getIcon(): string {
    return "audio-lines";
  }

  async onOpen(): Promise<void> {
    this.buildUi();
    this.refreshContext();

    // Keep the transport in sync with whatever the active provider is playing.
    this.registerInterval(window.setInterval(() => this.update(), 250));

    // Refresh title + chapters when the active note changes.
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.refreshContext()),
    );

    // Refresh the chapter list when audio files appear/disappear in the vault
    // (e.g. after a download), so newly saved MP3s show up immediately.
    const refreshOnMp3 = (file: { path: string }) => {
      if (file.path.toLowerCase().endsWith(".mp3")) {
        this.refreshContext();
      }
    };
    this.registerEvent(this.app.vault.on("create", refreshOnMp3));
    this.registerEvent(this.app.vault.on("delete", refreshOnMp3));
    this.registerEvent(this.app.vault.on("rename", refreshOnMp3));
  }

  private provider() {
    return this.plugin.getSpeechProvider();
  }

  private audio(): HTMLAudioElement {
    return this.provider().getAudio();
  }

  private buildUi(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("voice-player");

    // Header
    const header = root.createDiv({ cls: "voice-player-header" });
    this.titleEl = header.createDiv({ cls: "voice-player-title" });
    this.subtitleEl = header.createDiv({ cls: "voice-player-subtitle" });

    // Scrubber
    const seek = root.createDiv({ cls: "voice-player-seek" });
    this.currentTimeEl = seek.createSpan({ cls: "voice-player-time" });
    this.currentTimeEl.setText("0:00");
    this.scrubberEl = seek.createEl("input", {
      cls: "voice-player-scrubber",
      attr: { type: "range", min: "0", max: "0", value: "0", step: "1" },
    });
    this.durationEl = seek.createSpan({ cls: "voice-player-time" });
    this.durationEl.setText("0:00");

    this.registerDomEvent(this.scrubberEl, "input", () => {
      this.isScrubbing = true;
      this.currentTimeEl.setText(formatTime(Number(this.scrubberEl.value)));
    });
    this.registerDomEvent(this.scrubberEl, "change", () => {
      const audio = this.audio();
      if (!isNaN(audio.duration)) {
        audio.currentTime = Number(this.scrubberEl.value);
      }
      this.isScrubbing = false;
    });

    // Transport. These are real <button> elements (not divs) so a single
    // click works even when the player pane isn't the focused leaf — Obsidian
    // delivers the first click to native controls, whereas a plain div's click
    // would be consumed by activating the pane (requiring a second click).
    const transport = root.createDiv({ cls: "voice-player-transport" });

    this.prevTrackBtn = transport.createEl("button", {
      cls: "voice-player-btn voice-player-track",
      attr: { "aria-label": "Previous track" },
    });
    setIcon(this.prevTrackBtn, "skip-back");
    this.registerDomEvent(this.prevTrackBtn, "click", () =>
      this.playPrevTrack(),
    );

    const rewindBtn = transport.createEl("button", {
      cls: "voice-player-btn voice-player-skip",
      attr: { "aria-label": "Rewind" },
    });
    setIcon(rewindBtn, "rewind");
    rewindBtn
      .createSpan({ cls: "voice-player-skip-label" })
      .setText(`${this.plugin.settings.rewindSeconds}`);
    this.registerDomEvent(rewindBtn, "click", () =>
      this.provider().rewindAudio(),
    );

    this.playPauseBtn = transport.createEl("button", {
      cls: "voice-player-btn voice-player-play",
      attr: {
        "aria-label": "Play / pause — hold 3s to regenerate",
        title: "Tap: play, pause or cancel · Hold 3s: regenerate from scratch",
      },
    });
    setIcon(this.playPauseBtn, "play");
    // One button does it all: a tap plays / pauses (and cancels an in-progress
    // synthesis); holding for 3s regenerates the note from scratch with the
    // current voice and settings (this replaces the separate Regenerate button).
    attachPressGesture(this.playPauseBtn, {
      onTap: () => this.togglePlay(),
      onHold: () => this.regenerate(),
      holdMs: 3000,
    });

    const forwardBtn = transport.createEl("button", {
      cls: "voice-player-btn voice-player-skip",
      attr: { "aria-label": "Fast-forward" },
    });
    setIcon(forwardBtn, "fast-forward");
    forwardBtn
      .createSpan({ cls: "voice-player-skip-label" })
      .setText(`${this.plugin.settings.forwardSeconds}`);
    this.registerDomEvent(forwardBtn, "click", () =>
      this.provider().fastForwardAudio(),
    );

    this.nextTrackBtn = transport.createEl("button", {
      cls: "voice-player-btn voice-player-track",
      attr: { "aria-label": "Next track" },
    });
    setIcon(this.nextTrackBtn, "skip-forward");
    this.registerDomEvent(this.nextTrackBtn, "click", () =>
      this.playNextTrack(),
    );

    // Secondary row: download + repeat + speed
    const secondary = root.createDiv({ cls: "voice-player-secondary" });

    // Save the generated audio as an MP3 so it shows up as a chapter. Tap saves
    // (to the last folder in custom mode); holding it — or right-clicking —
    // opens the folder picker, so audio can be (re-)saved to a different folder
    // any time. Same gesture as the status bar / mobile download button.
    this.downloadBtn = secondary.createEl("button", {
      cls: "voice-player-download",
      attr: { "aria-label": "Download as MP3" },
    });
    setIcon(this.downloadBtn, "download");
    attachPressGesture(this.downloadBtn, {
      onTap: () => void this.downloadAudio(),
      onHold: () => void this.downloadAudio({ forcePicker: true }),
    });

    // Repeat: cycle off → repeat one → repeat all → off.
    this.repeatBtn = secondary.createEl("button", {
      cls: "voice-player-repeat",
    });
    this.registerDomEvent(this.repeatBtn, "click", () => this.cycleRepeat());
    this.updateRepeatButton();

    const speedGroup = secondary.createDiv({ cls: "voice-player-speed" });
    const slower = speedGroup.createEl("button", {
      cls: "voice-player-speed-btn",
      attr: { "aria-label": "Slower" },
    });
    setIcon(slower, "minus");
    this.registerDomEvent(slower, "click", () => this.changeSpeed(-0.1));
    this.speedEl = speedGroup.createSpan({ cls: "voice-player-speed-value" });
    const faster = speedGroup.createEl("button", {
      cls: "voice-player-speed-btn",
      attr: { "aria-label": "Faster" },
    });
    setIcon(faster, "plus");
    this.registerDomEvent(faster, "click", () => this.changeSpeed(0.1));

    // Options row: provider + voice selectors and the read-code-blocks toggle
    const options = root.createDiv({ cls: "voice-player-options" });

    this.providerSelect = options.createEl("select", {
      cls: "voice-player-select dropdown",
      attr: { "aria-label": "Speech provider" },
    });
    PROVIDERS.forEach((p) =>
      this.providerSelect.createEl("option", { value: p.id, text: p.label }),
    );
    this.registerDomEvent(this.providerSelect, "change", () =>
      this.changeProvider(this.providerSelect.value as TtsProvider),
    );

    this.voiceSelect = options.createEl("select", {
      cls: "voice-player-select dropdown",
      attr: { "aria-label": "Voice" },
    });
    this.registerDomEvent(this.voiceSelect, "change", () =>
      this.changeVoice(this.voiceSelect.value),
    );

    this.codeBtn = options.createEl("button", {
      cls: "voice-player-code",
    });
    setIcon(this.codeBtn, "code");
    this.registerDomEvent(this.codeBtn, "click", () => this.toggleCodeBlocks());

    // Folder picker: choose any vault folder that contains MP3s and list its
    // tracks as chapters, so the player can browse audio across the vault.
    const folderRow = root.createDiv({ cls: "voice-player-folder" });
    this.folderSelect = folderRow.createEl("select", {
      cls: "voice-player-select voice-player-folder-select dropdown",
      attr: { "aria-label": "Audio folder" },
    });
    this.registerDomEvent(this.folderSelect, "change", () =>
      this.changeFolder(this.folderSelect.value),
    );

    // Chapters
    const chapters = root.createDiv({ cls: "voice-player-chapters" });
    chapters
      .createDiv({ cls: "voice-player-chapters-title" })
      .setText("Chapters");
    this.chaptersListEl = chapters.createDiv({
      cls: "voice-player-chapters-list",
    });

    // Loading bar (indeterminate), shown while a note is being processed.
    this.loadingBarEl = root.createDiv({ cls: "voice-player-loading" });
    this.loadingFillEl = this.loadingBarEl.createDiv({
      cls: "voice-player-loading-fill",
    });

    this.refreshControls();
  }

  private togglePlay(): void {
    const provider = this.provider();
    // A tap while a synthesis is running cancels it.
    if (provider.isOperationInProgress()) {
      provider.cancelOperation();
      return;
    }
    if (provider.isPlaying()) {
      provider.pauseAudio();
      return;
    }

    // Resume the loaded audio only when it still matches what the player is
    // showing. (Note: audio.src resolves an empty value to the page URL, so we
    // check currentSrc, which is "" until a real media resource is selected.)
    if (this.audio().currentSrc && !this.loadedAudioIsStale()) {
      void provider.playAudio();
      return;
    }

    // Nothing loaded, or the loaded audio was generated for a different note
    // than the one now open → read the currently open note instead of
    // replaying the previous one (issue #59).
    this.currentChapterPath = null;
    this.highlightCurrentChapter();
    void this.plugin.speakText();
  }

  /**
   * Whether the audio currently loaded in the player no longer matches the
   * active note. A chapter the user explicitly picked is never treated as
   * stale; synthesized note audio is stale once the active note differs from
   * the note it was generated for, so pressing play reads the new note rather
   * than resuming the previously rendered one.
   */
  private loadedAudioIsStale(): boolean {
    // An explicitly selected chapter keeps control of the play button.
    if (this.currentChapterPath) {
      return false;
    }
    const active = this.app.workspace.getActiveFile();
    // No readable note to compare against → keep the current audio.
    if (!active || active.extension !== "md") {
      return false;
    }
    // Synthesized audio is fresh only while it belongs to the active note;
    // getLastGeneratedAudio returns null once the cached note path differs.
    return this.provider().getLastGeneratedAudio(active.path) === null;
  }

  /**
   * Persist the generated audio for the active note as an MP3 and embed it,
   * then refresh so it appears in the chapter list. Reuses the shared download
   * flow so behaviour matches the status bar / mobile button.
   * @param options.forcePicker - Open the folder picker (the hold/right-click
   *   gesture) so the audio can be saved to a different folder.
   */
  private async downloadAudio(options?: {
    forcePicker?: boolean;
  }): Promise<void> {
    await this.plugin.iconEventHandler.handleDownloadAudio(options);
    this.refreshContext();
  }

  /**
   * Regenerate the current note from scratch (the play button's 3s hold). Always
   * uses the currently selected voice and settings. Cancels any in-progress
   * synthesis and stops playback first, so speakText performs a fresh render
   * instead of just pausing the audio that is already playing.
   */
  private regenerate(): void {
    const provider = this.provider();
    if (provider.isOperationInProgress()) {
      provider.cancelOperation();
    }
    provider.stopAudio();
    // Reading the note replaces any loaded chapter as the active audio, so
    // drop the chapter selection to keep the highlight and play button honest.
    this.currentChapterPath = null;
    this.highlightCurrentChapter();
    void this.plugin.speakText();
  }

  /** Switch the active TTS provider and resync the voice list. */
  private changeProvider(provider: TtsProvider): void {
    if (provider === this.plugin.settings.TTS_PROVIDER) {
      return;
    }
    this.plugin.settings.TTS_PROVIDER = provider;
    void this.plugin.saveSettings();
    this.plugin.reinitializeProvider();
    this.refreshControls();
  }

  /** Persist and apply the chosen voice for the active provider. */
  private changeVoice(voiceId: string): void {
    if (voiceId === this.provider().getVoice()) {
      return;
    }
    void this.plugin.persistActiveVoice(voiceId);
  }

  /** Toggle whether code blocks are read aloud. */
  private toggleCodeBlocks(): void {
    this.plugin.settings.readCodeBlocks = !this.plugin.settings.readCodeBlocks;
    void this.plugin.saveSettings();
    this.plugin.reinitializeTextSpeaker();
    this.updateCodeButton();
  }

  /** Resync the provider/voice selectors and the code-blocks toggle. */
  private refreshControls(): void {
    if (!this.providerSelect) {
      return;
    }
    this.providerSelect.value = this.plugin.settings.TTS_PROVIDER;
    this.populateVoiceOptions();
    this.updateCodeButton();
    this.updateDownloadButton();
  }

  /** Rebuild the voice dropdown from the active provider's catalog. */
  private populateVoiceOptions(): void {
    this.voiceSelect.empty();
    const provider = this.provider();
    provider.getVoiceOptions().forEach((voice) => {
      this.voiceSelect.createEl("option", {
        value: voice.id,
        text: voice.label,
      });
    });
    this.voiceSelect.value = provider.getVoice();
  }

  private updateCodeButton(): void {
    if (!this.codeBtn) {
      return;
    }
    const on = this.plugin.settings.readCodeBlocks;
    this.codeBtn.toggleClass("is-active", on);
    this.codeBtn.setAttribute(
      "aria-label",
      on ? "Read code blocks: on" : "Read code blocks: off",
    );
  }

  /**
   * Enable the download button whenever there is generated audio for the active
   * note. It stays enabled after a save so the user can re-save (e.g. after an
   * error) or hold it to save the audio to a different folder.
   */
  private updateDownloadButton(): void {
    if (!this.downloadBtn) {
      return;
    }
    const active = this.app.workspace.getActiveFile();
    const enabled = active
      ? this.provider().getLastGeneratedAudio(active.path) !== null
      : false;
    this.downloadBtn.disabled = !enabled;
    this.downloadBtn.toggleClass("is-disabled", !enabled);
  }

  private changeSpeed(delta: number): void {
    const current = this.provider().getSpeed();
    const next = Math.min(
      MAX_SPEED,
      Math.max(MIN_SPEED, Math.round((current + delta) * 10) / 10),
    );
    if (next !== current) {
      this.provider().setSpeed(next);
      this.plugin.settings.SPEED = next;
      void this.plugin.saveSettings();
      this.plugin.iconEventHandler.updateSpeedDisplayFromSettings();
    }
  }

  /**
   * Refresh the title, the folder picker, and the chapter list. The folder
   * picker lists every vault folder that holds MP3s; the selected folder drives
   * the chapter list.
   */
  private refreshContext(): void {
    if (!this.titleEl) {
      return;
    }
    const active = this.app.workspace.getActiveFile();
    this.titleEl.setText(active ? active.basename : "Voice player");

    // Collect every folder in the vault that holds at least one MP3.
    const mp3Files = this.app.vault
      .getFiles()
      .filter((f) => f.extension === "mp3");
    this.folders = listMp3Folders(mp3Files.map((f) => f.path));

    this.selectedFolderPath = this.resolveSelectedFolder(active);
    this.renderFolderOptions();
    this.renderSelectedFolderChapters();
  }

  /**
   * Decide which folder the chapter list should show. When "follow note" is on
   * (and the active note's folder has audio) we track the note; otherwise we
   * keep the user's manual choice, falling back to the active note's folder or
   * the first available folder when the previous selection no longer exists.
   */
  private resolveSelectedFolder(active: TFile | null): string | null {
    if (this.folders.length === 0) {
      return null;
    }
    const activeFolder =
      active?.parent != null ? normalizeFolderPath(active.parent.path) : null;
    const hasFolder = (path: string | null): boolean =>
      path !== null && this.folders.some((f) => f.path === path);

    if (
      this.plugin.settings.folderSelectorFollowsNote &&
      hasFolder(activeFolder)
    ) {
      return activeFolder;
    }
    if (hasFolder(this.selectedFolderPath)) {
      return this.selectedFolderPath;
    }
    return hasFolder(activeFolder) ? activeFolder : this.folders[0].path;
  }

  /** Rebuild the folder dropdown from the discovered MP3 folders. */
  private renderFolderOptions(): void {
    this.folderSelect.empty();
    if (this.folders.length === 0) {
      const placeholder = this.folderSelect.createEl("option", {
        value: "",
        text: "No audio folders",
      });
      placeholder.disabled = true;
      this.folderSelect.disabled = true;
      return;
    }
    this.folderSelect.disabled = false;
    this.folders.forEach((folder) => {
      this.folderSelect.createEl("option", {
        value: folder.path,
        text: folder.name,
      });
    });
    if (this.selectedFolderPath !== null) {
      this.folderSelect.value = this.selectedFolderPath;
    }
  }

  /** Switch the folder whose tracks are listed as chapters. */
  private changeFolder(folderPath: string): void {
    if (folderPath === this.selectedFolderPath) {
      return;
    }
    this.selectedFolderPath = folderPath;
    this.renderSelectedFolderChapters();
  }

  /** Render the chapters (MP3s) that live in the selected folder. */
  private renderSelectedFolderChapters(): void {
    const folderPath = this.selectedFolderPath;
    const mp3Paths =
      folderPath === null
        ? []
        : this.app.vault
            .getFiles()
            .filter(
              (f) =>
                f.extension === "mp3" &&
                normalizeFolderPath(f.parent?.path ?? "/") === folderPath,
            )
            .map((f) => f.path);
    this.chapters = listChapters(mp3Paths);

    this.subtitleEl.setText(
      this.chapters.length === 1
        ? "1 chapter"
        : `${this.chapters.length} chapters`,
    );
    this.renderChapters(this.chapters);
    this.updateDownloadButton();
  }

  private renderChapters(chapters: ChapterFile[]): void {
    this.chaptersListEl.empty();
    if (chapters.length === 0) {
      this.chaptersListEl
        .createDiv({ cls: "voice-player-chapters-empty" })
        .setText("No audio files in this folder yet.");
      return;
    }
    chapters.forEach((chapter, index) => {
      const item = this.chaptersListEl.createDiv({
        cls: "voice-player-chapter",
        attr: { "data-path": chapter.path },
      });
      item
        .createSpan({ cls: "voice-player-chapter-index" })
        .setText(`${index + 1}`);
      item
        .createSpan({ cls: "voice-player-chapter-name" })
        .setText(chapter.name);
      this.registerDomEvent(item, "click", () =>
        this.playChapter(chapter.path),
      );

      // Rename control: edit the MP3's file name (kept in the same folder, the
      // .mp3 extension is preserved). Stops propagation so it doesn't play.
      const editBtn = item.createDiv({
        cls: "voice-player-chapter-edit",
        attr: { "aria-label": "Rename track" },
      });
      setIcon(editBtn, "pencil");
      this.registerDomEvent(editBtn, "click", (evt) => {
        evt.stopPropagation();
        this.beginRenameChapter(item, chapter);
      });
    });
    this.highlightCurrentChapter();
  }

  /**
   * Replace a chapter's name with an inline text field so the user can rename
   * the underlying MP3. Enter/blur commits, Escape cancels.
   */
  private beginRenameChapter(item: HTMLElement, chapter: ChapterFile): void {
    const nameEl = item.querySelector<HTMLElement>(
      ".voice-player-chapter-name",
    );
    if (!nameEl) {
      return;
    }
    const input = createEl("input", {
      cls: "voice-player-chapter-rename",
      attr: { type: "text" },
    });
    input.value = chapter.name;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    let settled = false;
    const commit = () => {
      if (settled) return;
      settled = true;
      void this.commitRenameChapter(chapter, input.value);
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      this.refreshContext();
    };

    this.registerDomEvent(input, "click", (evt) => evt.stopPropagation());
    this.registerDomEvent(input, "keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        commit();
      } else if (evt.key === "Escape") {
        evt.preventDefault();
        cancel();
      }
    });
    this.registerDomEvent(input, "blur", () => commit());
  }

  /**
   * Rename the chapter's MP3 on disk to the new base name, keeping it in the
   * same folder and preserving the .mp3 extension. Uses fileManager so embeds
   * in notes are updated automatically.
   */
  private async commitRenameChapter(
    chapter: ChapterFile,
    rawName: string,
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(chapter.path);
    const newBase = rawName.trim();
    if (!(file instanceof TFile) || !newBase || newBase === chapter.name) {
      this.refreshContext();
      return;
    }
    if (/[\\/:*?"<>|]/.test(newBase)) {
      new Notice("That file name contains characters that aren't allowed.");
      this.refreshContext();
      return;
    }

    const folder = normalizeFolderPath(file.parent?.path ?? "/");
    const dir = folder === "/" ? "" : `${folder}/`;
    const newPath = normalizePath(`${dir}${newBase}.${file.extension}`);
    try {
      await this.app.fileManager.renameFile(file, newPath);
      if (this.currentChapterPath === chapter.path) {
        this.currentChapterPath = newPath;
      }
    } catch (error) {
      new Notice(
        `Could not rename: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.refreshContext();
  }

  private playChapter(path: string): void {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return;
    }
    const audio = this.audio();
    audio.src = this.app.vault.getResourcePath(file);
    this.currentChapterPath = path;
    void this.provider().playAudio();
    this.highlightCurrentChapter();
  }

  private highlightCurrentChapter(): void {
    this.chaptersListEl
      .querySelectorAll(".voice-player-chapter")
      .forEach((el) => {
        const isCurrent =
          el.getAttribute("data-path") === this.currentChapterPath;
        el.toggleClass("is-current", isCurrent);
      });
    this.updateTrackButtons();
  }

  /** Index of the playing chapter in the list, or -1 if none is selected. */
  private currentChapterIndex(): number {
    return this.chapters.findIndex((c) => c.path === this.currentChapterPath);
  }

  /** Play the chapter before the current one, if any. */
  private playPrevTrack(): void {
    const index = this.currentChapterIndex();
    if (index > 0) {
      this.playChapter(this.chapters[index - 1].path);
    }
  }

  /**
   * Play the chapter after the current one. When nothing is selected yet
   * (index -1) this starts the first chapter.
   */
  private playNextTrack(): void {
    const next = this.currentChapterIndex() + 1;
    if (next < this.chapters.length) {
      this.playChapter(this.chapters[next].path);
    }
  }

  /** Enable/disable the prev/next buttons at the list boundaries. */
  private updateTrackButtons(): void {
    if (!this.prevTrackBtn) {
      return;
    }
    const index = this.currentChapterIndex();
    this.prevTrackBtn.toggleClass("is-disabled", index <= 0);
    this.nextTrackBtn.toggleClass(
      "is-disabled",
      this.chapters.length === 0 || index >= this.chapters.length - 1,
    );
  }

  /** Cycle the repeat mode: off → repeat one → repeat all → off. */
  private cycleRepeat(): void {
    this.repeatMode =
      this.repeatMode === "none"
        ? "one"
        : this.repeatMode === "one"
          ? "all"
          : "none";
    this.updateRepeatButton();
  }

  private updateRepeatButton(): void {
    if (!this.repeatBtn) {
      return;
    }
    const icon = this.repeatMode === "one" ? "repeat-1" : "repeat";
    setIcon(this.repeatBtn, icon);
    this.repeatBtn.toggleClass("is-active", this.repeatMode !== "none");
    const label =
      this.repeatMode === "one"
        ? "Repeat one"
        : this.repeatMode === "all"
          ? "Repeat all"
          : "Repeat off";
    this.repeatBtn.setAttribute("aria-label", label);
  }

  /**
   * Called when the current audio finishes. Honors the repeat mode and
   * auto-advances through the chapter list.
   */
  private handleEnded(): void {
    if (this.repeatMode === "one") {
      const audio = this.audio();
      audio.currentTime = 0;
      void this.provider().playAudio();
      return;
    }

    // Auto-advance only makes sense while a chapter is playing.
    const index = this.currentChapterIndex();
    if (index < 0) {
      return;
    }
    const next = index + 1;
    if (next < this.chapters.length) {
      this.playChapter(this.chapters[next].path);
    } else if (this.repeatMode === "all" && this.chapters.length > 0) {
      this.playChapter(this.chapters[0].path);
    }
  }

  /** Sync the transport with the live audio element. */
  private update(): void {
    if (!this.playPauseBtn) {
      return;
    }
    const provider = this.provider();
    const audio = this.audio();

    const duration = isNaN(audio.duration) ? 0 : audio.duration;
    const currentTime = isNaN(audio.currentTime) ? 0 : audio.currentTime;

    if (!this.isScrubbing) {
      this.scrubberEl.max = `${Math.floor(duration)}`;
      this.scrubberEl.value = `${Math.floor(currentTime)}`;
      this.currentTimeEl.setText(formatTime(currentTime));
    }
    this.durationEl.setText(formatTime(duration));

    this.speedEl.setText(`${provider.getSpeed().toFixed(1)}×`);

    // Loading feedback while a note is being synthesized: grow the bottom bar to
    // the real synthesis progress and spin the play button (a tap cancels it).
    const loading = provider.isOperationInProgress();
    this.loadingBarEl.toggleClass("is-visible", loading);
    if (loading) {
      const pct = Math.round(provider.getProgress() * 100);
      this.loadingFillEl.setCssProps({ "--voice-progress": `${pct}%` });
      if (!this.playPauseBtn.hasClass("rotating-icon")) {
        this.playPauseBtn.addClass("rotating-icon");
        setIcon(this.playPauseBtn, "refresh-ccw");
      }
    } else {
      this.playPauseBtn.removeClass("rotating-icon");
      setIcon(this.playPauseBtn, provider.isPlaying() ? "pause" : "play");
    }

    // Keep the selectors/toggle in sync if settings changed elsewhere.
    if (this.providerSelect.value !== this.plugin.settings.TTS_PROVIDER) {
      this.refreshControls();
    } else {
      this.voiceSelect.value = provider.getVoice();
      this.updateCodeButton();
    }
    this.updateDownloadButton();

    // Detect track end here (rather than via an "ended" listener) so it keeps
    // working across provider swaps, which replace the audio element.
    if (audio.ended) {
      if (!this.endedHandled) {
        this.endedHandled = true;
        this.handleEnded();
      }
    } else {
      this.endedHandled = false;
    }
  }
}

/** Format seconds as m:ss (or h:mm:ss for long audio). */
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = `${s}`.padStart(2, "0");
  if (h > 0) {
    return `${h}:${`${m}`.padStart(2, "0")}:${ss}`;
  }
  return `${m}:${ss}`;
}
