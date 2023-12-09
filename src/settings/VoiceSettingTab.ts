import { App, PluginSettingTab, Setting } from "obsidian";
import { Voice } from "../Voice";

export class VoiceSettingTab extends PluginSettingTab {
  plugin: Voice;

  constructor(app: App, plugin: Voice) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName("Voice")
      .setDesc("Choose a voice tone, gender, and language for a personalized audio experience.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("Stephen", "Stephen (American)")
          .addOption("Joanna", "Joanna (American)")
          .addOption("Brian", "Brian (British)")
          .addOption("Emma", "Emma (British)")
          .addOption("Daniel", "Daniel (German)")
          .addOption("Vicki", "Vicki (German)")
          .addOption("Remi", "Rémi (French)")
          .addOption("Lea", "Léa (French)")
          .addOption("Sergio", "Sergio (Spanish)")
          .addOption("Lucia", "Lucia (Spanish)")
          .addOption("Adriano", "Adriano (Italian)")
          .addOption("Bianca", "Bianca (Italian)")
          .addOption("Ola", "Ola (Polish)")
          .addOption("Laura", "Laura (Dutch)")
          .addOption("Ines", "Ines (Portuguese)")
          .addOption("Arlet", "Arlet (Catalan)")
          .addOption("Elin", "Elin (Swedish)")
          .addOption("Sofie", "Sofie (Danish)")
          .addOption("Ida", "Ida (Norwegian)")
          .addOption("Suvi", "Suvi (Finnish)")
          .addOption("Takumi", "Takumi (Japanese)")
          .addOption("Tomoko", "Tomoko (Japanese)")
          .addOption("Seoyeon", "Seoyeon (Korean)")
          .addOption("Kajal", "Kajal (Hindi)")
          .addOption("Zhiyu", "Zhiyu (Mandarin)")
          .setValue(
            this.plugin.getPollyService().getVoice() ||
              this.plugin.settings.VOICE
          )
          .onChange(async (value) => {
            this.plugin.settings.VOICE = value;
            await this.plugin.saveSettings();
            this.plugin.getPollyService().setVoice(value);
          })
      );

    new Setting(containerEl)
      .setName("Tempo")
      .setDesc("Set a preferred reading tempo for pleasant and comfortable audio playback.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("1.9", "190% faster")
          .addOption("1.7", "170% faster")
          .addOption("1.6", "160% faster")
          .addOption("1.5", "150% faster")
          .addOption("1.4", "140% faster")
          .addOption("1.3", "130% faster")
          .addOption("1.1", "120% faster")
          .addOption("1.2", "110% faster")
          .addOption("1.0", "normal")
          .addOption("0.9", "90% slower")
          .addOption("0.8", "80% slower")
          .addOption("0.7", "70% slower")
          .addOption("0.6", "60% slower")
          .addOption("0.5", "50% slower")
          .setValue(
            this.plugin.settings.SPEED ||
              this.plugin.getPollyService().getSpeed().toString()
          )
          .onChange(async (value) => {
            this.plugin.settings.SPEED = value;
            await this.plugin.saveSettings();
            this.plugin.getPollyService().setSpeed(Number(value));
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
