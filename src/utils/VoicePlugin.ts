import { DEFAULT_SETTINGS, VoiceSettings } from "../settings/VoiceSettings";
import { VoiceSettingTab } from "../settings/VoiceSettingTab";
import { HotkeySettings } from "../settings/HotkeySettings";
import type { SpeechProvider } from "../service/SpeechProvider";
import { createSpeechProvider } from "../service/SpeechProviderFactory";
import { Plugin, Platform } from "obsidian";
import { MarkdownHelper } from "./MarkdownHelper";
import { IconEventHandler } from "./IconEventHandler";
import { TextSpeaker } from "./TextSpeaker";

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
