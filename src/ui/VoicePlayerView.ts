import {
  ItemView,
  WorkspaceLeaf,
  TFile,
  Notice,
  normalizePath,
} from "obsidian";
import type { Voice } from "../utils/VoicePlugin";
import type { TtsProvider } from "../settings/VoiceSettings";
import { audioFilesInFolder } from "../utils/folderAudio";
import {
  AUDIO_EXTENSIONS,
  isAudioExtension,
  isAudioPath,
} from "../utils/audioFormat";
import {
  chapterName,
  listChapters,
  listMp3Folders,
  normalizeFolderPath,
  type ChapterFile,
  type Mp3Folder,
} from "../utils/chapters";
import { attachPressGesture } from "../utils/pressGesture";
import { noteAudioPath } from "../utils/audioFolders";
import { resolvePlayTap } from "../utils/playTap";
import { MAX_SPEED, MIN_SPEED } from "../utils/speedChoices";
import { groupVoicesByLanguage } from "../service/voiceCatalog";
import {
  bookmarkPositions,
  formatClock,
  type Bookmark,
} from "../utils/bookmarks";
import { setVoiceIcon } from "./icons";

export const VIEW_TYPE_VOICE_PLAYER = "voice-player-view";

type RepeatMode = "none" | "one" | "all";

/** Selectable TTS providers, mirroring the settings tab. */
const PROVIDERS: { id: TtsProvider; label: string }[] = [
  { id: "polly", label: "AWS Polly" },
  { id: "elevenlabs", label: "ElevenLabs" },
  { id: "google", label: "Google Cloud" },
  { id: "azure", label: "Azure Speech" },
  { id: "openai", label: "OpenAI" },
  { id: "openai-compatible", label: "OpenAI-compatible" },
  { id: "minimax", label: "MiniMax" },
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
  // Bookmarks of the loaded audio, drawn as marks on the scrubber; redrawn
  // only when they or the length change (the poller runs every 250ms).
  private marksEl: HTMLElement;
  private marksKey = "";
  private playPauseBtn: HTMLElement;
  private prevTrackBtn: HTMLElement;
  private nextTrackBtn: HTMLElement;
  private repeatBtn: HTMLElement;
  private speedEl: HTMLElement;
  private chaptersListEl: HTMLElement;
  private downloadBtn: HTMLButtonElement;
  private folderBtn: HTMLButtonElement;
  private bookmarkBtn: HTMLButtonElement;
  // Tracks which icon the download button currently shows, so we only swap it
  // when the save target changes (the update poller runs every 250ms).
  private downloadShowsSave = false;
  private providerSelect: HTMLSelectElement;
  private voiceSelect: HTMLSelectElement;
  private folderSelect: HTMLSelectElement;
  private codeBtn: HTMLElement;
  private acronymBtn: HTMLElement;
  private urlBtn: HTMLElement;
  private embedBtn: HTMLElement;
  private cacheBtn: HTMLElement;
  private loadingBarEl: HTMLElement;
  private playRingEl: HTMLElement;
  private playRingValueEl: SVGCircleElement;
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
  // The open per-chapter action bar (Move / Rename / Delete) and a disposer for
  // its outside-click / Escape listeners, if one is currently shown.
  private openActionsEl: HTMLElement | null = null;
  private chapterActionsCleanup: (() => void) | null = null;
  // The chapter whose bookmark list is open below it, if any.
  private expandedPath: string | null = null;
  // Whether the audio played at the last poll: a pause writes the bookmarks.
  private wasPlaying = false;

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
    // Focusing the player itself (e.g. a rename field) changes nothing it
    // shows, and re-rendering would drop that field.
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf?.view !== this) {
          this.refreshContext();
        }
      }),
    );

    // Refresh the chapter list when audio files appear/disappear in the vault
    // (e.g. after a download), so newly saved MP3s show up immediately.
    const refreshOnAudio = (file: { path: string }) => {
      if (isAudioPath(file.path)) {
        this.refreshContext();
      }
    };
    this.registerEvent(this.app.vault.on("create", refreshOnAudio));
    this.registerEvent(this.app.vault.on("delete", refreshOnAudio));
    this.registerEvent(this.app.vault.on("rename", refreshOnAudio));

    // Bookmarks changed (added, renamed, read from a file): redraw them.
    this.register(
      this.plugin.bookmarks.onChange(() => {
        this.marksKey = "";
        this.renderBookmarkList();
      }),
    );
  }

  async onClose(): Promise<void> {
    this.closeChapterActions();
    await this.plugin.bookmarks.flush();
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
    // The scrubber with the bookmarks marked on it (a tap on a mark jumps).
    const track = seek.createDiv({ cls: "voice-player-scrubber-wrap" });
    this.scrubberEl = track.createEl("input", {
      cls: "voice-player-scrubber",
      attr: { type: "range", min: "0", max: "0", value: "0", step: "1" },
    });
    this.marksEl = track.createDiv({ cls: "voice-player-marks" });
    this.durationEl = seek.createSpan({ cls: "voice-player-time" });
    this.durationEl.setText("0:00");

    this.registerDomEvent(this.scrubberEl, "input", () => {
      this.isScrubbing = true;
      this.currentTimeEl.setText(formatClock(Number(this.scrubberEl.value)));
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
      cls: "voice-ctl voice-player-btn voice-player-track",
      attr: { "aria-label": "Previous track" },
    });
    setVoiceIcon(this.prevTrackBtn, "skip-back");
    this.registerDomEvent(this.prevTrackBtn, "click", () =>
      this.playPrevTrack(),
    );

    const rewindBtn = transport.createEl("button", {
      cls: "voice-ctl voice-player-btn voice-player-skip",
      attr: { "aria-label": "Rewind" },
    });
    setVoiceIcon(rewindBtn, "seek-back");
    rewindBtn
      .createSpan({ cls: "voice-player-skip-label" })
      .setText(`${this.plugin.settings.rewindSeconds}`);
    this.registerDomEvent(rewindBtn, "click", () =>
      this.provider().rewindAudio(),
    );

    this.playPauseBtn = transport.createEl("button", {
      cls: "voice-ctl voice-player-btn voice-player-play",
      attr: { "aria-label": "Play, pause or cancel" },
    });
    setVoiceIcon(this.playPauseBtn, "play");
    this.buildPlayRing();
    // A tap plays / pauses (and cancels an in-progress synthesis). Whether a
    // fresh start reuses existing audio or renders anew is the Cache toggle's
    // job (see resolvePlayTap), so the button has no hidden hold gesture.
    this.registerDomEvent(this.playPauseBtn, "click", () => this.togglePlay());

    const forwardBtn = transport.createEl("button", {
      cls: "voice-ctl voice-player-btn voice-player-skip",
      attr: { "aria-label": "Fast-forward" },
    });
    setVoiceIcon(forwardBtn, "seek-forward");
    forwardBtn
      .createSpan({ cls: "voice-player-skip-label" })
      .setText(`${this.plugin.settings.forwardSeconds}`);
    this.registerDomEvent(forwardBtn, "click", () =>
      this.provider().fastForwardAudio(),
    );

    this.nextTrackBtn = transport.createEl("button", {
      cls: "voice-ctl voice-player-btn voice-player-track",
      attr: { "aria-label": "Next track" },
    });
    setVoiceIcon(this.nextTrackBtn, "skip-forward");
    this.registerDomEvent(this.nextTrackBtn, "click", () =>
      this.playNextTrack(),
    );

    // Actions row: save + folder on the left, repeat + the speed stepper on
    // the right.
    const secondary = root.createDiv({ cls: "voice-player-secondary" });

    // Save the generated audio as an MP3 so it shows up as a chapter. Tap saves
    // (to the default folder, or next to the note); holding it — or
    // right-clicking — opens the folder picker. Same gesture as the status bar /
    // mobile download button.
    this.downloadBtn = secondary.createEl("button", {
      cls: "voice-ctl voice-player-download",
      attr: { "aria-label": "Download as MP3" },
    });
    setVoiceIcon(this.downloadBtn, "download");
    attachPressGesture(this.downloadBtn, {
      onTap: () => void this.downloadAudio(),
      onHold: () => void this.downloadAudio({ forcePicker: true }),
    });

    // Save to custom folder: one click opens the folder picker and saves the
    // audio to the folder you choose (you can also pin a default there). A
    // discoverable alternative to holding the download button.
    this.folderBtn = secondary.createEl("button", {
      cls: "voice-ctl voice-player-folder-btn",
      attr: {
        "aria-label":
          "Save or move audio to a folder you choose (optionally pin it as your default)",
      },
    });
    setVoiceIcon(this.folderBtn, "folder-open");
    this.registerDomEvent(this.folderBtn, "click", () =>
      this.saveToCustomFolder(),
    );

    // Bookmark the current position of the loaded audio (also a command).
    this.bookmarkBtn = secondary.createEl("button", {
      cls: "voice-ctl voice-player-bookmark-btn",
      attr: { "aria-label": "Add a bookmark here" },
    });
    setVoiceIcon(this.bookmarkBtn, "bookmark-plus");
    this.registerDomEvent(
      this.bookmarkBtn,
      "click",
      () => void this.plugin.addBookmarkHere(),
    );

    // Repeat: cycle off → repeat one → repeat all → off.
    this.repeatBtn = secondary.createEl("button", {
      cls: "voice-ctl voice-player-repeat",
    });
    this.registerDomEvent(this.repeatBtn, "click", () => this.cycleRepeat());
    this.updateRepeatButton();

    const speedGroup = secondary.createDiv({ cls: "voice-player-speed" });
    const slower = speedGroup.createEl("button", {
      cls: "voice-ctl voice-player-speed-btn",
      attr: { "aria-label": "Slower" },
    });
    setVoiceIcon(slower, "minus");
    this.registerDomEvent(slower, "click", () => this.changeSpeed(-0.1));
    this.speedEl = speedGroup.createSpan({ cls: "voice-player-speed-value" });
    const faster = speedGroup.createEl("button", {
      cls: "voice-ctl voice-player-speed-btn",
      attr: { "aria-label": "Faster" },
    });
    setVoiceIcon(faster, "plus");
    this.registerDomEvent(faster, "click", () => this.changeSpeed(0.1));

    // On/off toggles, left to right: Cache, spell out acronyms, read code
    // blocks, skip URLs, embed MP3. Their own row of equal-width segments, each with an icon and a short
    // caption, so the action row above never overflows a narrow sidebar.
    const toggles = root.createDiv({ cls: "voice-player-toggles" });
    const addToggle = (caption: string): HTMLButtonElement => {
      const btn = toggles.createEl("button", {
        cls: "voice-ctl voice-player-toggle",
      });
      btn.createSpan({ cls: "voice-player-toggle-caption", text: caption });
      return btn;
    };

    // Cache: on plays a note's existing audio, off renders it again (and pays
    // the provider again) on the next play. See resolvePlayTap.
    this.cacheBtn = addToggle("Cache");
    setVoiceIcon(this.cacheBtn, "cache");
    this.registerDomEvent(this.cacheBtn, "click", () => this.toggleCache());

    this.acronymBtn = addToggle("Spell");
    setVoiceIcon(this.acronymBtn, "acronym");
    this.registerDomEvent(this.acronymBtn, "click", () =>
      this.toggleAcronyms(),
    );

    this.codeBtn = addToggle("Code");
    setVoiceIcon(this.codeBtn, "code");
    this.registerDomEvent(this.codeBtn, "click", () => this.toggleCodeBlocks());

    this.urlBtn = addToggle("No URLs");
    setVoiceIcon(this.urlBtn, "link-off");
    this.registerDomEvent(this.urlBtn, "click", () => this.toggleSkipUrls());

    this.embedBtn = addToggle("Embed");
    setVoiceIcon(this.embedBtn, "embed");
    this.registerDomEvent(this.embedBtn, "click", () => this.toggleEmbed());

    // Options row: provider + voice selectors.
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

    // Loading bar, shown while a note's audio is being generated, with the
    // only control that cancels it (asks first).
    this.loadingBarEl = root.createDiv({ cls: "voice-player-loading" });
    const loadingTrack = this.loadingBarEl.createDiv({
      cls: "voice-player-loading-track",
    });
    this.loadingFillEl = loadingTrack.createDiv({
      cls: "voice-player-loading-fill",
    });
    const cancelBtn = this.loadingBarEl.createEl("button", {
      cls: "voice-cancel-generation",
      attr: { "aria-label": "Stop generating audio" },
    });
    setVoiceIcon(cancelBtn, "close");
    this.registerDomEvent(
      cancelBtn,
      "click",
      () => void this.plugin.confirmCancelGeneration(),
    );

    this.refreshControls();
  }

  /**
   * The progress ring around the play button: a faint track and an arc whose
   * length is the synthesis progress (pathLength 100 = percent). Wrapped in a
   * span so the button's icon stays its only direct <svg> child.
   */
  private buildPlayRing(): void {
    const ns = "http://www.w3.org/2000/svg";
    const doc = this.playPauseBtn.ownerDocument;
    this.playRingEl = this.playPauseBtn.createSpan({ cls: "voice-play-ring" });
    const svg = doc.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");
    const circle = (cls: string): SVGCircleElement => {
      const c = doc.createElementNS(ns, "circle");
      c.setAttribute("class", cls);
      c.setAttribute("cx", "50");
      c.setAttribute("cy", "50");
      c.setAttribute("r", "47");
      c.setAttribute("pathLength", "100");
      svg.appendChild(c);
      return c;
    };
    circle("voice-play-ring-track");
    this.playRingValueEl = circle("voice-play-ring-value");
    this.playRingValueEl.setAttribute("stroke-dasharray", "0 100");
    this.playRingEl.appendChild(svg);
  }

  private togglePlay(): void {
    const provider = this.provider();
    const audio = this.audio();
    const active = this.app.workspace.getActiveFile();
    const activeNote = active && active.extension === "md" ? active : null;
    // audio.src resolves an empty value to the page URL, so check currentSrc,
    // which is "" until a real media resource is selected.
    const hasLoadedAudio = audio.currentSrc !== "";

    const action = resolvePlayTap({
      synthesizing: provider.isOperationInProgress() && !provider.isStreaming(),
      streaming: provider.isStreaming(),
      playing: provider.isPlaying(),
      pausedMidTrack: hasLoadedAudio && !audio.ended && audio.currentTime > 0,
      loadedAudioIsStale: this.loadedAudioIsStale(),
      hasLoadedAudio,
      hasActiveNote: activeNote !== null,
      cacheOn: this.plugin.settings.playNoteSavedAudio,
    });

    switch (action) {
      case "play-now":
        this.plugin.playWhatIsReady();
        return;
      case "pause":
        provider.pauseAudio();
        return;
      case "resume":
        void provider.playAudio();
        return;
      case "regenerate":
        this.regenerate();
        // Back to the safe default, so the next tap doesn't pay again.
        this.setCache(true);
        return;
      case "play-cached":
        if (activeNote) {
          this.playActiveNote(activeNote);
        } else {
          this.readActiveNoteFresh();
        }
        return;
    }
  }

  /**
   * Play the note the user is viewing: resume it if its audio is already
   * loaded, reuse its saved MP3 when one exists on disk, otherwise synthesize.
   * Used by the play-button tap when "Play the note's saved audio" is on, so
   * switching notes always plays the note in front of you.
   */
  private playActiveNote(activeNote: TFile): void {
    const provider = this.provider();
    const existing = this.existingNoteAudio(activeNote);
    if (existing) {
      // Already showing that file → just resume; otherwise load and play it.
      if (
        this.currentChapterPath === existing.path &&
        this.audio().currentSrc
      ) {
        void provider.playAudio();
      } else {
        this.playChapter(existing.path);
      }
      return;
    }

    // No saved MP3 on disk. Resume fresh, unsaved audio already rendered for
    // this note; otherwise synthesize it. (Any loaded chapter belongs to a
    // different note here, so we follow the active note rather than resume it.)
    if (
      this.currentChapterPath === null &&
      provider.getLastGeneratedAudio(activeNote.path) !== null &&
      this.audio().currentSrc
    ) {
      void provider.playAudio();
      return;
    }
    this.readActiveNoteFresh();
  }

  /** Drop any loaded chapter and synthesize the active note from scratch. */
  private readActiveNoteFresh(): void {
    this.currentChapterPath = null;
    this.highlightCurrentChapter();
    this.updateTitle();
    void this.plugin.speakText();
  }

  /**
   * The MP3 already saved for the active note, if any: a file named after the
   * note in the folder where a tap-save would write it (the default folder when
   * set, otherwise next to the note). Returns null when no such file exists, so
   * the player falls back to synthesizing.
   */
  private existingNoteAudio(active: TFile): TFile | null {
    for (const extension of AUDIO_EXTENSIONS) {
      const path = normalizePath(
        noteAudioPath(
          this.plugin.settings.defaultAudioFolder,
          active.parent?.path ?? "",
          active.basename,
          extension,
        ),
      );
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        return file;
      }
    }
    return null;
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
    // When picking a folder and a saved chapter is loaded, move that file into
    // the chosen folder instead of saving a fresh copy.
    const moveFromPath =
      options?.forcePicker && this.currentChapterPath
        ? this.currentChapterPath
        : undefined;
    await this.plugin.iconEventHandler.handleDownloadAudio({
      ...options,
      moveFromPath,
    });
    this.refreshContext();
  }

  /**
   * Save the current audio to a folder chosen in the picker (the dedicated
   * folder button) — a one-click "Save to custom folder". Reuses the shared
   * download flow, so choosing a folder saves there and pinning sets the
   * default.
   */
  private saveToCustomFolder(): void {
    void this.downloadAudio({ forcePicker: true });
  }

  /**
   * Regenerate the current note from scratch (a play tap with Cache off). Always
   * uses the currently selected voice and settings. Cancels any in-progress
   * synthesis and stops playback first, so speakText performs a fresh render
   * instead of just pausing the audio that is already playing.
   */
  private regenerate(): void {
    const provider = this.provider();
    // Audio being generated is never cut short (only its ✕ cancels it).
    if (provider.isOperationInProgress()) {
      this.plugin.notifyStillGenerating();
      return;
    }
    provider.stopAudio();
    // Reading the note replaces any loaded chapter as the active audio, so
    // drop the chapter selection to keep the highlight and play button honest.
    this.currentChapterPath = null;
    this.highlightCurrentChapter();
    this.updateTitle();
    void this.plugin.speakText();
  }

  /** Switch the active TTS provider and resync the voice list. */
  private changeProvider(provider: TtsProvider): void {
    if (provider === this.plugin.settings.TTS_PROVIDER) {
      return;
    }
    if (this.plugin.isGenerating()) {
      this.plugin.notifyStillGenerating();
      this.providerSelect.value = this.plugin.settings.TTS_PROVIDER;
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

  // The content toggles read and write the speech profile of the language
  // being read (see Voice.setProfileSetting); it is their source of truth.

  /** Toggle whether code blocks are read aloud. */
  private toggleCodeBlocks(): void {
    const read = this.plugin.getActiveProfile().content.codeBlocks === "read";
    void this.plugin
      .setProfileSetting("content.codeBlocks", read ? "placeholder" : "read")
      .then(() => this.updateCodeButton());
  }

  /** Toggle whether acronyms (NASA, API) are spelled out letter by letter. */
  private toggleAcronyms(): void {
    const spell = this.plugin.getActiveProfile().content.acronyms === "spell";
    void this.plugin
      .setProfileSetting("content.acronyms", spell ? "word" : "spell")
      .then(() => this.updateAcronymButton());
  }

  /** Toggle whether website URLs are skipped (link labels are kept). */
  private toggleSkipUrls(): void {
    const skip = this.plugin.getActiveProfile().content.urls === "skip";
    void this.plugin
      .setProfileSetting("content.urls", skip ? "read" : "skip")
      .then(() => this.updateUrlButton());
  }

  /** Toggle the Cache: reuse a note's existing audio, or render it again. */
  private toggleCache(): void {
    this.setCache(!this.plugin.settings.playNoteSavedAudio);
  }

  private setCache(on: boolean): void {
    if (this.plugin.settings.playNoteSavedAudio !== on) {
      this.plugin.settings.playNoteSavedAudio = on;
      void this.plugin.saveSettings();
    }
    this.updateCacheButton();
  }

  /** Toggle whether saving an MP3 also embeds an audio player in the note. */
  private toggleEmbed(): void {
    this.plugin.settings.autoEmbedAudio = !this.plugin.settings.autoEmbedAudio;
    void this.plugin.saveSettings();
    this.updateEmbedButton();
  }

  /** Resync the provider/voice selectors and the toggle buttons. */
  private refreshControls(): void {
    if (!this.providerSelect) {
      return;
    }
    this.providerSelect.value = this.plugin.settings.TTS_PROVIDER;
    this.populateVoiceOptions();
    this.updateCodeButton();
    this.updateAcronymButton();
    this.updateUrlButton();
    this.updateEmbedButton();
    this.updateCacheButton();
    this.updateDownloadButton();
  }

  /**
   * Rebuild the voice dropdown from the active provider's catalog, grouped by
   * language into <optgroup>s so large catalogs (e.g. Azure's full voice list)
   * stay navigable.
   */
  private populateVoiceOptions(): void {
    this.voiceSelect.empty();
    const provider = this.provider();
    groupVoicesByLanguage(provider.getVoiceOptions()).forEach((group) => {
      const optgroup = this.voiceSelect.createEl("optgroup", {
        attr: { label: group.label },
      });
      group.voices.forEach((voice) => {
        optgroup.createEl("option", { value: voice.id, text: voice.label });
      });
    });
    this.voiceSelect.value = provider.getVoice();
  }

  /**
   * Public hook so the plugin can resync the player's selectors/toggles after
   * settings change elsewhere (e.g. a freshly fetched voice catalog from the
   * settings tab's "Test Credentials").
   */
  syncControls(): void {
    this.refreshControls();
  }

  private updateCodeButton(): void {
    if (!this.codeBtn) {
      return;
    }
    const on = this.plugin.getActiveProfile().content.codeBlocks === "read";
    this.codeBtn.toggleClass("is-active", on);
    this.codeBtn.setAttribute("aria-pressed", String(on));
    this.codeBtn.setAttribute(
      "aria-label",
      on ? "Read code blocks: on" : "Read code blocks: off",
    );
  }

  private updateAcronymButton(): void {
    if (!this.acronymBtn) {
      return;
    }
    const on = this.plugin.getActiveProfile().content.acronyms === "spell";
    this.acronymBtn.toggleClass("is-active", on);
    this.acronymBtn.setAttribute("aria-pressed", String(on));
    this.acronymBtn.setAttribute(
      "aria-label",
      on ? "Spell out acronyms: on" : "Spell out acronyms: off",
    );
  }

  private updateUrlButton(): void {
    if (!this.urlBtn) {
      return;
    }
    const on = this.plugin.getActiveProfile().content.urls === "skip";
    this.urlBtn.toggleClass("is-active", on);
    this.urlBtn.setAttribute("aria-pressed", String(on));
    this.urlBtn.setAttribute(
      "aria-label",
      on ? "Skip website URLs: on" : "Skip website URLs: off",
    );
  }

  private updateEmbedButton(): void {
    if (!this.embedBtn) {
      return;
    }
    const on = this.plugin.settings.autoEmbedAudio;
    this.embedBtn.toggleClass("is-active", on);
    this.embedBtn.setAttribute("aria-pressed", String(on));
    this.embedBtn.setAttribute(
      "aria-label",
      on ? "Embed MP3 in note: on" : "Embed MP3 in note: off",
    );
  }

  private updateCacheButton(): void {
    if (!this.cacheBtn) {
      return;
    }
    const on = this.plugin.settings.playNoteSavedAudio;
    this.cacheBtn.toggleClass("is-active", on);
    this.cacheBtn.setAttribute("aria-pressed", String(on));
    this.cacheBtn.setAttribute(
      "aria-label",
      on
        ? "Cache: on — play reuses this note's audio"
        : "Cache: off — the next play generates new audio",
    );
  }

  /**
   * Enable the download button when there is generated audio for the active
   * note (its tap saves that audio). The folder button is also enabled when a
   * saved chapter is loaded, so that chapter can be moved to another folder.
   * Both grey out when there's nothing to act on.
   */
  private updateDownloadButton(): void {
    if (!this.downloadBtn) {
      return;
    }
    const active = this.app.workspace.getActiveFile();
    const hasGeneratedAudio = active
      ? this.provider().getLastGeneratedAudio(active.path) !== null
      : false;
    const hasLoadedChapter = this.currentChapterPath !== null;

    // Keep the button interactive (no native `disabled`, no pointer-events:none)
    // so a hold still opens the folder picker with no audio; just dim it to hint
    // a plain tap has nothing to save.
    this.downloadBtn.disabled = false;
    this.downloadBtn.toggleClass("is-muted", !hasGeneratedAudio);

    // Folder button works for both saving fresh audio and moving a chapter.
    const folderEnabled = hasGeneratedAudio || hasLoadedChapter;
    this.folderBtn.disabled = !folderEnabled;
    this.folderBtn.toggleClass("is-disabled", !folderEnabled);

    const hasDefault = this.plugin.settings.defaultAudioFolder.trim() !== "";

    // Download button: a floppy-disk icon signals "save to the default folder",
    // the download arrow signals "save next to the note". Only swap on change.
    if (hasDefault !== this.downloadShowsSave) {
      this.downloadShowsSave = hasDefault;
      setVoiceIcon(this.downloadBtn, hasDefault ? "save" : "download");
    }
    this.downloadBtn.setAttribute(
      "aria-label",
      hasDefault
        ? `Save to default folder (${this.plugin.settings.defaultAudioFolder})`
        : "Save next to the note",
    );

    // Tint the folder button when a default folder is set, so it's clear one is
    // configured. Its tooltip stays the descriptive save/move text set at
    // creation — the button always opens the picker regardless of the default.
    this.folderBtn.toggleClass("is-active", hasDefault);
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
    this.updateTitle();

    const active = this.app.workspace.getActiveFile();

    // Collect every folder in the vault that holds at least one MP3.
    const audioFiles = this.app.vault
      .getFiles()
      .filter((f) => isAudioExtension(f.extension));
    this.folders = listMp3Folders(audioFiles.map((f) => f.path));

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
        : audioFilesInFolder(this.app.vault, folderPath).map((f) => f.path);
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
    this.closeChapterActions();
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

      // How many bookmarks the file has (once known); a tap opens the list.
      const badge = item.createEl("button", {
        cls: "voice-player-chapter-marks",
        attr: { "aria-label": "Show bookmarks" },
      });
      setVoiceIcon(badge, "bookmark");
      badge.createSpan({ cls: "voice-player-chapter-marks-count" });
      this.registerDomEvent(badge, "click", (evt) => {
        evt.stopPropagation();
        this.toggleBookmarks(chapter.path);
      });

      // Actions control: opens a small bar over this row with Delete / Move /
      // Rename for this track. Stops propagation so it doesn't play.
      const actionsBtn = item.createDiv({
        cls: "voice-player-chapter-edit",
        attr: { "aria-label": "Track actions" },
      });
      setVoiceIcon(actionsBtn, "more");
      this.registerDomEvent(actionsBtn, "click", (evt) => {
        evt.stopPropagation();
        this.openChapterActions(item, chapter);
      });
    });
    this.highlightCurrentChapter();
    this.renderBookmarkList();
  }

  /**
   * Show a small action bar laid over the chapter row with Bookmarks / Delete
   * / Move / Rename for that track, so the actions clearly belong to that
   * file. Only one bar is open at a time; clicking elsewhere or pressing
   * Escape closes it.
   */
  private openChapterActions(item: HTMLElement, chapter: ChapterFile): void {
    // Order left → right: Bookmarks, Delete, Move, Rename. Delete sits next to
    // the faded file name; Rename at the screen edge.
    this.openActionBar(item, (addBtn, bar) => {
      if (isMp3Path(chapter.path)) {
        // Toggles the list; highlighted while it is open.
        addBtn("Bookmarks", () => {
          this.closeChapterActions();
          this.toggleBookmarks(chapter.path);
        }).toggleClass("is-active", this.expandedPath === chapter.path);
      }
      addBtn("Delete", () => this.showDeleteConfirm(bar, chapter)).addClass(
        "mod-warning",
      );
      addBtn("Move", () => {
        this.closeChapterActions();
        void this.moveChapter(chapter);
      });
      addBtn("Rename", () => {
        this.closeChapterActions();
        this.beginRenameChapter(item, chapter);
      });
    });
  }

  /** Lay an action bar over a row (a chapter or a bookmark). */
  private openActionBar(
    row: HTMLElement,
    build: (
      addBtn: (label: string, onClick: () => void) => HTMLButtonElement,
      bar: HTMLElement,
    ) => void,
  ): void {
    this.closeChapterActions();

    const bar = row.createDiv({ cls: "voice-player-chapter-actions" });
    const addBtn = (label: string, onClick: () => void): HTMLButtonElement => {
      const btn = bar.createEl("button", {
        cls: "voice-player-chapter-action",
        text: label,
      });
      btn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        onClick();
      });
      return btn;
    };
    build(addBtn, bar);

    this.openActionsEl = bar;

    // Close on outside click / Escape. Deferred so the opening click finishes.
    const onDocClick = (evt: MouseEvent) => {
      if (!(evt.target instanceof Node) || !bar.contains(evt.target)) {
        this.closeChapterActions();
      }
    };
    const onKey = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") {
        this.closeChapterActions();
      }
    };
    window.setTimeout(() => {
      activeDocument.addEventListener("click", onDocClick, true);
      activeDocument.addEventListener("keydown", onKey, true);
    }, 0);
    this.chapterActionsCleanup = () => {
      activeDocument.removeEventListener("click", onDocClick, true);
      activeDocument.removeEventListener("keydown", onKey, true);
    };
  }

  /** Remove the open chapter action bar and its listeners, if any. */
  private closeChapterActions(): void {
    if (this.chapterActionsCleanup) {
      this.chapterActionsCleanup();
      this.chapterActionsCleanup = null;
    }
    this.openActionsEl?.remove();
    this.openActionsEl = null;
  }

  /** Replace the action bar with a short "Delete this track?" confirmation. */
  private showDeleteConfirm(bar: HTMLElement, chapter: ChapterFile): void {
    bar.empty();
    bar.createSpan({
      cls: "voice-player-chapter-confirm",
      text: "Delete this track?",
    });
    const del = bar.createEl("button", {
      cls: "voice-player-chapter-action",
      text: "Delete",
    });
    del.addClass("mod-warning");
    this.registerDomEvent(del, "click", (evt) => {
      evt.stopPropagation();
      this.closeChapterActions();
      void this.deleteChapter(chapter);
    });
    const cancel = bar.createEl("button", {
      cls: "voice-player-chapter-action",
      text: "Cancel",
    });
    this.registerDomEvent(cancel, "click", (evt) => {
      evt.stopPropagation();
      this.closeChapterActions();
    });
  }

  /** Open the folder picker for a single chapter and move it there. */
  private async moveChapter(chapter: ChapterFile): Promise<void> {
    await this.plugin.iconEventHandler.handleDownloadAudio({
      forcePicker: true,
      moveFromPath: chapter.path,
    });
    this.refreshContext();
  }

  /** Delete a chapter's MP3 (after confirmation) and refresh the list. */
  private async deleteChapter(chapter: ChapterFile): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(chapter.path);
    if (file instanceof TFile) {
      try {
        // Move to the user's preferred trash (system bin or .trash).
        await this.app.fileManager.trashFile(file);
        new Notice(`Deleted: ${chapter.name}`);
      } catch (error) {
        new Notice(
          `Could not delete: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (this.currentChapterPath === chapter.path) {
      this.currentChapterPath = null;
      this.updateTitle();
    }
    this.refreshContext();
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

  // --- Bookmarks ---
  // Stored in the MP3s by the plugin's BookmarkStore; the player adds them
  // (button), marks them on the scrubber, and lists them below a chapter.

  /** The saved file loaded in the player, if any. */
  getLoadedChapterPath(): string | null {
    return this.audio().currentSrc !== "" ? this.currentChapterPath : null;
  }

  /** Whether `path` is loaded and playing (its bookmarks wait to be written). */
  isPlayingFile(path: string): boolean {
    return this.currentChapterPath === path && !this.audio().paused;
  }

  /**
   * The loaded file was rewritten (its bookmarks were saved): load it again
   * at the same position, so it doesn't read the changed file mid-stream.
   * Files are written while paused; resumed during the write, it goes on.
   */
  reloadFile(path: string): void {
    const file = this.app.vault.getAbstractFileByPath(path);
    const audio = this.audio();
    if (
      this.currentChapterPath !== path ||
      !(file instanceof TFile) ||
      audio.currentSrc === ""
    ) {
      return;
    }
    const position = audio.currentTime;
    const rate = audio.playbackRate;
    const wasPlaying = !audio.paused;
    audio.src = this.app.vault.getResourcePath(file);
    audio.addEventListener(
      "loadedmetadata",
      () => {
        audio.currentTime = position;
        audio.playbackRate = rate;
        if (wasPlaying) {
          void audio.play();
        }
      },
      { once: true },
    );
  }

  /** Open a file's bookmark list (after adding one), highlighting `id`. */
  showBookmarks(path: string, id?: string): void {
    if (!this.chapters.some((c) => c.path === path)) {
      return;
    }
    this.expandedPath = path;
    this.renderBookmarkList(id);
  }

  private toggleBookmarks(path: string): void {
    this.expandedPath = this.expandedPath === path ? null : path;
    this.renderBookmarkList();
  }

  /**
   * Redraw the open bookmark list below its chapter, and the bookmark count
   * on every chapter whose bookmarks are known.
   */
  private renderBookmarkList(highlightId?: string): void {
    if (!this.chaptersListEl) {
      return;
    }
    const store = this.plugin.bookmarks;
    this.chaptersListEl
      .querySelectorAll<HTMLElement>(".voice-player-chapter")
      .forEach((row) => {
        const path = row.getAttribute("data-path") ?? "";
        const count = store.peek(path)?.length ?? 0;
        const badge = row.querySelector<HTMLElement>(
          ".voice-player-chapter-marks",
        );
        badge?.toggleClass("is-visible", count > 0);
        badge?.toggleClass("is-open", this.expandedPath === path);
        badge
          ?.querySelector(".voice-player-chapter-marks-count")
          ?.setText(`${count}`);
      });

    this.chaptersListEl.querySelector(".voice-player-bookmarks")?.remove();
    const path = this.expandedPath;
    const row = path
      ? this.chaptersListEl.querySelector<HTMLElement>(
          `.voice-player-chapter[data-path="${CSS.escape(path)}"]`,
        )
      : null;
    if (!path || !row) {
      return;
    }
    const listEl = createDiv({ cls: "voice-player-bookmarks" });
    row.after(listEl);

    const target = { kind: "file" as const, path };
    const list = store.get(target);
    if (list === null) {
      listEl
        .createDiv({ cls: "voice-player-bookmarks-empty" })
        .setText("Reading bookmarks…");
      return;
    }
    if (list.length === 0) {
      listEl
        .createDiv({ cls: "voice-player-bookmarks-empty" })
        .setText(
          "No bookmarks yet. While listening, tap the bookmark button to mark a spot.",
        );
      return;
    }
    for (const bookmark of list) {
      const item = listEl.createDiv({
        cls: "voice-player-bookmark",
        attr: { "data-id": bookmark.id },
      });
      setVoiceIcon(item, "bookmark");
      item
        .createSpan({ cls: "voice-player-bookmark-name" })
        .setText(bookmark.title);
      item
        .createSpan({ cls: "voice-player-bookmark-time" })
        .setText(formatClock(bookmark.startMs / 1000));
      item.addEventListener("click", () => this.jumpTo(path, bookmark));

      const more = item.createDiv({
        cls: "voice-player-chapter-edit",
        attr: { "aria-label": "Bookmark actions" },
      });
      setVoiceIcon(more, "more");
      more.addEventListener("click", (evt) => {
        evt.stopPropagation();
        this.openActionBar(item, (addBtn) => {
          addBtn("Delete", () => {
            this.closeChapterActions();
            void this.plugin.deleteBookmark(target, bookmark);
          }).addClass("mod-warning");
          addBtn("Rename", () => {
            this.closeChapterActions();
            this.beginRenameBookmark(item, path, bookmark);
          });
        });
      });

      if (bookmark.id === highlightId) {
        item.addClass("is-new");
        item.scrollIntoView({ block: "nearest" });
      }
    }
    this.highlightPassedBookmark();
  }

  /** Rename a bookmark in place: Enter / leaving the field saves, Esc cancels. */
  private beginRenameBookmark(
    item: HTMLElement,
    path: string,
    bookmark: Bookmark,
  ): void {
    const nameEl = item.querySelector<HTMLElement>(
      ".voice-player-bookmark-name",
    );
    if (!nameEl) {
      return;
    }
    const input = createEl("input", {
      cls: "voice-player-chapter-rename",
      attr: { type: "text", "aria-label": "Bookmark name" },
    });
    input.value = bookmark.title;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    let settled = false;
    const finish = (save: boolean) => {
      if (settled) return;
      settled = true;
      if (save && input.value.trim() && input.value !== bookmark.title) {
        void this.plugin.bookmarks.rename(
          { kind: "file", path },
          bookmark.id,
          input.value,
        );
      } else {
        this.renderBookmarkList();
      }
    };
    input.addEventListener("click", (evt) => evt.stopPropagation());
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        finish(true);
      } else if (evt.key === "Escape") {
        evt.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
  }

  /** Play a file from a bookmark (loading the file if needed). */
  private jumpTo(path: string, bookmark: Bookmark): void {
    const seconds = bookmark.startMs / 1000;
    if (this.getLoadedChapterPath() === path) {
      this.audio().currentTime = seconds;
      void this.provider().playAudio();
      return;
    }
    this.playChapter(path, seconds);
  }

  /** Mark the bookmark the playing file last passed. */
  private highlightPassedBookmark(): void {
    const listEl = this.chaptersListEl?.querySelector(
      ".voice-player-bookmarks",
    );
    if (!listEl) {
      return;
    }
    const loaded = this.getLoadedChapterPath();
    const list =
      loaded && loaded === this.expandedPath
        ? (this.plugin.bookmarks.peek(loaded) ?? [])
        : [];
    const ms = this.audio().currentTime * 1000;
    const passed = list.filter((b) => b.startMs <= ms + 250).pop();
    listEl
      .querySelectorAll<HTMLElement>(".voice-player-bookmark")
      .forEach((el) =>
        el.toggleClass("is-current", el.getAttribute("data-id") === passed?.id),
      );
  }

  /** Draw the loaded audio's bookmarks on the scrubber. */
  private renderMarks(duration: number): void {
    const target = this.plugin.bookmarkTarget();
    const list = target ? (this.plugin.bookmarks.get(target) ?? []) : [];
    const key = `${Math.floor(duration)}|${list
      .map((b) => `${b.id}:${b.startMs}:${b.title}`)
      .join(",")}`;
    if (key === this.marksKey) {
      return;
    }
    this.marksKey = key;
    this.marksEl.empty();
    for (const { bookmark, share } of bookmarkPositions(list, duration)) {
      const mark = this.marksEl.createEl("button", {
        cls: "voice-player-mark",
        attr: {
          "aria-label": `${bookmark.title} · ${formatClock(bookmark.startMs / 1000)}`,
        },
      });
      mark.setCssProps({ "--voice-mark-pos": `${share}` });
      mark.addEventListener("click", () => {
        this.audio().currentTime = bookmark.startMs / 1000;
      });
    }
  }

  /**
   * Load a saved file into the player and play it, from `startAt` seconds if
   * given. False when it can't be loaded now.
   */
  private playChapter(path: string, startAt?: number): boolean {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return false;
    }
    // The audio element is playing (or about to play) the reading being
    // generated; loading a file would cut it off.
    if (this.plugin.isGenerating()) {
      this.plugin.notifyStillGenerating();
      return false;
    }
    const audio = this.audio();
    audio.src = this.app.vault.getResourcePath(file);
    if (startAt !== undefined) {
      audio.addEventListener(
        "loadedmetadata",
        () => {
          audio.currentTime = startAt;
        },
        { once: true },
      );
    }
    this.currentChapterPath = path;
    void this.provider().playAudio();
    this.highlightCurrentChapter();
    // Reflect the playing chapter in the header instead of the active note.
    this.updateTitle();
    // The file played before is free now: write its bookmarks.
    void this.plugin.bookmarks.flush();
    return true;
  }

  /**
   * Title shows the loaded chapter's name while one is playing, otherwise the
   * active note (or a placeholder when none is open).
   */
  private updateTitle(): void {
    if (!this.titleEl) {
      return;
    }
    if (this.currentChapterPath) {
      this.titleEl.setText(chapterName(this.currentChapterPath));
      return;
    }
    const active = this.app.workspace.getActiveFile();
    this.titleEl.setText(active ? active.basename : "Voice player");
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
    setVoiceIcon(
      this.repeatBtn,
      this.repeatMode === "one" ? "repeat-one" : "repeat",
    );
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

    // The provider reports the buffered length while a reading streams.
    const total = provider.getDuration();
    const duration = Number.isFinite(total) ? total : 0;
    const currentTime = isNaN(audio.currentTime) ? 0 : audio.currentTime;

    if (!this.isScrubbing) {
      this.scrubberEl.max = `${Math.floor(duration)}`;
      this.scrubberEl.value = `${Math.floor(currentTime)}`;
      this.currentTimeEl.setText(formatClock(currentTime));
    }
    this.durationEl.setText(formatClock(duration));

    this.speedEl.setText(`${provider.getSpeed().toFixed(1)}×`);

    this.renderMarks(duration);
    this.highlightPassedBookmark();
    this.bookmarkBtn.toggleClass(
      "is-muted",
      this.plugin.bookmarkTarget() === null,
    );
    // Bookmarks of a playing file are written once it pauses.
    const playing = provider.isPlaying();
    if (this.wasPlaying && !playing) {
      void this.plugin.bookmarks.flush();
    }
    this.wasPlaying = playing;

    // Loading feedback while a note is being synthesized: grow the bottom bar to
    // the synthesis progress and fill the ring around the play button.
    const loading = provider.isOperationInProgress();
    this.loadingBarEl.toggleClass("is-visible", loading);
    // The play button itself never moves: it sits inside a ring that fills
    // with the synthesis progress, or spins a short arc while no progress is
    // known yet. A tap plays what is ready, then pauses/resumes.
    this.playPauseBtn.toggleClass("voice-generating", loading);
    if (loading) {
      const pct = Math.round(provider.getProgress() * 100);
      this.loadingFillEl.setCssProps({ "--voice-progress": `${pct}%` });
      this.playRingEl.toggleClass("is-indeterminate", pct <= 0);
      this.playRingValueEl.setAttribute(
        "stroke-dasharray",
        `${pct <= 0 ? 22 : pct} 100`,
      );
      setVoiceIcon(this.playPauseBtn, provider.isPlaying() ? "pause" : "play");
    } else {
      setVoiceIcon(this.playPauseBtn, provider.isPlaying() ? "pause" : "play");
    }

    // Keep the selectors/toggles in sync if settings changed elsewhere.
    if (this.providerSelect.value !== this.plugin.settings.TTS_PROVIDER) {
      this.refreshControls();
    } else {
      this.voiceSelect.value = provider.getVoice();
      this.updateCodeButton();
      this.updateAcronymButton();
      this.updateUrlButton();
      this.updateEmbedButton();
      this.updateCacheButton();
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

/** Whether a path is an MP3 (only MP3s hold bookmarks). */
function isMp3Path(path: string): boolean {
  return path.toLowerCase().endsWith(".mp3");
}
