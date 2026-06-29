import { App, setIcon, Menu } from "obsidian";
import { Voice } from "./VoicePlugin";
import type { SpeechProvider } from "../service/SpeechProvider";
import { VIEW_TYPE_VOICE_PLAYER } from "../ui/VoicePlayerView";
import { attachPressGesture } from "./pressGesture";

export class MobileControlBar {
  private app: App;
  private plugin: Voice;
  private pollyService: SpeechProvider;
  private containerEl: HTMLElement | null = null;
  private isVisible: boolean = false;
  private playPauseIconEl: HTMLElement | null = null;
  private downloadIconEl: HTMLElement | null = null;
  private speedDisplayEl: HTMLElement | null = null;
  private progressBarContainer: HTMLElement | null = null;
  private progressBar: HTMLElement | null = null;
  private isErrorState: boolean = false;
  // Tracks whether the download icon currently shows the save (floppy) glyph.
  private downloadShowsSave = false;

  constructor(app: App, plugin: Voice, pollyService: SpeechProvider) {
    this.app = app;
    this.plugin = plugin;
    this.pollyService = pollyService;
    this.createOverlayBar();
    this.initializeEventListeners();

    // Listen for file changes to update download button visibility
    this.app.workspace.on("active-leaf-change", () => {
      this.updateDownloadButtonVisibility();
    });
  }

  private createOverlayBar(): void {
    // Create overlay container (styling lives in styles.css)
    this.containerEl = activeDocument.body.createDiv({
      cls: "voice-mobile-overlay",
    });

    // Add control buttons
    this.addControlButtons();

    // Initially hidden
    this.hide();
  }

  private addControlButtons(): void {
    if (!this.containerEl) return;

    // Progress bar (at the top, initially hidden)
    this.createProgressBar();

    // Create controls wrapper
    const controlsWrapper = this.containerEl.createDiv({
      cls: "voice-mobile-controls",
    });

    // Open the full player UI (switch from this compact bar to the player view)
    this.createControlButton(
      controlsWrapper,
      "audio-lines",
      "Open player",
      () => void this.plugin.activatePlayerView(),
    );

    // Voice Switcher
    this.createControlButton(
      controlsWrapper,
      "mic",
      "Change Voice",
      (event: MouseEvent) => {
        const menu = new Menu();

        this.pollyService.getVoiceOptions().forEach((voice) => {
          menu.addItem((item) =>
            item
              .setTitle(voice.label)
              .setChecked(voice.id === this.pollyService.getVoice())
              .onClick(() => void this.selectVoice(voice.id)),
          );
        });

        menu.showAtMouseEvent(event);
      },
    );

    // Download MP3 button (initially hidden). Tap saves; hold (custom mode)
    // opens the folder picker. Both go through the shared handler so desktop
    // and mobile behave identically. The plain click is handled by the gesture.
    this.downloadIconEl = this.createControlButton(
      controlsWrapper,
      "download",
      "Download Audio",
      () => {},
    );
    this.downloadIconEl.addClass("voice-hidden"); // Initially hidden
    attachPressGesture(this.downloadIconEl, {
      onTap: () => void this.plugin.iconEventHandler.handleDownloadAudio(),
      onHold: () =>
        void this.plugin.iconEventHandler.handleDownloadAudio({
          forcePicker: true,
        }),
    });

    // Rewind button
    this.createControlButton(
      controlsWrapper,
      "rewind",
      `Rewind ${this.plugin.settings.rewindSeconds} seconds`,
      () => this.pollyService.rewindAudio(),
    );

    // Stop button
    this.createControlButton(controlsWrapper, "square", "Stop", () => {
      if (this.pollyService.isOperationInProgress()) {
        this.pollyService.cancelOperation();
        this.resetToPlayState();
        this.hideProgressBar();
        // Hide overlay after stop
        window.setTimeout(() => this.hide(), 3000);
        return; // EXIT - don't do anything else
      }
      this.pollyService.stopAudio();
      // Hide overlay after stop
      window.setTimeout(() => this.hide(), 3000);
    });

    // Speed controls group
    const speedGroup = controlsWrapper.createDiv({
      cls: "voice-mobile-speed-group",
    });

    // Slower button
    this.createControlButton(speedGroup, "minus", "Slower", () =>
      this.decreaseSpeed(),
    );

    // Speed display
    this.speedDisplayEl = speedGroup.createDiv({
      cls: "voice-mobile-speed-display",
    });
    this.updateSpeedDisplay();

    // Faster button
    this.createControlButton(speedGroup, "plus", "Faster", () =>
      this.increaseSpeed(),
    );

    // Play/Pause button (emphasized)
    this.playPauseIconEl = this.createControlButton(
      controlsWrapper,
      "play",
      "Play/Pause",
      () => {
        if (this.pollyService.isOperationInProgress()) {
          this.pollyService.cancelOperation();
          this.resetToPlayState();
          this.hideProgressBar();
          return; // CRITICAL: EXIT - don't start new request
        }

        if (!this.pollyService.isPlaying()) {
          this.showLoadingState();
        }
        void this.plugin.speakText();
      },
    );
    this.playPauseIconEl?.addClass("voice-mobile-primary-btn");

    // Fast-forward button
    this.createControlButton(
      controlsWrapper,
      "fast-forward",
      `Fast-forward ${this.plugin.settings.forwardSeconds} seconds`,
      () => this.pollyService.fastForwardAudio(),
    );
  }

  private async selectVoice(voiceId: string): Promise<void> {
    await this.plugin.persistActiveVoice(voiceId);
  }

  private createControlButton(
    parent: HTMLElement,
    icon: string,
    title: string,
    onClick: (e: MouseEvent) => void,
  ): HTMLElement {
    const button = parent.createEl("button", {
      cls: "voice-mobile-control-btn",
      attr: { title },
    });

    setIcon(button, icon);
    button.addEventListener("click", onClick);

    return button;
  }

  private createProgressBar(): void {
    if (!this.containerEl) return;

    this.progressBarContainer = this.containerEl.createDiv({
      cls: "voice-mobile-progress-container",
    });

    this.progressBar = this.progressBarContainer.createDiv({
      cls: "voice-mobile-progress-bar",
    });

    // Initially hidden
    this.hideProgressBar();
  }

  private updateSpeedDisplay(): void {
    if (this.speedDisplayEl) {
      const currentSpeed = this.pollyService.getSpeed();
      this.speedDisplayEl.textContent = `${currentSpeed.toFixed(1)}x`;
    }
  }

  private decreaseSpeed(): void {
    const currentSpeed = this.pollyService.getSpeed();
    const newSpeed = Math.max(0.5, Math.round((currentSpeed - 0.1) * 10) / 10);

    if (newSpeed !== currentSpeed) {
      this.pollyService.setSpeed(newSpeed);
      this.plugin.settings.SPEED = newSpeed;
      void this.plugin.saveSettings();
      this.updateSpeedDisplay();
    }
  }

  private increaseSpeed(): void {
    const currentSpeed = this.pollyService.getSpeed();
    const newSpeed = Math.min(1.9, Math.round((currentSpeed + 0.1) * 10) / 10);

    if (newSpeed !== currentSpeed) {
      this.pollyService.setSpeed(newSpeed);
      this.plugin.settings.SPEED = newSpeed;
      void this.plugin.saveSettings();
      this.updateSpeedDisplay();
    }
  }

  private showLoadingState(): void {
    if (this.playPauseIconEl) {
      this.playPauseIconEl.addClass("rotating-icon");
      setIcon(this.playPauseIconEl, "refresh-ccw");
    }
    this.showProgressBar();
    this.updateProgressBar(0);
  }

  private resetToPlayState(): void {
    if (this.playPauseIconEl) {
      this.playPauseIconEl.removeClass("rotating-icon");
      setIcon(this.playPauseIconEl, "play");
    }
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
      this.progressBar.setCssProps({ "--voice-progress": `${percentage}%` });
    }
  }

  private initializeEventListeners(): void {
    const audio = this.pollyService.getAudio();
    audio.addEventListener("play", () => this.onPlay());
    audio.addEventListener("pause", () => this.onPause());
    audio.addEventListener("ended", () => this.onEnded());
    audio.addEventListener("canplaythrough", () => this.onCanPlayThrough());

    // Note: Progress and error callbacks are handled by IconEventHandler
    // to avoid conflicts and ensure both desktop and mobile are updated
  }

  private onPlay(): void {
    if (this.playPauseIconEl) {
      this.playPauseIconEl.removeClass("rotating-icon");
      setIcon(this.playPauseIconEl, "pause");
    }
    this.hideProgressBar();
    this.show(); // Keep overlay visible during playback
    // Show download button when audio is successfully generated
    this.showDownloadButton();
  }

  private onPause(): void {
    if (this.playPauseIconEl) {
      this.playPauseIconEl.removeClass("rotating-icon");
      setIcon(this.playPauseIconEl, "play");
    }
    this.hideProgressBar();

    // Auto-hide after 3 seconds when paused, but only if not playing
    window.setTimeout(() => {
      if (!this.pollyService.isPlaying()) {
        this.hide();
      }
    }, 3000);
  }

  private onCanPlayThrough(): void {
    this.hideProgressBar();
  }

  private onEnded(): void {
    if (this.playPauseIconEl) {
      this.playPauseIconEl.removeClass("rotating-icon");
      setIcon(this.playPauseIconEl, "play");
    }
    this.hideProgressBar();
    // Hide overlay when audio ends
    window.setTimeout(() => this.hide(), 3000);
  }

  private handleError(): void {
    this.showErrorState();
    this.resetToPlayState();

    // Auto-hide error after 3 seconds
    window.setTimeout(() => {
      this.hideProgressBar();
    }, 3000);
  }

  /**
   * Whether the new player view is currently open. When it is, this compact
   * bar must stay hidden so the two control surfaces never show at once.
   */
  private isPlayerViewOpen(): boolean {
    return (
      this.app.workspace.getLeavesOfType(VIEW_TYPE_VOICE_PLAYER).length > 0
    );
  }

  show(): void {
    // The new player view replaces this bar; never show both at once.
    if (this.isPlayerViewOpen()) {
      return;
    }
    if (this.containerEl && !this.isVisible) {
      this.containerEl.addClass("is-visible");
      this.isVisible = true;
    }
  }

  hide(): void {
    if (this.containerEl && this.isVisible) {
      this.containerEl.removeClass("is-visible");
      this.isVisible = false;
    }
  }

  public showLoadingStateFromExternal(): void {
    this.show();
    this.showLoadingState();
  }

  public updateProgressFromExternal(progress: number): void {
    this.updateProgressBar(progress);
  }

  public handleErrorFromExternal(): void {
    // Mobile implementation focuses on visual feedback rather than error messages
    this.handleError();
  }

  /**
   * Show the download button
   */
  private showDownloadButton(): void {
    if (this.downloadIconEl) {
      this.downloadIconEl.removeClass("voice-hidden");
    }
  }

  /**
   * Hide the download button
   */
  private hideDownloadButton(): void {
    if (this.downloadIconEl) {
      this.downloadIconEl.addClass("voice-hidden");
    }
  }

  /**
   * Update download button visibility based on cached audio
   */
  public updateDownloadButtonVisibility(): void {
    this.updateSaveIcon();

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      this.hideDownloadButton();
      return;
    }

    // Check if cached audio exists for this file
    const audioBlob = this.pollyService.getLastGeneratedAudio(activeFile.path);
    if (audioBlob) {
      this.showDownloadButton();
    } else {
      this.hideDownloadButton();
    }
  }

  /**
   * Show a floppy-disk (save) glyph when a default folder is set, otherwise the
   * download arrow — mirroring the player and status bar. Only swaps on change.
   */
  public updateSaveIcon(): void {
    if (!this.downloadIconEl) {
      return;
    }
    const hasDefault = this.plugin.settings.defaultAudioFolder.trim() !== "";
    if (hasDefault === this.downloadShowsSave) {
      return;
    }
    this.downloadShowsSave = hasDefault;
    setIcon(this.downloadIconEl, hasDefault ? "save" : "download");
  }

  destroy(): void {
    // Remove event listeners
    const audio = this.pollyService.getAudio();
    audio.removeEventListener("play", () => this.onPlay());
    audio.removeEventListener("pause", () => this.onPause());
    audio.removeEventListener("ended", () => this.onEnded());
    audio.removeEventListener("canplaythrough", () => this.onCanPlayThrough());

    // Remove overlay element
    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
    }
  }
}
