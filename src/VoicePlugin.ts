import { DEFAULT_SETTINGS, VoiceSettings } from "./settings/VoiceSettings";
import { Plugin, setIcon, addIcon } from "obsidian";
import { AwsPollyService } from "./services/AwsPollyService";
import { VoiceSettingTab } from "./settings/VoiceSettingTab";
import { MarkdownHelper } from "./utils/MarkdownHelper";
import { RegEx } from "utils/RegExHelper";

export class Voice extends Plugin {
  settings: VoiceSettings;
  activeContent: string | "";
  private ribbonIconEl: HTMLElement;
  private markdownHelper: MarkdownHelper;
  private pollyService: AwsPollyService;

  async speakText() {
    this.ribbonIconHandler();

    switch (this.pollyService.isPlaying()) {
      case true:
        this.pollyService.stopAudio();
        break;
      case false:
        await this.pollyService.smartPolly(
          new RegEx(this.markdownHelper.getMarkdownView()).getcleanContent()
        );
        break;
      default:
        this.pollyService.stopAudio();
        break;
    }
  }

  ribbonIconHandler() {
    this.ribbonIconEl.addClass("rotating-icon");
    if (!this.pollyService.isPlaying()) {
      setIcon(this.ribbonIconEl, "refresh-ccw");
    }
  }

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
      this.settings.VOICE
    );

    this.pollyService.getAudio().addEventListener("play", () => {
      this.ribbonIconEl.removeClass("rotating-icon");
      setIcon(this.ribbonIconEl, "pause-circle");
    });

    this.pollyService.getAudio().addEventListener("pause", () => {
      this.ribbonIconEl.removeClass("rotating-icon");
      setIcon(this.ribbonIconEl, "play-circle");
    });

    this.ribbonIconEl = this.addRibbonIcon(
      "play-circle",
      "Voice",
      (evt: MouseEvent) => {
        this.speakText();
      }
    );

    this.addCommand({
      id: "play-audio",
      name: "Start reading the current document",
      callback: () => {
        this.speakText();
      },
    });
    this.addCommand({
      id: "pause-audio",
      name: "Pause reading the current document",
      callback: () => {
        this.pollyService.pauseAudio();
      },
    });
    this.addCommand({
      id: "stop-audio",
      name: "Stop reading the current document",
      callback: () => {
        this.pollyService.stopAudio();
      },
    });
    this.addCommand({
      id: "play-or-stop-audio",
      name: "Play or Stop reading the current document",
      callback: () => {
        this.speakText();
      },
    });
  }

  onunload() {
    this.pollyService.getAudio().removeEventListener("play", () => {
      this.ribbonIconEl.removeClass("rotating-icon");
      setIcon(this.ribbonIconEl, "pause-circle");
    });

    this.pollyService.getAudio().removeEventListener("pause", () => {
      this.ribbonIconEl.removeClass("rotating-icon");
      setIcon(this.ribbonIconEl, "play-circle");
    });
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
