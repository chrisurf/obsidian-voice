import { DEFAULT_SETTINGS, VoiceSettings } from "../settings/VoiceSettings";
import { VoiceSettingTab } from "../settings/VoiceSettingTab";
import { HotkeySettings } from "../settings/HotkeySettings";
import { AwsPollyService } from "../service/AwsPollyService";
import { Plugin } from "obsidian";
import { MarkdownHelper } from "./MarkdownHelper";
import { IconEventHandler } from "./IconEventHandler";
import { TextSpeaker } from "./TextSpeaker";

export class Voice extends Plugin {
  settings: VoiceSettings;
  private markdownHelper: MarkdownHelper;
  private pollyService: AwsPollyService;
  private hotkeySettings: HotkeySettings;
  private iconEventHandler: IconEventHandler;
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
      Number(this.settings.SPEED)
    );

    this.iconEventHandler = new IconEventHandler(this, this, this.pollyService);
    this.textSpeaker = new TextSpeaker(
      this.pollyService,
      this.markdownHelper,
      this.iconEventHandler
    );

    this.hotkeySettings = new HotkeySettings(this, this.pollyService);
    this.hotkeySettings.initHotkeys();
  }

  async speakText(speed?: number) {
    await this.textSpeaker.speakText(speed);
  }

  onunload() {
    if (this.iconEventHandler) {
      this.iconEventHandler.removeEventListeners();
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  public getPollyService(): AwsPollyService {
    return this.pollyService;
  }
}
