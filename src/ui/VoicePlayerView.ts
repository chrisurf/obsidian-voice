import { ItemView, WorkspaceLeaf, TFile, setIcon } from "obsidian";
import type { Voice } from "../utils/VoicePlugin";
import { listChapters, type ChapterFile } from "../utils/chapters";

export const VIEW_TYPE_VOICE_PLAYER = "voice-player-view";

const MIN_SPEED = 0.5;
const MAX_SPEED = 2.0;

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
  private speedEl: HTMLElement;
  private chaptersListEl: HTMLElement;

  private isScrubbing = false;
  private currentChapterPath: string | null = null;

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

    // Secondary row: read note + speed
    const secondary = root.createDiv({ cls: "voice-player-secondary" });

    const readBtn = secondary.createEl("button", {
      cls: "voice-player-read",
      text: "Read this note",
    });
    this.registerDomEvent(readBtn, "click", () => void this.plugin.speakText());

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
    } else if (this.audio().src) {
      void provider.playAudio();
    } else {
      // Nothing loaded yet → synthesize the current note.
      void this.plugin.speakText();
    }
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
    const chapters = listChapters(mp3Paths);

    this.subtitleEl.setText(
      chapters.length === 1 ? "1 chapter" : `${chapters.length} chapters`,
    );
    this.renderChapters(chapters);
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
