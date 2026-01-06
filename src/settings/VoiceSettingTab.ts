import { App, PluginSettingTab, Setting } from "obsidian";
import { Voice } from "../utils/VoicePlugin";
import { VOICES } from "./VoiceSettings";

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
    new Setting(containerEl)
      .setName("Voice")
      .setDesc(
        "Choose a voice tone, gender, and language for a personalized audio experience.",
      )
      .addDropdown((dropdown) => {
        VOICES.forEach((voice) => {
          dropdown.addOption(voice.id, voice.label);
        });
        dropdown
          .setValue(
            this.plugin.getPollyService().getVoice() ||
              this.plugin.settings.VOICE,
          )
          .onChange(async (value) => {
            this.plugin.settings.VOICE = value;
            await this.plugin.saveSettings();
            this.plugin.getPollyService().setVoice(value);
            this.plugin.iconEventHandler.updateVoiceDisplay();
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
              this.plugin.getPollyService().getSpeed(),
          )
          .setDynamicTooltip()
          .onChange(async (value) => {
            // Round to nearest 0.1 for clean values
            const roundedValue = Math.round(value * 10) / 10;
            this.plugin.settings.SPEED = roundedValue;
            await this.plugin.saveSettings();
            this.plugin.getPollyService().setSpeed(roundedValue);

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
              this.plugin.getPollyService().getSpeed();
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
        "When enabled, uppercase words like NASA or API are spelled out letter by letter. Disable this if you want uppercase words to be pronounced normally.",
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
            // Reinitialize PollyService with new region
            this.plugin.reinitializePollyService();
          });
      });

    // Track visibility state for Access Key ID (default: masked for security)
    let isAccessKeyVisible = false;

    new Setting(containerEl)
      .setName("AWS Access Key ID")
      .setDesc("The AWS Access Key ID for the Polly service.")
      .addText((text) => {
        text
          .setPlaceholder("Enter your AWS Access Key ID")
          .setValue(this.plugin.settings.AWS_ACCESS_KEY_ID)
          .onChange(async (value) => {
            this.plugin.settings.AWS_ACCESS_KEY_ID = value;
            await this.plugin.saveSettings();
            // Reinitialize PollyService with new credentials
            this.plugin.reinitializePollyService();
          });
        // Start with masked input for security
        text.inputEl.type = "password";
      })
      .addExtraButton((button) => {
        button
          .setIcon("eye") // eye icon = show (field is currently masked)
          .setTooltip("Show")
          .onClick(() => {
            isAccessKeyVisible = !isAccessKeyVisible;
            const inputEl =
              button.extraSettingsEl.parentElement?.querySelector("input");
            if (inputEl) {
              inputEl.type = isAccessKeyVisible ? "text" : "password";
              button.setIcon(isAccessKeyVisible ? "eye-off" : "eye");
              button.setTooltip(isAccessKeyVisible ? "Hide" : "Show");
            }
          });
      });

    // Track visibility state for Secret Access Key (default: masked for security)
    let isSecretKeyVisible = false;

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
            // Reinitialize PollyService with new credentials
            this.plugin.reinitializePollyService();
          });
        text.inputEl.type = "password";
      })
      .addExtraButton((button) => {
        button
          .setIcon("eye") // eye icon = show (field is currently masked)
          .setTooltip("Show")
          .onClick(() => {
            isSecretKeyVisible = !isSecretKeyVisible;
            const inputEl =
              button.extraSettingsEl.parentElement?.querySelector("input");
            if (inputEl) {
              inputEl.type = isSecretKeyVisible ? "text" : "password";
              button.setIcon(isSecretKeyVisible ? "eye-off" : "eye");
              button.setTooltip(isSecretKeyVisible ? "Hide" : "Show");
            }
          });
      });

    // AWS Credential Validation Section
    const validationContainer = containerEl.createDiv();
    validationContainer.style.marginTop = "16px";
    validationContainer.style.padding = "12px 16px";
    validationContainer.style.backgroundColor = "var(--background-secondary)";
    validationContainer.style.borderRadius = "6px";
    validationContainer.style.border =
      "1px solid var(--background-modifier-border)";

    // Header and button row
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
    statusText.textContent =
      "Click 'Test Credentials' to verify your AWS setup";
    statusText.style.color = "var(--text-muted)";
    statusText.style.fontSize = "12px";
    statusText.style.lineHeight = "1.3";

    // Help link for AWS setup (only shown when credentials are invalid)
    const helpContainer = validationContainer.createDiv();
    helpContainer.style.marginTop = "8px";
    helpContainer.style.display = "none"; // Hidden by default

    const helpText = helpContainer.createSpan();
    helpText.textContent = "Need help with creating AWS credentials? ";
    helpText.style.color = "var(--text-muted)";
    helpText.style.fontSize = "11px";

    const helpLink = helpContainer.createEl("a");
    helpLink.textContent = "View setup guide";
    helpLink.href =
      "https://github.com/chrisurf/obsidian-voice?tab=readme-ov-file#setting-up-your-aws-account-required";
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
        helpContainer.style.display = "none"; // Hide help during loading
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
          helpContainer.style.display = "none"; // Hide help when valid
        } else if (isValid === false) {
          statusIndicator.style.backgroundColor = "var(--color-red)";
          statusText.textContent = `✗ ${message}`;
          statusText.style.color = "var(--color-red)";
          helpContainer.style.display = "block"; // Show help when invalid
        } else {
          statusIndicator.style.backgroundColor = "var(--text-muted)";
          statusText.textContent = message;
          statusText.style.color = "var(--text-muted)";
          helpContainer.style.display = "none"; // Hide help for neutral state
        }
      }
    };

    const validateCredentials = async () => {
      const accessKeyId = this.plugin.settings.AWS_ACCESS_KEY_ID;
      const secretAccessKey = this.plugin.settings.AWS_SECRET_ACCESS_KEY;
      const region = this.plugin.settings.AWS_REGION;

      if (!accessKeyId || !secretAccessKey || !region) {
        updateStatus(
          false,
          "Please fill in all AWS credentials (Access Key ID, Secret Access Key, and Region) before testing.",
        );
        return;
      }

      updateStatus(null, "", true);

      try {
        // Create a temporary service instance for validation
        const tempService = new (
          await import("../service/AwsPollyService")
        ).AwsPollyService(
          {
            credentials: {
              accessKeyId: accessKeyId,
              secretAccessKey: secretAccessKey,
            },
            region: region,
          },
          this.plugin.settings.VOICE,
          this.plugin.settings.SPEED,
        );

        const result = await tempService.validateCredentials();

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

    // Automatically validate credentials when settings page opens
    const performAutoValidation = async () => {
      const accessKeyId = this.plugin.settings.AWS_ACCESS_KEY_ID;
      const secretAccessKey = this.plugin.settings.AWS_SECRET_ACCESS_KEY;
      const region = this.plugin.settings.AWS_REGION;

      // Only auto-validate if all credentials are present
      if (accessKeyId && secretAccessKey && region) {
        // Add a small delay to let the UI render first
        setTimeout(() => {
          validateCredentials();
        }, 100);
      } else {
        // Show helpful message if credentials are missing
        updateStatus(
          null,
          "Enter your AWS credentials above, then click 'Test Credentials' to validate",
        );
      }
    };

    testButton.addEventListener("click", validateCredentials);

    // Perform automatic validation
    performAutoValidation();

    // Add CSS for pulse animation
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
}
