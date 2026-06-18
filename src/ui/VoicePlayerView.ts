import { ItemView, WorkspaceLeaf, TFile, setIcon } from "obsidian";
import type { Voice } from "../utils/VoicePlugin";
import { listChapters, type ChapterFile } from "../utils/chapters";

export const VIEW_TYPE_VOICE_PLAYER = "voice-player-view";

const MIN_SPEED = 0.5;
const MAX_SPEED = 2.0;

type RepeatMode = "none" | "one" | "all";

/**
 * VoicePlayerView - a collapsible audiobook-style player.
 *
 * On desktop it lives in the right sidebar; on mobile it opens as a
 * full-screen pane. It binds to the active speech provider's audio element
 * (polling, so provider swaps and chapter playback are handled uniformly) and
 * offers transport controls, a scrubber, speed, and a "chapters" list built
 * from the MP3 files in the active note's folder.
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

  private isScrubbing = false;
  private currentChapterPath: string | null = null;
  private chapters: ChapterFile[] = [];
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

    // Transport
    const transport = root.createDiv({ cls: "voice-player-transport" });

    this.prevTrackBtn = transport.createDiv({
      cls: "voice-player-btn voice-player-track",
      attr: { "aria-label": "Previous track" },
    });
    setIcon(this.prevTrackBtn, "skip-back");
    this.registerDomEvent(this.prevTrackBtn, "click", () =>
      this.playPrevTrack(),
    );

    const rewindBtn = transport.createDiv({
      cls: "voice-player-btn voice-player-skip",
    });
    setIcon(rewindBtn, "rewind");
    rewindBtn
      .createSpan({ cls: "voice-player-skip-label" })
      .setText(`${this.plugin.settings.rewindSeconds}`);
    this.registerDomEvent(rewindBtn, "click", () =>
      this.provider().rewindAudio(),
    );

    this.playPauseBtn = transport.createDiv({
      cls: "voice-player-btn voice-player-play",
    });
    setIcon(this.playPauseBtn, "play");
    this.registerDomEvent(this.playPauseBtn, "click", () => this.togglePlay());

    const forwardBtn = transport.createDiv({
      cls: "voice-player-btn voice-player-skip",
    });
    setIcon(forwardBtn, "fast-forward");
    forwardBtn
      .createSpan({ cls: "voice-player-skip-label" })
      .setText(`${this.plugin.settings.forwardSeconds}`);
    this.registerDomEvent(forwardBtn, "click", () =>
      this.provider().fastForwardAudio(),
    );

    this.nextTrackBtn = transport.createDiv({
      cls: "voice-player-btn voice-player-track",
      attr: { "aria-label": "Next track" },
    });
    setIcon(this.nextTrackBtn, "skip-forward");
    this.registerDomEvent(this.nextTrackBtn, "click", () =>
      this.playNextTrack(),
    );

    // Secondary row: read note + speed
    const secondary = root.createDiv({ cls: "voice-player-secondary" });

    const readBtn = secondary.createEl("button", {
      cls: "voice-player-read",
      text: "Read this note",
    });
    this.registerDomEvent(readBtn, "click", () => void this.plugin.speakText());

    // Save the generated audio as an MP3 in the note's folder so it shows up
    // as a chapter (same behaviour as the status bar / mobile download button).
    const downloadBtn = secondary.createEl("button", {
      cls: "voice-player-download",
      attr: { "aria-label": "Download as MP3" },
    });
    setIcon(downloadBtn, "download");
    this.registerDomEvent(
      downloadBtn,
      "click",
      () => void this.downloadAudio(),
    );

    // Repeat: cycle off → repeat one → repeat all → off.
    this.repeatBtn = secondary.createEl("button", {
      cls: "voice-player-repeat",
    });
    this.registerDomEvent(this.repeatBtn, "click", () => this.cycleRepeat());
    this.updateRepeatButton();

    const speedGroup = secondary.createDiv({ cls: "voice-player-speed" });
    const slower = speedGroup.createDiv({ cls: "voice-player-speed-btn" });
    setIcon(slower, "minus");
    this.registerDomEvent(slower, "click", () => this.changeSpeed(-0.1));
    this.speedEl = speedGroup.createSpan({ cls: "voice-player-speed-value" });
    const faster = speedGroup.createDiv({ cls: "voice-player-speed-btn" });
    setIcon(faster, "plus");
    this.registerDomEvent(faster, "click", () => this.changeSpeed(0.1));

    // Chapters
    const chapters = root.createDiv({ cls: "voice-player-chapters" });
    chapters
      .createDiv({ cls: "voice-player-chapters-title" })
      .setText("Chapters");
    this.chaptersListEl = chapters.createDiv({
      cls: "voice-player-chapters-list",
    });
  }

  private togglePlay(): void {
    const provider = this.provider();
    if (provider.isPlaying()) {
      provider.pauseAudio();
    } else if (this.audio().currentSrc) {
      // A chapter or previously synthesized note is loaded → resume it.
      // (Note: audio.src resolves an empty value to the page URL, so we check
      // currentSrc, which is "" until a real media resource is selected.)
      void provider.playAudio();
    } else {
      // Nothing loaded yet → read the currently open note.
      void this.plugin.speakText();
    }
  }

  /**
   * Persist the generated audio for the active note as an MP3 in its folder
   * and embed it, then refresh so it appears in the chapter list. Reuses the
   * shared download flow so behaviour matches the status bar / mobile button.
   */
  private async downloadAudio(): Promise<void> {
    await this.plugin.iconEventHandler.handleDownloadAudio();
    this.refreshContext();
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

  /** Refresh the title and the chapter list from the active note. */
  private refreshContext(): void {
    if (!this.titleEl) {
      return;
    }
    const active = this.app.workspace.getActiveFile();
    this.titleEl.setText(active ? active.basename : "Voice player");

    const mp3Paths =
      active?.parent?.children
        .filter((f) => f instanceof TFile && f.extension === "mp3")
        .map((f) => f.path) ?? [];
    this.chapters = listChapters(mp3Paths);

    this.subtitleEl.setText(
      this.chapters.length === 1
        ? "1 chapter"
        : `${this.chapters.length} chapters`,
    );
    this.renderChapters(this.chapters);
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
    });
    this.highlightCurrentChapter();
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

    setIcon(this.playPauseBtn, provider.isPlaying() ? "pause" : "play");
    this.speedEl.setText(`${provider.getSpeed().toFixed(1)}×`);

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
