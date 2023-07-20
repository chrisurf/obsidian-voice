import { PollyService } from "./PollyService";
import {
  App,
  MarkdownView,
  Plugin,
  PluginSettingTab,
  Setting,
  setIcon,
} from "obsidian";

const DEFAULT_SETTINGS: VoiceSettings = {
  VOICE: "Joanna",
  AWS_REGION: "eu-central-1",
  AWS_ACCESS_KEY_ID: "",
  AWS_SECRET_ACCESS_KEY: "",
};

interface VoiceSettings {
  VOICE: string;
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
}

export default class Voice extends Plugin {
  settings: VoiceSettings;
  activeContent: string | "";
  private ribbonIconEl: HTMLElement;
  public pollyService: PollyService;

  cleanString(str: string) {
    var pattern = /\[(.*?)\]\(.*?\)/gm;
    var markdown = str.replace(pattern, "");
    pattern = /[#+<>]\s*/gm;
    markdown = markdown.replace(pattern, "");
    return markdown;
  }

  getMarkdownView() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    let content = "";

    if (activeView) {
      const editor = activeView.editor;
      const selectedText = editor.getSelection();
      if (selectedText) {
        content = selectedText;
      } else {
        content = editor.getValue();
      }
    } else {
      content = "No active file found.";
    }

    return content;
  }

  async speakText() {
    this.ribbonIconHandler();

    switch (this.pollyService.isPlaying()) {
      case true:
        this.pollyService.stopAudio();
        break;
      case false:
        await this.pollyService.smartPolly(
          this.cleanString(this.getMarkdownView())
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

    this.pollyService = new PollyService(
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
      id: "play-or-stop-audio",
      name: "Play or Stop reading the current document",
      callback: () => {
        this.speakText();
        console.log("Play command");
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
}

class VoiceSettingTab extends PluginSettingTab {
  plugin: Voice;

  constructor(app: App, plugin: Voice) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "General" });

    new Setting(containerEl)
      .setName("Voice")
      .setDesc("Select a voice")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("Andres", "Andres")
          .addOption("Brian", "Brian")
          .addOption("Camila", "Camila")
          .addOption("Emma", "Emma")
          .addOption("Joanna", "Joanna")
          .addOption("Stephen", "Stephen")
          .setValue(
            this.plugin.pollyService.getVoice() || this.plugin.settings.VOICE
          )
          .onChange(async (value) => {
            this.plugin.settings.VOICE = value;
            await this.plugin.saveSettings();
            this.plugin.pollyService.setVoice(value);
          })
      );

    containerEl.createEl("h2", { text: "AWS" });

    new Setting(containerEl)
      .setName("AWS Region")
      .setDesc("The AWS Region for the Polly service.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("us-east-2", "US East (Ohio)")
          .addOption("us-east-1", "US East (N. Virginia)")
          .addOption("us-west-1", "US West (N. California)")
          .addOption("us-west-2", "US West (Oregon)")
          .addOption("af-south-1", "Africa (Cape Town)")
          .addOption("ap-east-1", "Asia Pacific (Hong Kong)")
          .addOption("ap-south-2", "Asia Pacific (Hyderabad)")
          .addOption("ap-southeast-3", "Asia Pacific (Jakarta)")
          .addOption("ap-southeast-4", "Asia Pacific (Melbourne)")
          .addOption("ap-south-1", "Asia Pacific (Mumbai)")
          .addOption("ap-northeast-3", "Asia Pacific (Osaka)")
          .addOption("ap-northeast-2", "Asia Pacific (Seoul)")
          .addOption("ap-southeast-1", "Asia Pacific (Singapore)")
          .addOption("ap-southeast-2", "Asia Pacific (Sydney)")
          .addOption("ap-northeast-1", "Asia Pacific (Tokyo)")
          .addOption("ca-central-1", "Canada (Central)")
          .addOption("eu-central-1", "Europe (Frankfurt)")
          .addOption("eu-west-1", "Europe (Ireland)")
          .addOption("eu-west-2", "Europe (London)")
          .addOption("eu-south-1", "Europe (Milan)")
          .addOption("eu-west-3", "Europe (Paris)")
          .addOption("eu-south-2", "Europe (Spain)")
          .addOption("eu-north-1", "Europe (Stockholm)")
          .addOption("eu-central-2", "Europe (Zurich)")
          .addOption("me-south-1", "Middle East (Bahrain)")
          .addOption("me-central-1", "Middle East (UAE)")
          .addOption("sa-east-1", "South America (São Paulo)")
          .setValue(this.plugin.settings.AWS_REGION)
          .onChange(async (value) => {
            this.plugin.settings.AWS_REGION = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("AWS Access Key ID")
      .setDesc("The AWS Access Key ID for the Polly service.")
      .addText((text) =>
        text
          .setPlaceholder("Enter your AWS Access Key ID")
          .setValue(this.plugin.settings.AWS_ACCESS_KEY_ID)
          .onChange(async (value) => {
            this.plugin.settings.AWS_ACCESS_KEY_ID = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("AWS Secret Access Key")
      .setDesc("The AWS Secret Access Key for the Polly service.")
      .addText((text) => {
        text
          .setPlaceholder("Enter your AWS Secret Access Key")
          .setValue(this.plugin.settings.AWS_SECRET_ACCESS_KEY)
          .onChange(async (value) => {
            this.plugin.settings.AWS_SECRET_ACCESS_KEY = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.type = "password";
      });
  }
}
