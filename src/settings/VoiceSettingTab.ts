import { App, PluginSettingTab, Setting } from "obsidian";
import { Voice } from "../utils/VoicePlugin";
import { ELEVENLABS_MODELS } from "./VoiceSettings";
import { createSpeechProvider } from "../service/SpeechProviderFactory";

export class VoiceSettingTab extends PluginSettingTab {
  plugin: Voice;

  constructor(app: App, plugin: Voice) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private formatSpeedText(speed: number): string {
    if (speed === 1.0) {
      return "normal";
    } else if (speed > 1.0) {
      const percentage = Math.round((speed - 1) * 100);
      return `${percentage}% faster`;
    } else {
      const percentage = Math.round((1 - speed) * 100);
      return `${percentage}% slower`;
    }
  }

  private addSliderDirectionalIndicators(sliderEl: HTMLElement): void {
    // Wrap the slider with directional indicators (styling lives in styles.css)
    const sliderContainer = sliderEl.parentElement;
    if (!sliderContainer) return;

    const sliderWrapper = sliderContainer.createDiv({
      cls: "voice-slider-wrapper",
    });

    const leftIndicator = sliderWrapper.createSpan({
      cls: "voice-slider-indicator left",
    });
    leftIndicator.textContent = "− slower";
    leftIndicator.title = "Move left to decrease speed (slower playback)";

    // Move the slider into the wrapper
    sliderWrapper.appendChild(sliderEl);

    const rightIndicator = sliderWrapper.createSpan({
      cls: "voice-slider-indicator right",
    });
    rightIndicator.textContent = "faster +";
    rightIndicator.title = "Move right to increase speed (faster playback)";
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Provider selection
    new Setting(containerEl)
      .setName("Speech Provider")
      .setDesc(
        "Choose which text-to-speech engine to use. AWS Polly and ElevenLabs offer the same plugin features; each uses its own credentials and voices.",
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOption("polly", "AWS Polly")
          .addOption("elevenlabs", "ElevenLabs")
          .setValue(this.plugin.settings.TTS_PROVIDER)
          .onChange(async (value) => {
            this.plugin.settings.TTS_PROVIDER = value as "polly" | "elevenlabs";
            await this.plugin.saveSettings();
            // Swap the active provider and rewire the UI/orchestration
            this.plugin.reinitializeProvider();
            // Re-render so provider-specific fields and voices update
            this.display();
          });
      });

    // Voice (provider-aware)
    const provider = this.plugin.getSpeechProvider();
    new Setting(containerEl)
      .setName("Voice")
      .setDesc(
        "Choose a voice tone, gender, and language for a personalized audio experience.",
      )
      .addDropdown((dropdown) => {
        provider.getVoiceOptions().forEach((voice) => {
          dropdown.addOption(voice.id, voice.label);
        });
        dropdown.setValue(provider.getVoice()).onChange(async (value) => {
          await this.plugin.persistActiveVoice(value);
        });
      });

    new Setting(containerEl)
      .setName("Tempo")
      .setDesc(
        "Set a preferred reading tempo for pleasant and comfortable audio playback.",
      )
      .addSlider((slider) =>
        slider
          .setLimits(0.5, 1.9, 0.1)
          .setValue(
            this.plugin.settings.SPEED ||
              this.plugin.getSpeechProvider().getSpeed(),
          )
          .setDynamicTooltip()
          .onChange(async (value) => {
            // Round to nearest 0.1 for clean values
            const roundedValue = Math.round(value * 10) / 10;
            this.plugin.settings.SPEED = roundedValue;
            await this.plugin.saveSettings();
            this.plugin.getSpeechProvider().setSpeed(roundedValue);

            // Update the status bar speed display
            this.plugin.iconEventHandler.updateSpeedDisplayFromSettings();

            // Update the tooltip text with speed description
            const speedText = this.formatSpeedText(roundedValue);
            slider.sliderEl.setAttribute(
              "title",
              `${roundedValue}x - ${speedText}`,
            );
          })
          .then((slider) => {
            // Set initial tooltip text
            const currentSpeed =
              this.plugin.settings.SPEED ||
              this.plugin.getSpeechProvider().getSpeed();
            const speedText = this.formatSpeedText(currentSpeed);
            slider.sliderEl.setAttribute(
              "title",
              `${currentSpeed}x - ${speedText}`,
            );

            // Add directional indicators
            this.addSliderDirectionalIndicators(slider.sliderEl);
          }),
      );

    new Setting(containerEl)
      .setName("Spell Out Acronyms")
      .setDesc(
        "When enabled, uppercase words like NASA or API are spelled out letter by letter. Disable this if you want uppercase words to be pronounced normally. (Applies to AWS Polly.)",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.spellOutAcronyms)
          .onChange(async (value) => {
            this.plugin.settings.spellOutAcronyms = value;
            await this.plugin.saveSettings();
            // Reinitialize TextSpeaker to apply the new setting
            this.plugin.reinitializeTextSpeaker();
          }),
      );

    new Setting(containerEl)
      .setName("Read Code Blocks")
      .setDesc(
        "When enabled, fenced code blocks (such as Mermaid, YAML, or other code) are read aloud. Disable this to skip code blocks and announce them as a short placeholder instead.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.readCodeBlocks)
          .onChange(async (value) => {
            this.plugin.settings.readCodeBlocks = value;
            await this.plugin.saveSettings();
            this.plugin.reinitializeTextSpeaker();
          }),
      );

    new Setting(containerEl)
      .setName("Skip Website URLs")
      .setDesc(
        "When enabled, website URLs (such as https://example.com or www.example.com) are removed and not read aloud. Disabled by default.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.skipUrls)
          .onChange(async (value) => {
            this.plugin.settings.skipUrls = value;
            await this.plugin.saveSettings();
            this.plugin.reinitializeTextSpeaker();
          }),
      );

    new Setting(containerEl)
      .setName("Auto-Save Audio to Note")
      .setDesc(
        "When enabled, the generated MP3 is automatically saved next to the note and embedded in it after each successful playback—no need to press the download button. Disabled by default.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoDownloadAudio)
          .onChange(async (value) => {
            this.plugin.settings.autoDownloadAudio = value;
            await this.plugin.saveSettings();
          }),
      );

    // Provider-specific credentials
    if (this.plugin.settings.TTS_PROVIDER === "elevenlabs") {
      this.displayElevenLabsSettings(containerEl);
    } else {
      this.displayPollySettings(containerEl);
    }
  }

  private displayPollySettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("AWS").setHeading();

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
            this.plugin.reinitializeProviderCredentials();
          });
      });

    this.addPasswordSetting(
      containerEl,
      "AWS Access Key ID",
      "The AWS Access Key ID for the Polly service.",
      "Enter your AWS Access Key ID",
      this.plugin.settings.AWS_ACCESS_KEY_ID,
      async (value) => {
        this.plugin.settings.AWS_ACCESS_KEY_ID = value;
        await this.plugin.saveSettings();
        this.plugin.reinitializeProviderCredentials();
      },
    );

    this.addPasswordSetting(
      containerEl,
      "AWS Secret Access Key",
      "The AWS Secret Access Key for the Polly service.",
      "Enter your AWS Secret Access Key",
      this.plugin.settings.AWS_SECRET_ACCESS_KEY,
      async (value) => {
        this.plugin.settings.AWS_SECRET_ACCESS_KEY = value;
        await this.plugin.saveSettings();
        this.plugin.reinitializeProviderCredentials();
      },
    );

    this.renderCredentialValidation(containerEl, {
      providerName: "AWS",
      isConfigured: () =>
        !!this.plugin.settings.AWS_ACCESS_KEY_ID &&
        !!this.plugin.settings.AWS_SECRET_ACCESS_KEY &&
        !!this.plugin.settings.AWS_REGION,
      missingMessage:
        "Please fill in all AWS credentials (Access Key ID, Secret Access Key, and Region) before testing.",
      promptMessage:
        "Enter your AWS credentials above, then click 'Test Credentials' to validate",
      helpText: "Need help with creating AWS credentials? ",
      helpUrl:
        "https://github.com/chrisurf/obsidian-voice?tab=readme-ov-file#setting-up-your-aws-account-required",
    });
  }

  private displayElevenLabsSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("ElevenLabs").setHeading();

    new Setting(containerEl)
      .setName("Model")
      .setDesc(
        "The ElevenLabs model used for synthesis. Multilingual v2 offers the best quality; Flash v2.5 is the fastest.",
      )
      .addDropdown((dropdown) => {
        ELEVENLABS_MODELS.forEach((model) => {
          dropdown.addOption(model.id, model.label);
        });
        dropdown
          .setValue(this.plugin.settings.ELEVENLABS_MODEL)
          .onChange(async (value) => {
            this.plugin.settings.ELEVENLABS_MODEL = value;
            await this.plugin.saveSettings();
            this.plugin.reinitializeProviderCredentials();
          });
      });

    this.addPasswordSetting(
      containerEl,
      "ElevenLabs API Key",
      "Your ElevenLabs API key (from the ElevenLabs dashboard).",
      "Enter your ElevenLabs API key",
      this.plugin.settings.ELEVENLABS_API_KEY,
      async (value) => {
        this.plugin.settings.ELEVENLABS_API_KEY = value;
        await this.plugin.saveSettings();
        this.plugin.reinitializeProviderCredentials();
      },
    );

    this.renderCredentialValidation(containerEl, {
      providerName: "ElevenLabs",
      isConfigured: () => !!this.plugin.settings.ELEVENLABS_API_KEY,
      missingMessage: "Please enter your ElevenLabs API key before testing.",
      promptMessage:
        "Enter your ElevenLabs API key above, then click 'Test Credentials' to validate",
      helpText: "Need an ElevenLabs API key? ",
      helpUrl: "https://elevenlabs.io/app/settings/api-keys",
    });
  }

  /**
   * Render a password text setting with a show/hide toggle button.
   */
  private addPasswordSetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    placeholder: string,
    value: string,
    onChange: (value: string) => Promise<void>,
  ): void {
    let isVisible = false;
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((text) => {
        text.setPlaceholder(placeholder).setValue(value).onChange(onChange);
        text.inputEl.type = "password";
      })
      .addExtraButton((button) => {
        button
          .setIcon("eye")
          .setTooltip("Show")
          .onClick(() => {
            isVisible = !isVisible;
            const inputEl =
              button.extraSettingsEl.parentElement?.querySelector("input");
            if (inputEl) {
              inputEl.type = isVisible ? "text" : "password";
              button.setIcon(isVisible ? "eye-off" : "eye");
              button.setTooltip(isVisible ? "Hide" : "Show");
            }
          });
      });
  }

  /**
   * Render the credential validation panel for the active provider (styling
   * lives in styles.css). Uses the provider factory to build a temporary
   * instance and call validateCredentials.
   */
  private renderCredentialValidation(
    containerEl: HTMLElement,
    opts: {
      providerName: string;
      isConfigured: () => boolean;
      missingMessage: string;
      promptMessage: string;
      helpText: string;
      helpUrl: string;
    },
  ): void {
    const validationContainer = containerEl.createDiv({
      cls: "voice-validation-container",
    });

    const headerRow = validationContainer.createDiv({
      cls: "voice-validation-header-row",
    });

    headerRow.createDiv({
      cls: "voice-validation-title",
      text: "Credential Validation",
    });

    const testButton = headerRow.createEl("button", {
      cls: "voice-validation-test-button",
      text: "Test Credentials",
    });

    const statusContainer = validationContainer.createDiv({
      cls: "voice-validation-status",
    });

    const statusIndicator = statusContainer.createSpan({
      cls: "voice-validation-indicator",
    });

    const statusText = statusContainer.createSpan({
      cls: "voice-validation-text",
    });
    statusText.textContent = `Click 'Test Credentials' to verify your ${opts.providerName} setup`;

    const helpContainer = validationContainer.createDiv({
      cls: "voice-validation-help",
    });

    helpContainer.createSpan({
      cls: "voice-validation-help-text",
      text: opts.helpText,
    });

    const helpLink = helpContainer.createEl("a", {
      cls: "voice-validation-help-link",
      text: "View setup guide",
    });
    helpLink.href = opts.helpUrl;
    helpLink.target = "_blank";

    const stateClasses = ["is-loading", "is-valid", "is-invalid"];

    const updateStatus = (
      isValid: boolean | null,
      message: string,
      isLoading = false,
      voiceCount?: number,
    ) => {
      statusIndicator.removeClass(...stateClasses);
      statusText.removeClass(...stateClasses);

      if (isLoading) {
        statusIndicator.addClass("is-loading");
        statusText.addClass("is-loading");
        statusText.textContent = "Testing credentials...";
        testButton.disabled = true;
        testButton.textContent = "Testing...";
        helpContainer.removeClass("is-visible");
        return;
      }

      testButton.disabled = false;
      testButton.textContent = "Test Credentials";

      if (isValid === true) {
        statusIndicator.addClass("is-valid");
        statusText.addClass("is-valid");
        statusText.textContent = voiceCount
          ? `✓ Credentials valid! Found ${voiceCount} voices available.`
          : "✓ Credentials are valid!";
        helpContainer.removeClass("is-visible");
      } else if (isValid === false) {
        statusIndicator.addClass("is-invalid");
        statusText.addClass("is-invalid");
        statusText.textContent = `✗ ${message}`;
        helpContainer.addClass("is-visible");
      } else {
        statusText.textContent = message;
        helpContainer.removeClass("is-visible");
      }
    };

    const validateCredentials = async () => {
      if (!opts.isConfigured()) {
        updateStatus(false, opts.missingMessage);
        return;
      }

      updateStatus(null, "", true);

      try {
        // Build a temporary provider from the current settings for validation
        const tempProvider = createSpeechProvider(this.plugin.settings);
        const result = await tempProvider.validateCredentials();

        if (result.isValid) {
          updateStatus(true, "", false, result.voiceCount);
        } else {
          updateStatus(false, result.error || "Validation failed", false);
        }
      } catch (error) {
        console.error("Credential validation error:", error);
        updateStatus(
          false,
          "Unexpected error during validation. Please check your credentials and try again.",
        );
      }
    };

    testButton.addEventListener("click", () => void validateCredentials());

    // Auto-validate on open if configured
    if (opts.isConfigured()) {
      activeWindow.setTimeout(() => {
        void validateCredentials();
      }, 100);
    } else {
      updateStatus(null, opts.promptMessage);
    }
  }
}
