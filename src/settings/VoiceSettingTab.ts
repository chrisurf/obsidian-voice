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
    // Create container for the enhanced slider with indicators
    const sliderContainer = sliderEl.parentElement;
    if (!sliderContainer) return;

    // Create wrapper div for slider with indicators
    const sliderWrapper = sliderContainer.createDiv();
    sliderWrapper.style.display = "flex";
    sliderWrapper.style.alignItems = "center";
    sliderWrapper.style.gap = "8px";
    sliderWrapper.style.width = "100%";

    // Create left indicator (slower/minus)
    const leftIndicator = sliderWrapper.createSpan();
    leftIndicator.style.fontSize = "12px";
    leftIndicator.style.color = "var(--text-muted)";
    leftIndicator.style.fontWeight = "500";
    leftIndicator.style.minWidth = "50px";
    leftIndicator.style.textAlign = "right";
    leftIndicator.textContent = "− slower";
    leftIndicator.title = "Move left to decrease speed (slower playback)";

    // Move the slider into the wrapper
    sliderWrapper.appendChild(sliderEl);

    // Create right indicator (faster/plus)
    const rightIndicator = sliderWrapper.createSpan();
    rightIndicator.style.fontSize = "12px";
    rightIndicator.style.color = "var(--text-muted)";
    rightIndicator.style.fontWeight = "500";
    rightIndicator.style.minWidth = "50px";
    rightIndicator.style.textAlign = "left";
    rightIndicator.textContent = "faster +";
    rightIndicator.title = "Move right to increase speed (faster playback)";

    // Style the slider to take up remaining space
    sliderEl.style.flex = "1";
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
            // Reinitialize TextSpeaker to apply the new setting
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
            // Reinitialize TextSpeaker to apply the new setting
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

    // Add CSS for pulse animation (used by the validation indicator)
    const style = document.createElement("style");
    style.textContent = `
      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  private displayPollySettings(containerEl: HTMLElement): void {
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
    containerEl.createEl("h2", { text: "ElevenLabs" });

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
   * Render the credential validation panel for the active provider. Uses the
   * provider factory to build a temporary instance and call validateCredentials.
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
    const validationContainer = containerEl.createDiv();
    validationContainer.style.marginTop = "16px";
    validationContainer.style.padding = "12px 16px";
    validationContainer.style.backgroundColor = "var(--background-secondary)";
    validationContainer.style.borderRadius = "6px";
    validationContainer.style.border =
      "1px solid var(--background-modifier-border)";

    const headerRow = validationContainer.createDiv();
    headerRow.style.display = "flex";
    headerRow.style.alignItems = "center";
    headerRow.style.justifyContent = "space-between";
    headerRow.style.marginBottom = "8px";

    const validationHeader = headerRow.createEl("h3", {
      text: "Credential Validation",
    });
    validationHeader.style.margin = "0";
    validationHeader.style.color = "var(--text-normal)";
    validationHeader.style.fontSize = "13px";
    validationHeader.style.fontWeight = "600";

    const testButton = headerRow.createEl("button", {
      text: "Test Credentials",
    });
    testButton.style.padding = "6px 12px";
    testButton.style.backgroundColor = "var(--interactive-accent)";
    testButton.style.color = "var(--text-on-accent)";
    testButton.style.border = "none";
    testButton.style.borderRadius = "4px";
    testButton.style.cursor = "pointer";
    testButton.style.fontSize = "12px";
    testButton.style.fontWeight = "500";

    const statusContainer = validationContainer.createDiv();
    statusContainer.style.display = "flex";
    statusContainer.style.alignItems = "center";
    statusContainer.style.gap = "10px";

    const statusIndicator = statusContainer.createSpan();
    statusIndicator.style.width = "10px";
    statusIndicator.style.height = "10px";
    statusIndicator.style.borderRadius = "50%";
    statusIndicator.style.backgroundColor = "var(--text-muted)";
    statusIndicator.style.flexShrink = "0";

    const statusText = statusContainer.createSpan();
    statusText.textContent = `Click 'Test Credentials' to verify your ${opts.providerName} setup`;
    statusText.style.color = "var(--text-muted)";
    statusText.style.fontSize = "12px";
    statusText.style.lineHeight = "1.3";

    const helpContainer = validationContainer.createDiv();
    helpContainer.style.marginTop = "8px";
    helpContainer.style.display = "none";

    const helpTextEl = helpContainer.createSpan();
    helpTextEl.textContent = opts.helpText;
    helpTextEl.style.color = "var(--text-muted)";
    helpTextEl.style.fontSize = "11px";

    const helpLink = helpContainer.createEl("a");
    helpLink.textContent = "View setup guide";
    helpLink.href = opts.helpUrl;
    helpLink.style.color = "var(--link-color)";
    helpLink.style.fontSize = "11px";
    helpLink.style.textDecoration = "none";
    helpLink.target = "_blank";
    helpLink.addEventListener("mouseover", () => {
      helpLink.style.textDecoration = "underline";
    });
    helpLink.addEventListener("mouseout", () => {
      helpLink.style.textDecoration = "none";
    });

    const updateStatus = (
      isValid: boolean | null,
      message: string,
      isLoading = false,
      voiceCount?: number,
    ) => {
      if (isLoading) {
        statusIndicator.style.backgroundColor = "var(--color-orange)";
        statusIndicator.style.animation = "pulse 1.5s ease-in-out infinite";
        statusText.textContent = "Testing credentials...";
        statusText.style.color = "var(--color-orange)";
        testButton.disabled = true;
        testButton.textContent = "Testing...";
        testButton.style.opacity = "0.6";
        testButton.style.cursor = "not-allowed";
        helpContainer.style.display = "none";
      } else {
        statusIndicator.style.animation = "none";
        testButton.disabled = false;
        testButton.textContent = "Test Credentials";
        testButton.style.opacity = "1";
        testButton.style.cursor = "pointer";

        if (isValid === true) {
          statusIndicator.style.backgroundColor = "var(--color-green)";
          statusText.textContent = voiceCount
            ? `✓ Credentials valid! Found ${voiceCount} voices available.`
            : "✓ Credentials are valid!";
          statusText.style.color = "var(--color-green)";
          helpContainer.style.display = "none";
        } else if (isValid === false) {
          statusIndicator.style.backgroundColor = "var(--color-red)";
          statusText.textContent = `✗ ${message}`;
          statusText.style.color = "var(--color-red)";
          helpContainer.style.display = "block";
        } else {
          statusIndicator.style.backgroundColor = "var(--text-muted)";
          statusText.textContent = message;
          statusText.style.color = "var(--text-muted)";
          helpContainer.style.display = "none";
        }
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

    testButton.addEventListener("click", validateCredentials);

    // Auto-validate on open if configured
    if (opts.isConfigured()) {
      setTimeout(() => {
        validateCredentials();
      }, 100);
    } else {
      updateStatus(null, opts.promptMessage);
    }
  }
}
