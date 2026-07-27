import {
  App,
  PluginSettingTab,
  Setting,
  type SettingDefinitionItem,
} from "obsidian";
import { Voice } from "../utils/VoicePlugin";
import {
  ELEVENLABS_MODELS,
  AZURE_REGIONS,
  OPENAI_MODELS,
  MIN_SKIP_SECONDS,
  MAX_SKIP_SECONDS,
  type TtsProvider,
} from "./VoiceSettings";
import { createSpeechProvider } from "../service/SpeechProviderFactory";

export class VoiceSettingTab extends PluginSettingTab {
  plugin: Voice;

  /**
   * Container holding the active provider's credential section in the
   * declarative (1.13+) path. Kept so a provider switch can re-render just that
   * section in place, without the 1.13-only `update()` (which would exceed the
   * manifest's 1.7.2 minAppVersion).
   */
  private providerSectionEl: HTMLElement | null = null;

  constructor(app: App, plugin: Voice) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /** Seconds label, e.g. "3s". */
  private formatSecondsValue(seconds: number): string {
    return `${seconds}s`;
  }

  /** Append a live value readout to a slider setting's control row. */
  private appendSliderValue(setting: Setting, text: string): HTMLElement {
    const valueEl = setting.controlEl.createSpan({ cls: "voice-slider-value" });
    valueEl.setText(text);
    return valueEl;
  }

  /**
   * Platform-aware, read-only description for the "Save location" info row. It
   * states where MP3s currently go and how to pick a default folder.
   */
  private audioSaveLocationDesc(): string {
    const hold = this.plugin.isMobile()
      ? "touch & hold"
      : "hold (or right-click)";
    const current =
      this.plugin.settings.defaultAudioFolder.trim() === ""
        ? "MP3s are saved next to the note."
        : `MP3s are saved to “${this.plugin.settings.defaultAudioFolder}”.`;
    return (
      `${current} To set a default folder, ${hold} the save button to open ` +
      "the folder picker, then tap the pin on a folder (tap it again to clear)."
    );
  }

  display(): void {
    // Fallback path for Obsidian < 1.13, which has no getSettingDefinitions().
    // On 1.13+ this is never called: getSettingDefinitions() returns a
    // non-empty array, so the app renders the tab declaratively (and its
    // settings become searchable) instead of invoking display(). We keep both
    // because the manifest's minAppVersion is 1.7.2.
    //
    // TODO: Obsidian 1.13 (which introduced getSettingDefinitions) is beta-only
    // as of 2026-07. Once 1.13 is stable and we raise minAppVersion to >= 1.13,
    // this display() fallback — and the get/setControlValue re-render plumbing
    // that avoids the 1.13-only update() — can be removed and the tab can rely
    // solely on getSettingDefinitions(). Track 1.13's stable release.
    this.render();
  }

  /**
   * Declarative settings for Obsidian 1.13+. Returning a non-empty array makes
   * the app render the tab from these definitions — which is what surfaces the
   * settings in the global settings search — and skip display() entirely.
   *
   * The simple settings are plain `control` definitions bound through
   * get/setControlValue below. The provider-specific credential section stays
   * imperative (password masking, async validation, provider switching) and is
   * mounted via a single `render` item that reuses the exact same code path as
   * the display() fallback — no logic is duplicated between the two.
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: "Speech provider",
        desc: "Choose which text-to-speech engine to use. AWS Polly, ElevenLabs, and Google Cloud offer the same plugin features; each uses its own credentials and voices.",
        control: {
          type: "dropdown",
          key: "TTS_PROVIDER",
          options: {
            polly: "AWS Polly",
            elevenlabs: "ElevenLabs",
            google: "Google Cloud",
            azure: "Azure Speech",
            openai: "OpenAI",
          },
        },
      },
      {
        type: "group",
        heading: "Playback",
        items: [
          {
            name: "Rewind interval",
            desc: `How many seconds the rewind control jumps back (${MIN_SKIP_SECONDS}–${MAX_SKIP_SECONDS}s).`,
            control: {
              type: "slider",
              key: "rewindSeconds",
              min: MIN_SKIP_SECONDS,
              max: MAX_SKIP_SECONDS,
              step: 1,
              displayFormat: (value) => this.formatSecondsValue(value),
            },
          },
          {
            name: "Fast-forward interval",
            desc: `How many seconds the fast-forward control jumps ahead (${MIN_SKIP_SECONDS}–${MAX_SKIP_SECONDS}s).`,
            control: {
              type: "slider",
              key: "forwardSeconds",
              min: MIN_SKIP_SECONDS,
              max: MAX_SKIP_SECONDS,
              step: 1,
              displayFormat: (value) => this.formatSecondsValue(value),
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Saving audio",
        items: [
          // Informational only — the save location is managed from the
          // player's folder picker (no control here).
          {
            name: "Save location",
            desc: this.audioSaveLocationDesc(),
          },
          {
            name: "Save automatically",
            desc: "Save the MP3 after each playback, without pressing save.",
            control: { type: "toggle", key: "autoDownloadAudio" },
          },
        ],
      },
      {
        type: "group",
        heading: "Player",
        items: [
          {
            name: "Play the note's saved audio",
            desc: "When you press play, load the MP3 already saved for the note you're viewing (matched by name) instead of re-generating it — even if another chapter is loaded. Off keeps the loaded chapter playing and always re-generates notes.",
            control: { type: "toggle", key: "playNoteSavedAudio" },
          },
          {
            name: "Folder list follows note",
            desc: "The player's folder list jumps to the current note's folder. Off keeps your chosen folder.",
            control: { type: "toggle", key: "folderSelectorFollowsNote" },
          },
        ],
      },
      {
        // Provider-specific credentials. This synthetic row only exists to give
        // us a mount point; we drop it and render the active provider's full
        // section (heading + fields) into a dedicated child of the tab
        // container, reusing the same imperative code the display() fallback
        // uses. Mounting via plain DOM (rather than the 1.11-only
        // `SettingGroup.listEl`) keeps us within the 1.7.2 minAppVersion.
        name: "",
        searchable: false,
        render: (setting) => {
          const host = setting.settingEl.parentElement;
          setting.settingEl.remove();
          if (!host) {
            return;
          }
          this.providerSectionEl = host.createDiv();
          this.renderActiveProviderSettings(this.providerSectionEl);
        },
      },
    ];
  }

  /** Read a declarative control's value from the plugin settings. */
  getControlValue(key: string): unknown {
    switch (key) {
      case "TTS_PROVIDER":
        return this.plugin.settings.TTS_PROVIDER;
      case "rewindSeconds":
        return this.plugin.settings.rewindSeconds;
      case "forwardSeconds":
        return this.plugin.settings.forwardSeconds;
      case "autoDownloadAudio":
        return this.plugin.settings.autoDownloadAudio;
      case "playNoteSavedAudio":
        return this.plugin.settings.playNoteSavedAudio;
      case "folderSelectorFollowsNote":
        return this.plugin.settings.folderSelectorFollowsNote;
      default:
        return undefined;
    }
  }

  /**
   * Persist a declarative control's value and run the same side effects the
   * imperative onChange handlers do (skip intervals, provider re-init). A
   * provider switch re-renders the credential section in place (see
   * providerSectionEl) so the right fields show for the new provider.
   */
  async setControlValue(key: string, value: unknown): Promise<void> {
    switch (key) {
      case "TTS_PROVIDER":
        this.plugin.settings.TTS_PROVIDER = value as TtsProvider;
        await this.plugin.saveSettings();
        this.plugin.reinitializeProvider();
        if (this.providerSectionEl) {
          this.providerSectionEl.empty();
          this.renderActiveProviderSettings(this.providerSectionEl);
        }
        break;
      case "rewindSeconds":
        this.plugin.settings.rewindSeconds = value as number;
        await this.plugin.saveSettings();
        this.plugin.updateSkipIntervals();
        break;
      case "forwardSeconds":
        this.plugin.settings.forwardSeconds = value as number;
        await this.plugin.saveSettings();
        this.plugin.updateSkipIntervals();
        break;
      case "autoDownloadAudio":
        this.plugin.settings.autoDownloadAudio = value as boolean;
        await this.plugin.saveSettings();
        break;
      case "playNoteSavedAudio":
        this.plugin.settings.playNoteSavedAudio = value as boolean;
        await this.plugin.saveSettings();
        break;
      case "folderSelectorFollowsNote":
        this.plugin.settings.folderSelectorFollowsNote = value as boolean;
        await this.plugin.saveSettings();
        break;
    }
  }

  /**
   * Render the active provider's credential section into `containerEl`. Shared
   * by the declarative render item (1.13+) and the display() fallback (<1.13).
   */
  private renderActiveProviderSettings(containerEl: HTMLElement): void {
    if (this.plugin.settings.TTS_PROVIDER === "elevenlabs") {
      this.displayElevenLabsSettings(containerEl);
    } else if (this.plugin.settings.TTS_PROVIDER === "google") {
      this.displayGoogleSettings(containerEl);
    } else if (this.plugin.settings.TTS_PROVIDER === "azure") {
      this.displayAzureSettings(containerEl);
    } else if (this.plugin.settings.TTS_PROVIDER === "openai") {
      this.displayOpenAISettings(containerEl);
    } else {
      this.displayPollySettings(containerEl);
    }
  }

  private render(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Provider selection
    new Setting(containerEl)
      .setName("Speech Provider")
      .setDesc(
        "Choose which text-to-speech engine to use. AWS Polly, ElevenLabs, and Google Cloud offer the same plugin features; each uses its own credentials and voices.",
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOption("polly", "AWS Polly")
          .addOption("elevenlabs", "ElevenLabs")
          .addOption("google", "Google Cloud")
          .addOption("azure", "Azure Speech")
          .addOption("openai", "OpenAI")
          .setValue(this.plugin.settings.TTS_PROVIDER)
          .onChange(async (value) => {
            this.plugin.settings.TTS_PROVIDER = value as TtsProvider;
            await this.plugin.saveSettings();
            // Swap the active provider and rewire the UI/orchestration
            this.plugin.reinitializeProvider();
            // Re-render so provider-specific fields and voices update.
            this.render();
          });
      });

    new Setting(containerEl).setName("Playback").setHeading();

    const rewindSetting = new Setting(containerEl)
      .setName("Rewind interval")
      .setDesc(
        `How many seconds the rewind control jumps back (${MIN_SKIP_SECONDS}–${MAX_SKIP_SECONDS}s).`,
      );
    let rewindValueEl: HTMLElement;
    rewindSetting.addSlider((slider) =>
      slider
        .setLimits(MIN_SKIP_SECONDS, MAX_SKIP_SECONDS, 1)
        .setValue(this.plugin.settings.rewindSeconds)
        .onChange(async (value) => {
          this.plugin.settings.rewindSeconds = value;
          await this.plugin.saveSettings();
          this.plugin.updateSkipIntervals();
          rewindValueEl.setText(this.formatSecondsValue(value));
        }),
    );
    rewindValueEl = this.appendSliderValue(
      rewindSetting,
      this.formatSecondsValue(this.plugin.settings.rewindSeconds),
    );

    const forwardSetting = new Setting(containerEl)
      .setName("Fast-forward interval")
      .setDesc(
        `How many seconds the fast-forward control jumps ahead (${MIN_SKIP_SECONDS}–${MAX_SKIP_SECONDS}s).`,
      );
    let forwardValueEl: HTMLElement;
    forwardSetting.addSlider((slider) =>
      slider
        .setLimits(MIN_SKIP_SECONDS, MAX_SKIP_SECONDS, 1)
        .setValue(this.plugin.settings.forwardSeconds)
        .onChange(async (value) => {
          this.plugin.settings.forwardSeconds = value;
          await this.plugin.saveSettings();
          this.plugin.updateSkipIntervals();
          forwardValueEl.setText(this.formatSecondsValue(value));
        }),
    );
    forwardValueEl = this.appendSliderValue(
      forwardSetting,
      this.formatSecondsValue(this.plugin.settings.forwardSeconds),
    );

    new Setting(containerEl).setName("Saving audio").setHeading();

    // Informational only — the save location is managed from the player's
    // folder picker (no toggle here). Explains how to set a default folder.
    new Setting(containerEl)
      .setName("Save location")
      .setDesc(this.audioSaveLocationDesc());

    new Setting(containerEl)
      .setName("Save automatically")
      .setDesc("Save the MP3 after each playback, without pressing save.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoDownloadAudio)
          .onChange(async (value) => {
            this.plugin.settings.autoDownloadAudio = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName("Player").setHeading();

    new Setting(containerEl)
      .setName("Play the note's saved audio")
      .setDesc(
        "When you press play, load the MP3 already saved for the note you're viewing (matched by name) instead of re-generating it — even if another chapter is loaded. Off keeps the loaded chapter playing and always re-generates notes.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.playNoteSavedAudio)
          .onChange(async (value) => {
            this.plugin.settings.playNoteSavedAudio = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Folder list follows note")
      .setDesc(
        "The player's folder list jumps to the current note's folder. Off keeps your chosen folder.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.folderSelectorFollowsNote)
          .onChange(async (value) => {
            this.plugin.settings.folderSelectorFollowsNote = value;
            await this.plugin.saveSettings();
          }),
      );

    // Provider-specific credentials
    this.renderActiveProviderSettings(containerEl);
  }

  private displayOpenAISettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("OpenAI").setHeading();

    new Setting(containerEl)
      .setName("Model")
      .setDesc(
        "The OpenAI text-to-speech model. GPT-4o mini TTS is recommended; TTS-1 favours latency and TTS-1 HD favours quality.",
      )
      .addDropdown((dropdown) => {
        OPENAI_MODELS.forEach((model) => {
          dropdown.addOption(model.id, model.label);
        });
        dropdown
          .setValue(this.plugin.settings.OPENAI_MODEL)
          .onChange(async (value) => {
            this.plugin.settings.OPENAI_MODEL = value;
            await this.plugin.saveSettings();
            this.plugin.reinitializeProviderCredentials();
          });
      });

    this.addPasswordSetting(
      containerEl,
      "OpenAI API Key",
      "Your OpenAI API key (from the OpenAI dashboard → API keys).",
      "Enter your OpenAI API key",
      this.plugin.settings.OPENAI_API_KEY,
      async (value) => {
        this.plugin.settings.OPENAI_API_KEY = value;
        await this.plugin.saveSettings();
        this.plugin.reinitializeProviderCredentials();
      },
    );

    this.renderCredentialValidation(containerEl, {
      providerName: "OpenAI",
      isConfigured: () => !!this.plugin.settings.OPENAI_API_KEY,
      missingMessage: "Please enter your OpenAI API key before testing.",
      promptMessage:
        "Enter your OpenAI API key above, then click 'Test Credentials' to validate",
      helpText: "Need an OpenAI API key? ",
      helpUrl: "https://platform.openai.com/api-keys",
    });
  }

  private displayAzureSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Azure Speech").setHeading();

    new Setting(containerEl)
      .setName("Region")
      .setDesc("The Azure region of your Speech resource (must match the key).")
      .addDropdown((dropdown) => {
        AZURE_REGIONS.forEach((region) => {
          dropdown.addOption(region.id, region.label);
        });
        dropdown
          .setValue(this.plugin.settings.AZURE_REGION)
          .onChange(async (value) => {
            this.plugin.settings.AZURE_REGION = value;
            await this.plugin.saveSettings();
            this.plugin.reinitializeProviderCredentials();
          });
      });

    this.addPasswordSetting(
      containerEl,
      "Azure Speech Key",
      "A key for your Azure AI Speech resource (Azure portal → your Speech resource → Keys and Endpoint).",
      "Enter your Azure Speech key",
      this.plugin.settings.AZURE_API_KEY,
      async (value) => {
        this.plugin.settings.AZURE_API_KEY = value;
        await this.plugin.saveSettings();
        this.plugin.reinitializeProviderCredentials();
      },
    );

    this.renderCredentialValidation(containerEl, {
      providerName: "Azure Speech",
      isConfigured: () =>
        !!this.plugin.settings.AZURE_API_KEY &&
        !!this.plugin.settings.AZURE_REGION,
      missingMessage:
        "Please enter your Azure Speech key and choose a region before testing.",
      promptMessage:
        "Enter your Azure Speech key and region above, then click 'Test Credentials' to validate",
      helpText: "Need an Azure Speech resource? ",
      helpUrl:
        "https://learn.microsoft.com/azure/ai-services/speech-service/get-started-text-to-speech",
    });
  }

  private displayGoogleSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Google Cloud").setHeading();

    this.addPasswordSetting(
      containerEl,
      "Google Cloud API Key",
      "An API key for the Cloud Text-to-Speech API. Restrict it to that API only (no HTTP-referrer restriction) so it works from the desktop app.",
      "Enter your Google Cloud API key",
      this.plugin.settings.GOOGLE_API_KEY,
      async (value) => {
        this.plugin.settings.GOOGLE_API_KEY = value;
        await this.plugin.saveSettings();
        this.plugin.reinitializeProviderCredentials();
      },
    );

    this.renderCredentialValidation(containerEl, {
      providerName: "Google Cloud",
      isConfigured: () => !!this.plugin.settings.GOOGLE_API_KEY,
      missingMessage: "Please enter your Google Cloud API key before testing.",
      promptMessage:
        "Enter your Google Cloud API key above, then click 'Test Credentials' to validate",
      helpText: "Need a Google Cloud API key? ",
      helpUrl: "https://console.cloud.google.com/apis/credentials",
    });
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
          // Cache a freshly fetched voice catalog (Azure) so the picker can
          // offer every voice grouped by language, then resync the player.
          if (
            result.voices &&
            result.voices.length > 0 &&
            this.plugin.settings.TTS_PROVIDER === "azure"
          ) {
            this.plugin.settings.azureVoiceCatalog = result.voices;
            await this.plugin.saveSettings();
            this.plugin.reinitializeProviderCredentials();
            this.plugin.refreshVoicePlayerControls();
          }
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
      window.setTimeout(() => {
        void validateCredentials();
      }, 100);
    } else {
      updateStatus(null, opts.promptMessage);
    }
  }
}
