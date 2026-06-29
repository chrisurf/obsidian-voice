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
  chapterName,
  listChapters,
  listMp3Folders,
  normalizeFolderPath,
  type ChapterFile,
  type Mp3Folder,
} from "../utils/chapters";
import { attachPressGesture } from "../utils/pressGesture";
import { noteAudioPath } from "../utils/audioFolders";
import { groupVoicesByLanguage } from "../service/voiceCatalog";

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
  private folderBtn: HTMLButtonElement;
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
  // The open per-chapter action bar (Move / Rename / Delete) and a disposer for
  // its outside-click / Escape listeners, if one is currently shown.
  private openActionsEl: HTMLElement | null = null;
  private chapterActionsCleanup: (() => void) | null = null;

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
        "aria-label": "Play / pause — hold to regenerate",
        title: "Tap: play, pause or cancel · Hold: regenerate from scratch",
      },
    });
    setIcon(this.playPauseBtn, "play");
    // One button does it all: a tap plays / pauses (and cancels an in-progress
    // synthesis); a short hold regenerates the note from scratch with the
    // current voice and settings (this replaces the separate Regenerate button).
    // Uses the same hold duration as the save button so the two feel alike.
    attachPressGesture(this.playPauseBtn, {
      onTap: () => this.togglePlay(),
      onHold: () => this.regenerate(),
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

    // Controls row: download + folder + repeat + speed, then the on/off
    // toggles (code / acronyms / embed), spread evenly across the row.
    const secondary = root.createDiv({ cls: "voice-player-secondary" });

    // Save the generated audio as an MP3 so it shows up as a chapter. Tap saves
    // (to the default folder, or next to the note); holding it — or
    // right-clicking — opens the folder picker. Same gesture as the status bar /
    // mobile download button.
    this.downloadBtn = secondary.createEl("button", {
      cls: "voice-player-download",
      attr: { "aria-label": "Download as MP3" },
    });
    setIcon(this.downloadBtn, "download");
    attachPressGesture(this.downloadBtn, {
      onTap: () => void this.downloadAudio(),
      onHold: () => void this.downloadAudio({ forcePicker: true }),
    });

    // Save to custom folder: one click opens the folder picker and saves the
    // audio to the folder you choose (you can also pin a default there). A
    // discoverable alternative to holding the download button.
    this.folderBtn = secondary.createEl("button", {
      cls: "voice-player-folder-btn",
      attr: {
        "aria-label": "Save to custom folder",
        title: "Save to a folder you choose (and optionally pin it as default)",
      },
    });
    setIcon(this.folderBtn, "folder-open");
    this.registerDomEvent(this.folderBtn, "click", () =>
      this.saveToCustomFolder(),
    );

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

    // On/off toggles: read code blocks, spell out acronyms, skip URLs, embed
    // MP3. They sit in the same row as the action controls, spread evenly
    // across its width.
    this.codeBtn = secondary.createEl("button", { cls: "voice-player-toggle" });
    setIcon(this.codeBtn, "code");
    this.registerDomEvent(this.codeBtn, "click", () => this.toggleCodeBlocks());

    this.acronymBtn = secondary.createEl("button", {
      cls: "voice-player-toggle",
    });
    setIcon(this.acronymBtn, "case-sensitive");
    this.registerDomEvent(this.acronymBtn, "click", () =>
      this.toggleAcronyms(),
    );

    this.urlBtn = secondary.createEl("button", {
      cls: "voice-player-toggle",
    });
    setIcon(this.urlBtn, "unlink");
    this.registerDomEvent(this.urlBtn, "click", () => this.toggleSkipUrls());

    this.embedBtn = secondary.createEl("button", {
      cls: "voice-player-toggle",
    });
    setIcon(this.embedBtn, "paperclip");
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

    const active = this.app.workspace.getActiveFile();
    const activeNote = active && active.extension === "md" ? active : null;

    // "Play the note's saved audio" (default on): a tap always plays the note
    // you're viewing — its already-saved MP3 if one exists, otherwise a fresh
    // render — even when a different chapter is currently loaded. This is what
    // makes jumping between notes pick up each note's saved audio. Holding the
    // play button (regenerate) still forces a fresh render.
    if (this.plugin.settings.playNoteSavedAudio && activeNote) {
      this.playActiveNote(activeNote);
      return;
    }

    // Toggle off: resume the loaded audio while it still matches what the
    // player is showing. (audio.src resolves an empty value to the page URL, so
    // we check currentSrc, which is "" until a real media resource is selected.)
    if (this.audio().currentSrc && !this.loadedAudioIsStale()) {
      void provider.playAudio();
      return;
    }

    // Nothing loaded, or the loaded audio was generated for a different note
    // than the one now open → read the active note instead of replaying the
    // previous one (issue #59).
    this.readActiveNoteFresh();
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
    const path = normalizePath(
      noteAudioPath(
        this.plugin.settings.defaultAudioFolder,
        active.parent?.path ?? "",
        active.basename,
      ),
    );
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
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
   * Regenerate the current note from scratch (the play button's hold). Always
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
    this.updateTitle();
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

  /** Toggle whether acronyms (NASA, API) are spelled out letter by letter. */
  private toggleAcronyms(): void {
    this.plugin.settings.spellOutAcronyms =
      !this.plugin.settings.spellOutAcronyms;
    void this.plugin.saveSettings();
    this.plugin.reinitializeTextSpeaker();
    this.updateAcronymButton();
  }

  /** Toggle whether website URLs are skipped (link labels are kept). */
  private toggleSkipUrls(): void {
    this.plugin.settings.skipUrls = !this.plugin.settings.skipUrls;
    void this.plugin.saveSettings();
    this.plugin.reinitializeTextSpeaker();
    this.updateUrlButton();
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
    const on = this.plugin.settings.readCodeBlocks;
    this.codeBtn.toggleClass("is-active", on);
    this.codeBtn.setAttribute(
      "aria-label",
      on ? "Read code blocks: on" : "Read code blocks: off",
    );
  }

  private updateAcronymButton(): void {
    if (!this.acronymBtn) {
      return;
    }
    const on = this.plugin.settings.spellOutAcronyms;
    this.acronymBtn.toggleClass("is-active", on);
    this.acronymBtn.setAttribute(
      "aria-label",
      on ? "Spell out acronyms: on" : "Spell out acronyms: off",
    );
  }

  private updateUrlButton(): void {
    if (!this.urlBtn) {
      return;
    }
    const on = this.plugin.settings.skipUrls;
    this.urlBtn.toggleClass("is-active", on);
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
    this.embedBtn.setAttribute(
      "aria-label",
      on ? "Embed MP3 in note: on" : "Embed MP3 in note: off",
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

    this.downloadBtn.disabled = !hasGeneratedAudio;
    this.downloadBtn.toggleClass("is-disabled", !hasGeneratedAudio);

    // Folder button works for both saving fresh audio and moving a chapter.
    const folderEnabled = hasGeneratedAudio || hasLoadedChapter;
    this.folderBtn.disabled = !folderEnabled;
    this.folderBtn.toggleClass("is-disabled", !folderEnabled);

    const hasDefault = this.plugin.settings.defaultAudioFolder.trim() !== "";

    // Download button: a floppy-disk icon signals "save to the default folder",
    // the download arrow signals "save next to the note". Only swap on change.
    if (hasDefault !== this.downloadShowsSave) {
      this.downloadShowsSave = hasDefault;
      setIcon(this.downloadBtn, hasDefault ? "save" : "download");
    }
    this.downloadBtn.setAttribute(
      "aria-label",
      hasDefault
        ? `Save to default folder (${this.plugin.settings.defaultAudioFolder})`
        : "Save next to the note",
    );

    // Tint the folder button when a default folder is set, so it's clear a tap
    // saves into that folder rather than next to the note.
    this.folderBtn.toggleClass("is-active", hasDefault);
    this.folderBtn.setAttribute(
      "aria-label",
      hasDefault
        ? `Save to default folder (${this.plugin.settings.defaultAudioFolder})`
        : "Save to custom folder",
    );
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

      // Actions control: opens a small bar over this row with Delete / Move /
      // Rename for this track. Stops propagation so it doesn't play.
      const actionsBtn = item.createDiv({
        cls: "voice-player-chapter-edit",
        attr: { "aria-label": "Track actions" },
      });
      setIcon(actionsBtn, "more-vertical");
      this.registerDomEvent(actionsBtn, "click", (evt) => {
        evt.stopPropagation();
        this.openChapterActions(item, chapter);
      });
    });
    this.highlightCurrentChapter();
  }

  /**
   * Show a small action bar laid over the chapter row with Delete / Move /
   * Rename for that track, so the actions clearly belong to that file. Only one
   * bar is open at a time; clicking elsewhere or pressing Escape closes it.
   */
  private openChapterActions(item: HTMLElement, chapter: ChapterFile): void {
    this.closeChapterActions();

    const bar = item.createDiv({ cls: "voice-player-chapter-actions" });
    const addBtn = (label: string, onClick: () => void): HTMLButtonElement => {
      const btn = bar.createEl("button", {
        cls: "voice-player-chapter-action",
        text: label,
      });
      this.registerDomEvent(btn, "click", (evt) => {
        evt.stopPropagation();
        onClick();
      });
      return btn;
    };

    // Order left → right: Delete, Move, Rename. Delete is left-most (next to the
    // faded file name); Rename sits at the screen edge.
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

    this.openActionsEl = bar;

    // Close on outside click / Escape. Deferred so the opening click finishes.
    const onDocClick = (evt: MouseEvent) => {
      if (!bar.contains(evt.target as Node)) {
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
        // fileManager.trashFile() needs a newer Obsidian than minAppVersion.
        // eslint-disable-next-line obsidianmd/prefer-file-manager-trash-file
        await this.app.vault.delete(file);
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
    // Reflect the playing chapter in the header instead of the active note.
    this.updateTitle();
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

    // Keep the selectors/toggles in sync if settings changed elsewhere.
    if (this.providerSelect.value !== this.plugin.settings.TTS_PROVIDER) {
      this.refreshControls();
    } else {
      this.voiceSelect.value = provider.getVoice();
      this.updateCodeButton();
      this.updateAcronymButton();
      this.updateEmbedButton();
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
