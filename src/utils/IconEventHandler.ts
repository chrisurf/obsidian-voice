import { Plugin, setIcon } from "obsidian";
import { Voice } from "./VoicePlugin";
import { AwsPollyService } from "../service/AwsPollyService";

export class IconEventHandler {
  private pollyService: AwsPollyService;
  private plugin: Plugin;
  private voice: Voice;
  private statusBarItem: HTMLElement;
  private ribbonIconEl: HTMLElement;
  private playPauseIconEl: HTMLElement;
  private onPlayListener = () => this.onPlay();
  private onPauseListener = () => this.onPause();

  constructor(plugin: Plugin, voice: Voice, pollyService: AwsPollyService) {
    this.plugin = plugin;
    this.voice = voice;
    this.pollyService = pollyService;

    this.initStatusBarItem();
    this.initRibbonIcon();
  }

  private initStatusBarItem(): void {
    this.statusBarItem = this.plugin.addStatusBarItem();
    this.createStatusBarIcon("rewind", "rewind", () =>
      this.pollyService.rewindAudio()
    );
    this.createStatusBarIcon("square", "stop", () =>
      this.pollyService.stopAudio()
    );

    this.playPauseIconEl = this.createStatusBarIcon(
      "play",
      "play",
      () => {
        if (!this.pollyService.isPlaying()) {
          this.playPauseIconEl.addClass("rotating-icon");
          setIcon(this.playPauseIconEl, "refresh-ccw");
        }
        this.voice.speakText();
      },
      true
    );

    this.createStatusBarIcon("fast-forward", "fast-forward", () =>
      this.pollyService.fastForwardAudio()
    );
  }

  private createStatusBarIcon(
    icon: string,
    cls: string,
    onClick: () => void,
    isPlayPauseIcon: boolean = false
  ): HTMLElement {
    const iconEl = this.statusBarItem.createEl("span", {
      cls: "status-bar-icon " + cls,
    });
    iconEl.style.marginRight = "5px";
    setIcon(iconEl, icon);
    iconEl.addEventListener("click", onClick);

    if (isPlayPauseIcon) {
      this.playPauseIconEl = iconEl;
    }

    return iconEl;
  }

  private initRibbonIcon(): void {
    this.ribbonIconEl = this.plugin.addRibbonIcon("play-circle", "Voice", () =>
      this.voice.speakText()
    );
    this.initializeEventListeners();
  }

  private initializeEventListeners(): void {
    const audio = this.pollyService.getAudio();
    audio.addEventListener("play", this.onPlayListener);
    audio.addEventListener("pause", this.onPauseListener);
  }

  public removeEventListeners(): void {
    const audio = this.pollyService.getAudio();
    audio.removeEventListener("play", this.onPlayListener);
    audio.removeEventListener("pause", this.onPauseListener);
  }

  ribbonIconHandler() {
    if (!this.ribbonIconEl) {
      console.error("Ribbon icon element is not initialized.");
      return;
    }

    if (!this.pollyService.isPlaying()) {
      this.ribbonIconEl.addClass("rotating-icon");
      this.playPauseIconEl.addClass("rotating-icon");
      setIcon(this.ribbonIconEl, "refresh-ccw");
      setIcon(this.playPauseIconEl, "refresh-ccw");
    }
  }

  private onPlay(): void {
    if (this.ribbonIconEl) {
      this.ribbonIconEl.removeClass("rotating-icon");
      setIcon(this.ribbonIconEl, "pause-circle");
    }
    if (this.playPauseIconEl) {
      this.playPauseIconEl.removeClass("rotating-icon");
      setIcon(this.playPauseIconEl, "pause");
    }
  }

  private onPause(): void {
    if (this.ribbonIconEl) {
      this.ribbonIconEl.removeClass("rotating-icon");
      setIcon(this.ribbonIconEl, "play-circle");
    }
    if (this.playPauseIconEl) {
      this.playPauseIconEl.removeClass("rotating-icon");
      setIcon(this.playPauseIconEl, "play");
    }
  }
}
