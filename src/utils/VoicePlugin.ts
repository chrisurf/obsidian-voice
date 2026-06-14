import { DEFAULT_SETTINGS, VoiceSettings } from "../settings/VoiceSettings";
import { VoiceSettingTab } from "../settings/VoiceSettingTab";
import { HotkeySettings } from "../settings/HotkeySettings";
import { AwsPollyService } from "../service/AwsPollyService";
import { Plugin, Platform } from "obsidian";
import { MarkdownHelper } from "./MarkdownHelper";
import { IconEventHandler } from "./IconEventHandler";
import { TextSpeaker } from "./TextSpeaker";

export class Voice extends Plugin {
  settings: VoiceSettings;
  private markdownHelper: MarkdownHelper;
  private pollyService: AwsPollyService;
  private hotkeySettings: HotkeySettings;
  public iconEventHandler: IconEventHandler;
  private textSpeaker: TextSpeaker;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new VoiceSettingTab(this.app, this));
    this.markdownHelper = new MarkdownHelper(this.app);

    this.pollyService = new AwsPollyService(
      {
        credentials: {
          accessKeyId: String(this.settings.AWS_ACCESS_KEY_ID),
          secretAccessKey: String(this.settings.AWS_SECRET_ACCESS_KEY),
        },
        region: String(this.settings.AWS_REGION),
      },
      this.settings.VOICE,
      Number(this.settings.SPEED),
    );

    this.iconEventHandler = new IconEventHandler(this, this, this.pollyService);
    this.textSpeaker = new TextSpeaker(
      this.pollyService,
      this.markdownHelper,
      this.iconEventHandler,
      this.settings.spellOutAcronyms,
      this.settings.readCodeBlocks,
    );

    this.hotkeySettings = new HotkeySettings(this, this.pollyService);
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

  public reinitializePollyService(): void {
    // Only reinitialize if all credentials are present
    if (
      this.settings.AWS_ACCESS_KEY_ID &&
      this.settings.AWS_SECRET_ACCESS_KEY &&
      this.settings.AWS_REGION
    ) {
      this.pollyService.updateCredentials({
        credentials: {
          accessKeyId: String(this.settings.AWS_ACCESS_KEY_ID),
          secretAccessKey: String(this.settings.AWS_SECRET_ACCESS_KEY),
        },
        region: String(this.settings.AWS_REGION),
      });
    }
  }

  public reinitializeTextSpeaker(): void {
    // Recreate TextSpeaker with updated settings
    this.textSpeaker = new TextSpeaker(
      this.pollyService,
      this.markdownHelper,
      this.iconEventHandler,
      this.settings.spellOutAcronyms,
      this.settings.readCodeBlocks,
    );
  }

  public getPollyService(): AwsPollyService {
    return this.pollyService;
  }
}
