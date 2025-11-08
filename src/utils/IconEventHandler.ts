import { Plugin, setIcon, Notice } from "obsidian";
import { Voice } from "./VoicePlugin";
import { AwsPollyService } from "../service/AwsPollyService";

export class IconEventHandler {
  private pollyService: AwsPollyService;
  private plugin: Plugin;
  private voice: Voice;
  private statusBarItem: HTMLElement;
  private ribbonIconEl: HTMLElement;
  private playPauseIconEl: HTMLElement;
  private speedDisplayEl: HTMLElement;
  private progressBarContainer: HTMLElement;
  private progressBar: HTMLElement;
  private isErrorState: boolean = false;
  private onPlayListener = () => this.onPlay();
  private onPauseListener = () => this.onPause();
  private onCanPlayThroughListener = () => this.onCanPlayThrough();

  constructor(plugin: Plugin, voice: Voice, pollyService: AwsPollyService) {
    this.plugin = plugin;
    this.voice = voice;
    this.pollyService = pollyService;

    this.addSpeedControlStyles();
    this.addProgressBarStyles();
    this.initStatusBarItem();
    this.initRibbonIcon();

    // Set up progress callback for AWS Polly loading
    this.pollyService.setProgressCallback((progress: number) => {
      this.updateProgressBar(progress);
    });

    // Set up error callback for AWS Polly errors
    this.pollyService.setErrorCallback((error: string) => {
      this.handleError(error);
    });
  }

  private initStatusBarItem(): void {
    this.statusBarItem = this.plugin.addStatusBarItem();

    // Add separator before voice controls to separate from other plugins
    this.addVoiceControlsSeparator();

    // Progress bar (initially hidden)
    this.createProgressBar();

    // Order: rewind, stop, slower, current speed, faster, play, fast-forward

    // Rewind
    this.createStatusBarIcon("rewind", "rewind", () =>
      this.pollyService.rewindAudio(),
    );

    // Stop
    this.createStatusBarIcon("square", "stop", () =>
      this.pollyService.stopAudio(),
    );

    // Speed controls group
    this.addSpeedControls();

    // Play/Pause
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
      true,
    );

    // Fast-forward
    this.createStatusBarIcon("fast-forward", "fast-forward", () =>
      this.pollyService.fastForwardAudio(),
    );

    // Add separator after all voice controls to separate from other plugins
    this.addVoiceControlsSeparator();

    // Set initial speed display
    setTimeout(() => {
      this.updateSpeedDisplay();
    }, 100);
  }

  private createStatusBarIcon(
    icon: string,
    cls: string,
    onClick: () => void,
    isPlayPauseIcon: boolean = false,
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
      this.voice.speakText(),
    );
    this.initializeEventListeners();
  }

  private initializeEventListeners(): void {
    const audio = this.pollyService.getAudio();
    audio.addEventListener("play", this.onPlayListener);
    audio.addEventListener("pause", this.onPauseListener);
    audio.addEventListener("canplaythrough", this.onCanPlayThroughListener);
  }

  public removeEventListeners(): void {
    const audio = this.pollyService.getAudio();
    audio.removeEventListener("play", this.onPlayListener);
    audio.removeEventListener("pause", this.onPauseListener);
    audio.removeEventListener("canplaythrough", this.onCanPlayThroughListener);
  }

  public updateSpeedDisplayFromSettings(): void {
    this.updateSpeedDisplay();
  }

  ribbonIconHandler() {
    if (!this.ribbonIconEl) {
      console.error("Ribbon icon element is not initialized.");
      return;
    }

    if (!this.pollyService.isPlaying()) {
      // Clear any previous error state
      this.isErrorState = false;

      this.ribbonIconEl.addClass("rotating-icon");
      this.playPauseIconEl.addClass("rotating-icon");
      setIcon(this.ribbonIconEl, "refresh-ccw");
      setIcon(this.playPauseIconEl, "refresh-ccw");

      // Show progress bar when loading starts
      this.showProgressBar();
      this.updateProgressBar(0);
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
    // Hide progress bar when audio starts playing
    this.hideProgressBar();
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
    // Hide progress bar when audio is paused
    this.hideProgressBar();
  }

  private addSpeedControls(): void {
    // Add decrease speed button (slower)
    this.createStatusBarIcon("minus", "speed-decrease", () =>
      this.decreaseSpeed(),
    );

    // Add speed display
    this.speedDisplayEl = this.statusBarItem.createEl("span", {
      cls: "status-bar-speed-display",
    });
    this.speedDisplayEl.style.marginLeft = "4px";
    this.speedDisplayEl.style.marginRight = "4px";
    this.speedDisplayEl.style.minWidth = "30px";
    this.speedDisplayEl.style.textAlign = "center";
    this.speedDisplayEl.style.fontSize = "11px";
    this.speedDisplayEl.style.fontWeight = "500";
    this.speedDisplayEl.style.color = "var(--text-normal)";
    this.updateSpeedDisplay();

    // Add increase speed button (faster)
    this.createStatusBarIcon("plus", "speed-increase", () =>
      this.increaseSpeed(),
    );
  }

  private updateSpeedDisplay(): void {
    if (this.speedDisplayEl) {
      const currentSpeed = this.pollyService.getSpeed();
      this.speedDisplayEl.textContent = `${currentSpeed.toFixed(1)}x`;
      this.speedDisplayEl.title = `Current playback speed: ${currentSpeed.toFixed(1)}x`;
    }
  }

  private decreaseSpeed(): void {
    const currentSpeed = this.pollyService.getSpeed();
    const newSpeed = Math.max(0.5, Math.round((currentSpeed - 0.1) * 10) / 10);

    if (newSpeed !== currentSpeed) {
      this.pollyService.setSpeed(newSpeed);
      this.voice.settings.SPEED = newSpeed;
      this.voice.saveSettings();
      this.updateSpeedDisplay();
    }
  }

  private increaseSpeed(): void {
    const currentSpeed = this.pollyService.getSpeed();
    const newSpeed = Math.min(1.9, Math.round((currentSpeed + 0.1) * 10) / 10);

    if (newSpeed !== currentSpeed) {
      this.pollyService.setSpeed(newSpeed);
      this.voice.settings.SPEED = newSpeed;
      this.voice.saveSettings();
      this.updateSpeedDisplay();
    }
  }

  private addVoiceControlsSeparator(): void {
    // Add separator after all voice controls to separate from other plugins
    const separator = this.statusBarItem.createEl("span", {
      cls: "status-bar-separator",
    });
    separator.style.marginLeft = "8px";
    separator.style.marginRight = "8px";
    separator.style.color = "var(--text-muted)";
    separator.textContent = "|";
  }

  private addSpeedControlStyles(): void {
    // Check if styles already added
    if (document.getElementById("voice-speed-control-styles")) return;

    const style = document.createElement("style");
    style.id = "voice-speed-control-styles";
    style.textContent = `
      .status-bar-speed-display {
        background: var(--background-modifier-hover);
        border-radius: 3px;
        padding: 2px 6px;
        font-variant-numeric: tabular-nums;
        transition: background-color 0.2s ease;
      }
      
      .status-bar-speed-display:hover {
        background: var(--background-modifier-active-hover);
      }
      
      .status-bar-icon.speed-decrease,
      .status-bar-icon.speed-increase {
        opacity: 0.8;
        transition: opacity 0.2s ease, transform 0.1s ease;
      }
      
      .status-bar-icon.speed-decrease:hover,
      .status-bar-icon.speed-increase:hover {
        opacity: 1;
        transform: scale(1.1);
      }
      
      .status-bar-icon.speed-decrease:active,
      .status-bar-icon.speed-increase:active {
        transform: scale(0.95);
      }
      
      .status-bar-separator {
        opacity: 0.3;
        user-select: none;
      }
    `;
    document.head.appendChild(style);
  }

  private addProgressBarStyles(): void {
    const style = document.createElement("style");
    style.textContent = `
      .voice-progress-bar-container {
        display: none;
        width: 100px;
        height: 4px;
        background: var(--background-modifier-border);
        border-radius: 2px;
        margin: 0 8px;
        overflow: hidden;
        position: relative;
        align-self: center;
      }
      
      .voice-progress-bar {
        height: 100%;
        width: 0%;
        background: var(--interactive-accent);
        border-radius: 2px;
        transition: width 0.3s ease, background-color 0.3s ease;
      }
      
      .voice-progress-bar-container.visible {
        display: block;
      }
      
      .voice-progress-bar-container.error {
        background: var(--background-modifier-error);
      }
      
      .voice-progress-bar-container.error .voice-progress-bar {
        background: var(--text-error);
        width: 100% !important;
      }
    `;
    document.head.appendChild(style);
  }

  private createProgressBar(): void {
    this.progressBarContainer = this.statusBarItem.createEl("div", {
      cls: "voice-progress-bar-container",
    });

    this.progressBar = this.progressBarContainer.createEl("div", {
      cls: "voice-progress-bar",
    });

    // Initially hidden
    this.hideProgressBar();
  }

  private showProgressBar(): void {
    if (this.progressBarContainer) {
      this.progressBarContainer.addClass("visible");
      this.progressBarContainer.removeClass("error");
      this.isErrorState = false;
    }
  }

  private hideProgressBar(): void {
    if (this.progressBarContainer) {
      this.progressBarContainer.removeClass("visible");
      this.progressBarContainer.removeClass("error");
      this.isErrorState = false;
    }
  }

  private showErrorState(): void {
    if (this.progressBarContainer) {
      this.progressBarContainer.addClass("visible");
      this.progressBarContainer.addClass("error");
      this.isErrorState = true;
    }
  }

  private updateProgressBar(progress: number): void {
    if (this.progressBar && !this.isErrorState) {
      const percentage = Math.min(100, Math.max(0, progress * 100));
      this.progressBar.style.width = `${percentage}%`;
    }
  }

  private handleError(errorMessage: string): void {
    // Show error state in progress bar
    this.showErrorState();

    // Reset spinning icons back to play state
    this.resetIconsToPlayState();

    // Show error notification to user
    new Notice(`🔊 Voice Plugin: ${errorMessage}`, 5000);

    // Auto-hide error after 3 seconds
    setTimeout(() => {
      this.hideProgressBar();
    }, 3000);
  }

  private resetIconsToPlayState(): void {
    if (this.ribbonIconEl) {
      this.ribbonIconEl.removeClass("rotating-icon");
      setIcon(this.ribbonIconEl, "play-circle");
    }
    if (this.playPauseIconEl) {
      this.playPauseIconEl.removeClass("rotating-icon");
      setIcon(this.playPauseIconEl, "play");
    }
  }

  private onCanPlayThrough(): void {
    // Hide progress bar when audio is ready to play
    this.hideProgressBar();
  }
}
