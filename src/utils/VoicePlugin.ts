import { DEFAULT_SETTINGS, VoiceSettings } from "../settings/VoiceSettings";
import { VoiceSettingTab } from "../settings/VoiceSettingTab";
import { HotkeySettings } from "../settings/HotkeySettings";
import type { SpeechProvider } from "../service/SpeechProvider";
import { createSpeechProvider } from "../service/SpeechProviderFactory";
import { Plugin, Platform, Notice } from "obsidian";
import { MarkdownHelper } from "./MarkdownHelper";
import { IconEventHandler } from "./IconEventHandler";
import { TextSpeaker } from "./TextSpeaker";
import { VoicePlayerView, VIEW_TYPE_VOICE_PLAYER } from "../ui/VoicePlayerView";
import { WhatsNewModal } from "../ui/WhatsNewModal";
import { shouldShowWhatsNew } from "./whatsNew";

export class Voice extends Plugin {
  settings: VoiceSettings;
  private markdownHelper: MarkdownHelper;
  private speechProvider: SpeechProvider;
  private hotkeySettings: HotkeySettings;
  public iconEventHandler: IconEventHandler;
  private textSpeaker: TextSpeaker;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new VoiceSettingTab(this.app, this));
    this.markdownHelper = new MarkdownHelper(this.app);

    this.speechProvider = createSpeechProvider(this.settings);

    this.iconEventHandler = new IconEventHandler(
      this,
      this,
      this.speechProvider,
    );
    this.textSpeaker = new TextSpeaker(
      this.speechProvider,
      this.markdownHelper,
      this.iconEventHandler,
      this.settings.spellOutAcronyms,
      this.settings.readCodeBlocks,
      this.settings.skipUrls,
    );

    this.hotkeySettings = new HotkeySettings(this);
    this.hotkeySettings.initHotkeys();

    // Register the collapsible player (right sidebar on desktop, full-screen
    // pane on mobile) and the entry points that open it.
    this.registerView(
      VIEW_TYPE_VOICE_PLAYER,
      (leaf) => new VoicePlayerView(leaf, this),
    );
    this.addRibbonIcon("audio-lines", "Open Voice player", () => {
      void this.activatePlayerView();
    });
    this.addCommand({
      id: "open-player",
      name: "Open the player.",
      callback: () => void this.activatePlayerView(),
    });
    this.addCommand({
      id: "show-whats-new",
      name: "Show what's new.",
      callback: () => this.showWhatsNew(),
    });

    // After the layout is ready: make the player discoverable out of the box
    // (place it as a sidebar tab once) and surface the "What's New" note once
    // per install/update so users learn about new functionality.
    this.app.workspace.onLayoutReady(() => {
      void this.placeDefaultPlayerPane();
      this.maybeShowWhatsNew();
    });
  }

  /** Open the "What's New" modal for the current version. */
  private showWhatsNew(): void {
    new WhatsNewModal(
      this.app,
      this.manifest.version,
      this,
      () => void this.activatePlayerView(),
    ).open();
  }

  /**
   * Show the "What's New" note once after a fresh install or an update, then
   * remember the version so it is not shown again until the next upgrade.
   */
  private maybeShowWhatsNew(): void {
    const current = this.manifest.version;
    if (!shouldShowWhatsNew(current, this.settings.lastWhatsNewVersion)) {
      return;
    }
    this.settings.lastWhatsNewVersion = current;
    void this.saveSettings();
    this.showWhatsNew();
  }

  /**
   * One-time placement of the player in the right sidebar so it shows up by
   * default (desktop and mobile). The tab is added without revealing it, so it
   * does not steal focus from the user's current pane.
   */
  private async placeDefaultPlayerPane(): Promise<void> {
    if (this.settings.playerPanePlaced) {
      return;
    }
    this.settings.playerPanePlaced = true;
    await this.saveSettings();

    const { workspace } = this.app;
    if (workspace.getLeavesOfType(VIEW_TYPE_VOICE_PLAYER).length > 0) {
      return;
    }
    const right = workspace.getRightLeaf(false);
    if (!right) {
      return;
    }
    await right.setViewState({ type: VIEW_TYPE_VOICE_PLAYER });
  }

  async speakText(speed?: number) {
    await this.textSpeaker.speakText(speed);
  }

  isMobile(): boolean {
    return Platform.isMobile;
  }

  onunload() {
    if (this.iconEventHandler) {
      this.iconEventHandler.removeEventListeners();
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // One-time migration: versions up to 1.7.3 shipped spellOutAcronyms with a
    // stale `true` default that got persisted on any settings change. Reset it
    // to `false` once so acronyms are pronounced naturally by default, then
    // remember we did so—this way users can still re-enable it deliberately
    // without it being reset again on the next load.
    if (!this.settings.acronymDefaultMigrated) {
      this.settings.spellOutAcronyms = false;
      this.settings.acronymDefaultMigrated = true;
      await this.saveSettings();
    }

    // One-time migration: the legacy "custom save mode" (audioSaveMode +
    // lastAudioFolder) is replaced by a single defaultAudioFolder. Carry a
    // user's previous custom folder over so their saves keep landing there.
    if (!this.settings.audioFolderMigrated) {
      if (
        this.settings.audioSaveMode === "custom" &&
        this.settings.lastAudioFolder
      ) {
        this.settings.defaultAudioFolder = this.settings.lastAudioFolder;
      }
      this.settings.audioFolderMigrated = true;
      await this.saveSettings();
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * Update the active provider's credentials in place (no audio interruption).
   * Called when the user edits AWS or ElevenLabs credentials in settings.
   */
  public reinitializeProviderCredentials(): void {
    this.speechProvider.updateCredentials(this.settings);
  }

  /**
   * Backwards-compatible alias for AWS credential updates.
   */
  public reinitializePollyService(): void {
    this.reinitializeProviderCredentials();
  }

  /**
   * Switch the active TTS provider (e.g. Polly ↔ ElevenLabs). Rewires the UI
   * (status bar, mobile control bar) and orchestration to the new provider.
   */
  public reinitializeProvider(): void {
    // Stop any audio on the outgoing provider before swapping
    this.speechProvider.stopAudio();
    this.speechProvider = createSpeechProvider(this.settings);
    this.iconEventHandler.setProvider(this.speechProvider);
    this.reinitializeTextSpeaker();
  }

  public reinitializeTextSpeaker(): void {
    // Recreate TextSpeaker with updated settings + current provider
    this.textSpeaker = new TextSpeaker(
      this.speechProvider,
      this.markdownHelper,
      this.iconEventHandler,
      this.settings.spellOutAcronyms,
      this.settings.readCodeBlocks,
      this.settings.skipUrls,
    );
  }

  /**
   * Persist the chosen voice to the correct settings key for the active
   * provider, apply it to the running provider, and refresh the display.
   */
  public async persistActiveVoice(voiceId: string): Promise<void> {
    if (this.settings.TTS_PROVIDER === "elevenlabs") {
      this.settings.ELEVENLABS_VOICE = voiceId;
    } else if (this.settings.TTS_PROVIDER === "google") {
      this.settings.GOOGLE_VOICE = voiceId;
    } else if (this.settings.TTS_PROVIDER === "azure") {
      this.settings.AZURE_VOICE = voiceId;
    } else if (this.settings.TTS_PROVIDER === "openai") {
      this.settings.OPENAI_VOICE = voiceId;
    } else {
      this.settings.VOICE = voiceId;
    }
    await this.saveSettings();
    this.speechProvider.setVoice(voiceId);
    this.iconEventHandler.updateVoiceDisplay();
  }

  /**
   * Apply the configured rewind/fast-forward skip intervals to the running
   * provider and refresh the control tooltips. Called when the user changes
   * the interval in settings (no audio interruption).
   */
  public updateSkipIntervals(): void {
    this.speechProvider.setRewindSeconds(this.settings.rewindSeconds);
    this.speechProvider.setForwardSeconds(this.settings.forwardSeconds);
    this.iconEventHandler.updateSkipTooltips();
  }

  /**
   * Switch to the next voice in the active provider's catalog (wraps around).
   * Backs the "Switch to the next voice" command.
   */
  public async cycleVoice(): Promise<void> {
    const options = this.speechProvider.getVoiceOptions();
    if (options.length === 0) {
      return;
    }
    const currentId = this.speechProvider.getVoice();
    const currentIndex = options.findIndex((v) => v.id === currentId);
    const next = options[(currentIndex + 1) % options.length];
    await this.persistActiveVoice(next.id);
    new Notice(`Voice: ${next.label}`);
  }

  /**
   * Open the Voice player and reveal it (right sidebar on desktop, full-screen
   * pane on mobile). Reuses an existing player leaf if one is already open.
   */
  public async activatePlayerView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_VOICE_PLAYER)[0];
    if (!leaf) {
      const right = workspace.getRightLeaf(false);
      if (!right) {
        return;
      }
      leaf = right;
      await leaf.setViewState({
        type: VIEW_TYPE_VOICE_PLAYER,
        active: true,
      });
    }
    // revealLeaf is the standard reveal API; it is a no-op on app versions
    // that predate it, so we don't raise the manifest's minAppVersion floor.
    // eslint-disable-next-line obsidianmd/no-unsupported-api
    await workspace.revealLeaf(leaf);

    // The player replaces the compact mobile bar; hide the bar so they are
    // never shown at the same time (e.g. when toggling from the navbar).
    this.iconEventHandler.hideMobileControlBar();
  }

  public getSpeechProvider(): SpeechProvider {
    return this.speechProvider;
  }

  /**
   * @deprecated Use getSpeechProvider() instead.
   */
  public getPollyService(): SpeechProvider {
    return this.speechProvider;
  }
}
