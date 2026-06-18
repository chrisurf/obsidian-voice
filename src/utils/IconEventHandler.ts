import { Plugin, setIcon, Notice, Menu } from "obsidian";
import { Voice } from "./VoicePlugin";
import type { SpeechProvider } from "../service/SpeechProvider";
import { MobileControlBar } from "./MobileControlBar";
import { AudioFileManager } from "./AudioFileManager";

export class IconEventHandler {
  private pollyService: SpeechProvider;
  private plugin: Plugin;
  private voice: Voice;
  private statusBarItem: HTMLElement;
  private voiceDisplayEl: HTMLElement;
  private ribbonIconEl: HTMLElement;
  private playPauseIconEl: HTMLElement;
  private downloadIconEl: HTMLElement;
  private rewindIconEl: HTMLElement;
  private fastForwardIconEl: HTMLElement;
  private speedDisplayEl: HTMLElement;
  private progressBarContainer: HTMLElement;
  private progressBar: HTMLElement;
  private isErrorState: boolean = false;
  private mobileControlBar?: MobileControlBar;
  private audioFileManager: AudioFileManager;
  private onPlayListener = () => this.onPlay();
  private onPauseListener = () => this.onPause();
  private onCanPlayThroughListener = () => this.onCanPlayThrough();

  constructor(plugin: Plugin, voice: Voice, pollyService: SpeechProvider) {
    this.plugin = plugin;
    this.voice = voice;
    this.pollyService = pollyService;
    this.audioFileManager = new AudioFileManager(plugin.app);

    this.initStatusBarItem();
    this.initRibbonIcon();

    // Initialize mobile control bar if on mobile
    if (this.voice.isMobile()) {
      this.mobileControlBar = new MobileControlBar(
        this.plugin.app,
        this.voice,
        this.pollyService,
      );
    }

    // Wire progress/error callbacks to the active provider
    this.registerProviderCallbacks();

    // Listen for file changes to update download button visibility
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("active-leaf-change", () => {
        this.updateDownloadButtonVisibility();
      }),
    );
  }

  /**
   * Register progress and error callbacks on the active provider. Called on
   * construction and whenever the provider is swapped.
   */
  private registerProviderCallbacks(): void {
    this.pollyService.setProgressCallback((progress: number) => {
      this.updateProgressBar(progress);
      // Also update mobile progress bar if on mobile
      if (this.mobileControlBar) {
        this.mobileControlBar.updateProgressFromExternal(progress);
      }
    });

    this.pollyService.setErrorCallback((error: string) => {
      this.handleError(error);
      // Also handle mobile errors if on mobile
      if (this.mobileControlBar) {
        this.mobileControlBar.handleErrorFromExternal();
      }
    });
  }

  /**
   * Swap the active speech provider (e.g. when the user changes the TTS
   * provider in settings). Re-attaches audio listeners, callbacks, and the
   * mobile control bar to the new provider's audio element.
   */
  public setProvider(provider: SpeechProvider): void {
    // Detach from the previous provider's audio element + mobile bar
    this.removeEventListeners();
    this.pollyService = provider;
    // Re-attach audio listeners to the new provider's audio element
    this.initializeEventListeners();
    this.registerProviderCallbacks();
    // Recreate the mobile control bar bound to the new provider
    if (this.voice.isMobile()) {
      this.mobileControlBar = new MobileControlBar(
        this.plugin.app,
        this.voice,
        this.pollyService,
      );
    }
    this.updateVoiceDisplay();
  }

  private createVoiceSwitcher(): void {
    this.voiceDisplayEl = this.statusBarItem.createSpan({
      cls: "voice-statusbar-voice-switcher",
    });
    this.voiceDisplayEl.setAttribute("aria-label", "Change Voice");
    this.voiceDisplayEl.setAttribute("aria-label-position", "top");

    this.updateVoiceDisplay();

    this.voiceDisplayEl.addEventListener("click", (event) => {
      const menu = new Menu();

      this.pollyService.getVoiceOptions().forEach((voice) => {
        menu.addItem((item) =>
          item
            .setTitle(voice.label)
            .setChecked(voice.id === this.pollyService.getVoice())
            .onClick(() => void this.voice.persistActiveVoice(voice.id)),
        );
      });

      menu.showAtMouseEvent(event);
    });
  }

  public updateVoiceDisplay(): void {
    if (this.voiceDisplayEl) {
      this.voiceDisplayEl.setText(this.getActiveVoiceLabel());
    }
  }

  /**
   * Refresh the rewind/fast-forward control tooltips to reflect the currently
   * configured skip intervals.
   */
  public updateSkipTooltips(): void {
    if (this.rewindIconEl) {
      this.rewindIconEl.title = `Rewind ${this.voice.settings.rewindSeconds} seconds`;
    }
    if (this.fastForwardIconEl) {
      this.fastForwardIconEl.title = `Fast-forward ${this.voice.settings.forwardSeconds} seconds`;
    }
  }

  /**
   * Short display name for the current voice (provider-aware). Falls back to
   * the raw voice id when no catalog label is available.
   */
  private getActiveVoiceLabel(): string {
    const id = this.pollyService.getVoice();
    const option = this.pollyService.getVoiceOptions().find((v) => v.id === id);
    if (option) {
      return option.label.split(" (")[0];
    }
    return id || "";
  }

  private initStatusBarItem(): void {
    this.statusBarItem = this.plugin.addStatusBarItem();

    // Add separator before voice controls to separate from other plugins
    this.addVoiceControlsSeparator();

    // Voice Switcher
    this.createVoiceSwitcher();

    // Progress bar (initially hidden)
    this.createProgressBar();

    // Order: rewind, stop, slower, current speed, faster, play, fast-forward

    // Rewind
    this.rewindIconEl = this.createStatusBarIcon(
      "rewind",
      "rewind",
      () => this.pollyService.rewindAudio(),
      false,
      `Rewind ${this.voice.settings.rewindSeconds} seconds`,
    );

    // Stop
    this.createStatusBarIcon(
      "square",
      "stop",
      () => {
        // If operation is in progress, cancel it
        if (this.pollyService.isOperationInProgress()) {
          this.pollyService.cancelOperation();
          this.resetIconsToPlayState();
          this.hideProgressBar();
          return; // EXIT - don't do anything else
        }
        // Otherwise just stop audio playback
        this.pollyService.stopAudio();
      },
      false,
      "Stop audio",
    );

    // Speed controls group
    this.addSpeedControls();

    // Play/Pause
    this.playPauseIconEl = this.createStatusBarIcon(
      "play",
      "play",
      () => {
        // If operation is in progress, cancel it
        if (this.pollyService.isOperationInProgress()) {
          this.pollyService.cancelOperation();
          this.resetIconsToPlayState();
          this.hideProgressBar();
          return; // CRITICAL: EXIT - don't start new request
        }

        if (!this.pollyService.isPlaying()) {
          this.playPauseIconEl.addClass("rotating-icon");
          setIcon(this.playPauseIconEl, "refresh-ccw");
        }
        void this.voice.speakText();
      },
      true,
      "Play / Pause",
    );

    // Fast-forward
    this.fastForwardIconEl = this.createStatusBarIcon(
      "fast-forward",
      "fast-forward",
      () => this.pollyService.fastForwardAudio(),
      false,
      `Fast-forward ${this.voice.settings.forwardSeconds} seconds`,
    );

    // Download MP3 (initially hidden)
    this.downloadIconEl = this.createStatusBarIcon(
      "download",
      "download-audio",
      () => void this.handleDownloadAudio(),
      false,
      "Download audio as MP3",
    );
    this.downloadIconEl.addClass("voice-hidden"); // Initially hidden

    // Add separator after all voice controls to separate from other plugins
    this.addVoiceControlsSeparator();

    // Set initial speed display
    window.setTimeout(() => {
      this.updateSpeedDisplay();
    }, 100);
  }

  private createStatusBarIcon(
    icon: string,
    cls: string,
    onClick: () => void,
    isPlayPauseIcon: boolean = false,
    tooltip?: string,
  ): HTMLElement {
    const iconEl = this.statusBarItem.createSpan({
      cls: "status-bar-icon " + cls,
    });
    setIcon(iconEl, icon);
    iconEl.addEventListener("click", onClick);

    // Use native browser tooltip (title) - it can escape container boundaries
    // Unlike Obsidian's tooltips which get clipped by status bar overflow
    if (tooltip) {
      iconEl.title = tooltip;
    }

    if (isPlayPauseIcon) {
      this.playPauseIconEl = iconEl;
    }

    return iconEl;
  }

  private initRibbonIcon(): void {
    this.ribbonIconEl = this.plugin.addRibbonIcon(
      "play-circle",
      "Voice read text",
      () => {
        // If operation is in progress, cancel it
        if (this.pollyService.isOperationInProgress()) {
          this.pollyService.cancelOperation();
          this.resetIconsToPlayState();
          this.hideProgressBar();
          if (this.mobileControlBar) {
            this.mobileControlBar.hide();
          }
          return; // CRITICAL: EXIT - don't start new request
        }

        // Only trigger loading state if not already playing
        if (!this.pollyService.isPlaying()) {
          this.ribbonIconHandler();
        }
        void this.voice.speakText();
      },
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

    // Cleanup mobile control bar
    if (this.mobileControlBar) {
      this.mobileControlBar.destroy();
      this.mobileControlBar = undefined;
    }
  }

  public updateSpeedDisplayFromSettings(): void {
    this.updateSpeedDisplay();

    // Update mobile control bar speed display if on mobile
    if (this.mobileControlBar) {
      // The mobile control bar will update its own speed display through event listeners
    }
  }

  /**
   * Hide the mobile control bar, if present. Used when opening the player view
   * so the compact bar and the player are never shown at the same time.
   */
  public hideMobileControlBar(): void {
    if (this.mobileControlBar) {
      this.mobileControlBar.hide();
    }
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

      // Show mobile overlay when loading starts (mobile only)
      if (this.mobileControlBar) {
        this.mobileControlBar.showLoadingStateFromExternal();
      } else {
        // Show progress bar for desktop
        this.showProgressBar();
        this.updateProgressBar(0);
      }
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
    // Show download button when audio is successfully generated
    this.showDownloadButton();
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
    this.createStatusBarIcon(
      "minus",
      "speed-decrease",
      () => this.decreaseSpeed(),
      false,
      "Decrease speed",
    );

    // Add speed display
    this.speedDisplayEl = this.statusBarItem.createSpan({
      cls: "status-bar-speed-display",
    });
    this.updateSpeedDisplay();

    // Add increase speed button (faster)
    this.createStatusBarIcon(
      "plus",
      "speed-increase",
      () => this.increaseSpeed(),
      false,
      "Increase speed",
    );
  }

  private updateSpeedDisplay(): void {
    if (this.speedDisplayEl) {
      const currentSpeed = this.pollyService.getSpeed();
      this.speedDisplayEl.textContent = `${currentSpeed.toFixed(1)}x`;
      this.speedDisplayEl.title = `Current playback speed: ${currentSpeed.toFixed(1)}x`;
    }
  }

  public decreaseSpeed(): void {
    const currentSpeed = this.pollyService.getSpeed();
    const newSpeed = Math.max(0.5, Math.round((currentSpeed - 0.1) * 10) / 10);

    if (newSpeed !== currentSpeed) {
      this.pollyService.setSpeed(newSpeed);
      this.voice.settings.SPEED = newSpeed;
      void this.voice.saveSettings();
      this.updateSpeedDisplay();
    }
  }

  public increaseSpeed(): void {
    const currentSpeed = this.pollyService.getSpeed();
    const newSpeed = Math.min(1.9, Math.round((currentSpeed + 0.1) * 10) / 10);

    if (newSpeed !== currentSpeed) {
      this.pollyService.setSpeed(newSpeed);
      this.voice.settings.SPEED = newSpeed;
      void this.voice.saveSettings();
      this.updateSpeedDisplay();
    }
  }

  private addVoiceControlsSeparator(): void {
    // Add separator after all voice controls to separate from other plugins
    const separator = this.statusBarItem.createSpan({
      cls: "status-bar-separator",
    });
    separator.textContent = "|";
  }

  private createProgressBar(): void {
    this.progressBarContainer = this.statusBarItem.createDiv({
      cls: "voice-progress-bar-container",
    });

    this.progressBar = this.progressBarContainer.createDiv({
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
      this.progressBar.setCssProps({ "--voice-progress": `${percentage}%` });
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
    window.setTimeout(() => {
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
   * Update download button visibility based on whether cached audio exists for current file
   */
  private updateDownloadButtonVisibility(): void {
    const activeFile = this.plugin.app.workspace.getActiveFile();
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
   * Automatically save the generated audio after a successful synthesis, and
   * embed it in the note when the separate auto-embed setting is enabled.
   * Only acts when the user enabled the auto-download setting. Stays silent on
   * edge cases (no active file or no cached audio) to avoid noisy notices
   * during automatic playback.
   */
  public async maybeAutoDownloadAudio(): Promise<void> {
    if (!this.voice.settings.autoDownloadAudio) {
      return;
    }

    const activeFile = this.plugin.app.workspace.getActiveFile();
    if (!activeFile) {
      return;
    }

    const audioBlob = this.pollyService.getLastGeneratedAudio(activeFile.path);
    if (!audioBlob) {
      return;
    }

    await this.audioFileManager.downloadAndEmbed(
      audioBlob,
      this.voice.settings.autoEmbedAudio,
    );
  }

  /**
   * Handle download audio button click (also exposed as a command).
   * Retrieves cached audio blob and saves it as MP3 file.
   */
  public async handleDownloadAudio(): Promise<void> {
    try {
      // Get current file path for validation
      const activeFile = this.plugin.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice("No active file found");
        return;
      }

      // Get the cached audio blob from Polly service with file path validation
      const audioBlob = this.pollyService.getLastGeneratedAudio(
        activeFile.path,
      );

      if (!audioBlob) {
        new Notice(
          "No audio available for this file. Please generate audio first.",
        );
        return;
      }

      // Use AudioFileManager to save and (optionally) embed
      await this.audioFileManager.downloadAndEmbed(
        audioBlob,
        this.voice.settings.autoEmbedAudio,
      );
    } catch (error) {
      console.error("Error downloading audio:", error);
      new Notice(`Failed to download audio: ${error.message}`);
    }
  }
}
