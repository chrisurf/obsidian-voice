import { Plugin, setIcon, Notice, Menu, TFile } from "obsidian";
import { Voice } from "./VoicePlugin";
import type { SpeechProvider } from "../service/SpeechProvider";
import { MobileControlBar } from "./MobileControlBar";
import { AudioFileManager, type ConflictResolver } from "./AudioFileManager";
import { FolderPickerModal } from "../ui/FolderPickerModal";
import { FileConflictModal } from "../ui/FileConflictModal";
import { resolveSaveFolder } from "./audioFolders";
import { attachPressGesture } from "./pressGesture";
import { friendlySpeechError } from "./speechFeedback";
import { setVoiceIcon, type VoiceIconName } from "../ui/icons";
import {
  formatSpeed,
  MAX_SPEED,
  MIN_SPEED,
  speedChoices,
} from "./speedChoices";

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
  private cancelGenerationEl: HTMLElement;
  private isErrorState: boolean = false;
  private mobileControlBar?: MobileControlBar;
  private audioFileManager: AudioFileManager;
  // Tracks whether the status-bar download icon currently shows the save
  // (floppy) glyph, so it is only swapped when the default folder changes.
  private downloadShowsSave = false;
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
      this.syncGenerationState();
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
      cls: "voice-statusbar-voice-switcher voice-statusbar-btn",
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

    // Order: rewind, stop, speed menu, play, fast-forward, save

    // Rewind
    this.rewindIconEl = this.createStatusBarIcon(
      "seek-back",
      "rewind",
      () => this.pollyService.rewindAudio(),
      false,
      `Rewind ${this.voice.settings.rewindSeconds} seconds`,
    );

    // Stop
    this.createStatusBarIcon(
      "stop",
      "stop",
      () => {
        // Stops playback only: audio being generated is finished regardless
        // (cancelling it is the ✕ next to the progress bar).
        if (
          this.pollyService.isOperationInProgress() &&
          !this.pollyService.isStreaming()
        ) {
          this.voice.notifyStillGenerating();
          return;
        }
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
        // Generating, nothing playing yet: play what is ready (never cancel).
        if (
          this.pollyService.isOperationInProgress() &&
          !this.pollyService.isStreaming()
        ) {
          void this.voice.speakText();
          return;
        }

        if (!this.pollyService.isPlaying()) {
          this.playPauseIconEl.addClass("rotating-icon");
          setVoiceIcon(this.playPauseIconEl, "loading");
        }
        void this.voice.speakText();
      },
      true,
      "Play / Pause",
    );

    // Fast-forward
    this.fastForwardIconEl = this.createStatusBarIcon(
      "seek-forward",
      "fast-forward",
      () => this.pollyService.fastForwardAudio(),
      false,
      `Fast-forward ${this.voice.settings.forwardSeconds} seconds`,
    );

    // Download MP3 (initially hidden). The plain click is handled by the press
    // gesture below (tap = save, hold/right-click = choose folder), so no
    // onClick is wired here.
    this.downloadIconEl = this.createStatusBarIcon(
      "download",
      "download-audio",
      () => {},
      false,
      "Download audio as MP3",
    );
    this.downloadIconEl.addClass("voice-hidden"); // Initially hidden
    this.attachSaveGesture(this.downloadIconEl);

    // Add separator after all voice controls to separate from other plugins
    this.addVoiceControlsSeparator();

    // Set initial speed display
    window.setTimeout(() => {
      this.updateSpeedDisplay();
    }, 100);
  }

  private createStatusBarIcon(
    icon: VoiceIconName,
    cls: string,
    onClick: () => void,
    isPlayPauseIcon: boolean = false,
    tooltip?: string,
  ): HTMLElement {
    const iconEl = this.statusBarItem.createSpan({
      cls: "status-bar-icon voice-statusbar-btn " + cls,
    });
    setVoiceIcon(iconEl, icon);
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
        // Generating, nothing playing yet: play what is ready (never cancel).
        if (
          this.pollyService.isOperationInProgress() &&
          !this.pollyService.isStreaming()
        ) {
          void this.voice.speakText();
          return;
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
      setVoiceIcon(this.playPauseIconEl, "loading");

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
      setVoiceIcon(this.playPauseIconEl, "pause");
    }
    // Hide progress bar when audio starts playing, unless the rest of the
    // reading is still being generated.
    this.syncGenerationState();
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
      setVoiceIcon(this.playPauseIconEl, "play");
    }
    // Hide progress bar when audio is paused (it stays while generating).
    this.syncGenerationState();
  }

  /**
   * The playback speed as one compact control: the current speed, which opens
   * a menu of speeds on click.
   */
  private addSpeedControls(): void {
    this.speedDisplayEl = this.statusBarItem.createSpan({
      cls: "status-bar-speed-display voice-statusbar-btn",
    });
    this.speedDisplayEl.addEventListener("click", (event) => {
      const current = this.pollyService.getSpeed();
      const menu = new Menu();
      for (const speed of speedChoices(current)) {
        menu.addItem((item) =>
          item
            .setTitle(formatSpeed(speed))
            .setChecked(Math.abs(speed - current) < 0.001)
            .onClick(() => this.applySpeed(speed)),
        );
      }
      menu.showAtMouseEvent(event);
    });
    this.updateSpeedDisplay();
  }

  private updateSpeedDisplay(): void {
    if (this.speedDisplayEl) {
      const label = formatSpeed(this.pollyService.getSpeed());
      this.speedDisplayEl.empty();
      this.speedDisplayEl.createSpan({ text: label });
      setVoiceIcon(
        this.speedDisplayEl.createSpan({ cls: "voice-statusbar-chevron" }),
        "chevron-up",
      );
      this.speedDisplayEl.title = `Playback speed: ${label} (click to change)`;
    }
  }

  /** Set, persist and show a playback speed. */
  private applySpeed(speed: number): void {
    const next = Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed));
    if (next === this.pollyService.getSpeed()) {
      return;
    }
    this.pollyService.setSpeed(next);
    this.voice.settings.SPEED = next;
    void this.voice.saveSettings();
    this.updateSpeedDisplay();
  }

  public decreaseSpeed(): void {
    const current = this.pollyService.getSpeed();
    this.applySpeed(Math.round((current - 0.1) * 10) / 10);
  }

  public increaseSpeed(): void {
    const current = this.pollyService.getSpeed();
    this.applySpeed(Math.round((current + 0.1) * 10) / 10);
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

    // The only way to cancel audio being generated (asks first).
    this.cancelGenerationEl = this.statusBarItem.createSpan({
      cls: "status-bar-icon voice-cancel-generation voice-hidden",
    });
    setVoiceIcon(this.cancelGenerationEl, "close");
    this.cancelGenerationEl.title = "Stop generating audio";
    this.cancelGenerationEl.addEventListener(
      "click",
      () => void this.voice.confirmCancelGeneration(),
    );

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
      this.progressBarContainer.removeClass("is-generating");
      this.cancelGenerationEl?.addClass("voice-hidden");
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

    // Show error notification to user. Map internal synthesis details (SSML
    // build/chunking) to a friendly message; actionable provider messages
    // (invalid key, quota) pass through unchanged.
    new Notice(`🔊 Voice Plugin: ${friendlySpeechError(errorMessage)}`, 5000);

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
      setVoiceIcon(this.playPauseIconEl, "play");
    }
  }

  private onCanPlayThrough(): void {
    // Hide progress bar when audio is ready to play
    this.syncGenerationState();
  }

  /**
   * Show the progress bar (shimmering, with its ✕) while audio is being
   * generated — playing, paused or not started yet — and hide it once done.
   */
  private syncGenerationState(): void {
    if (this.isErrorState || !this.progressBarContainer) {
      return;
    }
    const generating = this.pollyService.isOperationInProgress();
    if (this.mobileControlBar) {
      this.mobileControlBar.setGenerating(generating);
      return;
    }
    this.progressBarContainer.toggleClass("visible", generating);
    this.progressBarContainer.toggleClass("is-generating", generating);
    this.cancelGenerationEl.toggleClass("voice-hidden", !generating);
  }

  /** Reset the controls after the user cancelled generating. */
  public resetAfterCancel(): void {
    this.resetIconsToPlayState();
    this.hideProgressBar();
    if (this.mobileControlBar) {
      this.mobileControlBar.hide();
    }
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
    // Keep the tooltip + icon in sync with the current default folder.
    this.refreshSaveAffordances();

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

    // Auto-save never prompts: it writes to the resolved folder silently
    // (the default folder when set, otherwise next to the note).
    const folder = resolveSaveFolder(
      this.voice.settings.defaultAudioFolder,
      activeFile.parent?.path || "",
    );
    await this.audioFileManager.downloadAndEmbed(
      audioBlob,
      this.voice.settings.autoEmbedAudio,
      folder,
    );
  }

  /**
   * Handle download audio button click (also exposed as a command).
   * Retrieves cached audio blob and saves it as an MP3 file in the resolved
   * folder.
   * @param options.forcePicker - Open the folder picker (the "hold"/right-click
   *   gesture) and save to the chosen folder for this one save.
   */
  public async handleDownloadAudio(options?: {
    forcePicker?: boolean;
    moveFromPath?: string;
  }): Promise<void> {
    try {
      const resolveConflict: ConflictResolver = (info) =>
        FileConflictModal.open(
          this.plugin.app,
          info.fileName,
          info.folder,
          info.suggested,
        );

      // Move an already-saved file (a chapter loaded in the player). This does
      // not need synthesized audio or an active note — it relocates the file.
      if (options?.forcePicker && options.moveFromPath) {
        const folder = await FolderPickerModal.open(
          this.plugin.app,
          this.voice,
        );
        this.refreshSaveAffordances();
        if (folder === null) {
          return;
        }
        const file = this.plugin.app.vault.getAbstractFileByPath(
          options.moveFromPath,
        );
        if (file instanceof TFile) {
          await this.audioFileManager.saveOrMove({
            kind: "move",
            sourceFile: file,
            baseName: file.basename,
            folder,
            embed: false,
            resolveConflict,
          });
        }
        return;
      }

      // Hold / folder button (no loaded chapter to move): open the folder
      // picker. This works even without generated audio, so a default folder
      // can be pinned any time — the picker persists pin/favorite changes on its
      // own. When the note does have audio, save it into the chosen folder.
      if (options?.forcePicker) {
        const noteFile = this.plugin.app.workspace.getActiveFile();
        const noteAudio = noteFile
          ? this.pollyService.getLastGeneratedAudio(noteFile.path)
          : null;

        const folder = await FolderPickerModal.open(
          this.plugin.app,
          this.voice,
        );
        this.refreshSaveAffordances();
        if (folder === null) {
          return;
        }
        if (noteFile && noteAudio) {
          await this.audioFileManager.saveOrMove({
            kind: "save",
            blob: noteAudio,
            baseName: noteFile.basename,
            folder,
            embed: this.voice.settings.autoEmbedAudio,
            resolveConflict,
          });
        }
        return;
      }

      // Plain tap: save the note's audio to the default/note folder. Needs audio.
      const activeFile = this.plugin.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice("No active file found");
        return;
      }
      const audioBlob = this.pollyService.getLastGeneratedAudio(
        activeFile.path,
      );
      if (!audioBlob) {
        new Notice(
          "No audio available for this file. Please generate audio first.",
        );
        return;
      }
      const folder = resolveSaveFolder(
        this.voice.settings.defaultAudioFolder,
        activeFile.parent?.path || "",
      );
      await this.audioFileManager.downloadAndEmbed(
        audioBlob,
        this.voice.settings.autoEmbedAudio,
        folder,
      );
    } catch (error) {
      console.error("Error downloading audio:", error);
      new Notice(`Failed to download audio: ${error.message}`);
    }
  }

  /**
   * Wire the tap-vs-hold gesture onto a save button: tap saves (to the default
   * folder, or next to the note), hold (or right-click) opens the folder picker.
   */
  private attachSaveGesture(el: HTMLElement): void {
    attachPressGesture(el, {
      onTap: () => void this.handleDownloadAudio(),
      onHold: () => void this.handleDownloadAudio({ forcePicker: true }),
    });
  }

  /**
   * Sync the save button's tooltip and icon (status bar + mobile) with the
   * current default folder.
   */
  private refreshSaveAffordances(): void {
    this.updateSaveTooltip();
    this.updateSaveIcon();
    this.mobileControlBar?.updateSaveIcon();
  }

  /**
   * Show a floppy-disk (save) glyph when a default folder is set, otherwise the
   * download arrow — so the status bar mirrors the player. Only swaps on change.
   */
  private updateSaveIcon(): void {
    if (!this.downloadIconEl) {
      return;
    }
    const hasDefault = this.voice.settings.defaultAudioFolder.trim() !== "";
    if (hasDefault === this.downloadShowsSave) {
      return;
    }
    this.downloadShowsSave = hasDefault;
    setVoiceIcon(this.downloadIconEl, hasDefault ? "save" : "download");
  }

  /**
   * Refresh the download button's tooltip to reflect the current default folder,
   * with a platform-appropriate hint about the hold gesture.
   */
  private updateSaveTooltip(): void {
    if (!this.downloadIconEl) {
      return;
    }
    this.downloadIconEl.title = this.saveTooltip();
  }

  private saveTooltip(): string {
    const def = this.voice.settings.defaultAudioFolder.trim();
    const target = def === "" ? "the note's folder" : def;
    const hint = this.voice.isMobile()
      ? "touch & hold to choose a folder"
      : "hold (or right-click) to choose a folder";
    return `Save to ${target} — ${hint}`;
  }
}
