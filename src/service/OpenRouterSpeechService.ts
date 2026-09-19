import { requestUrl } from "obsidian";
import {
  OPENAI_VOICES,
  type OpenRouterModel,
  type VoiceOption,
  type VoiceSettings,
} from "../settings/VoiceSettings";
import type { CredentialValidationResult } from "./SpeechProvider";
import { OpenAiSpeechService } from "./OpenAiSpeechService";
import {
  OPENROUTER_BASE_URL,
  OPENROUTER_MODELS_PATH,
  parseOpenRouterModels,
  reconcileOpenRouterModel,
  voicesForModel,
} from "./openRouter";

/**
 * OpenRouter's hosted TTS. A dedicated provider rather than a special case of
 * the OpenAI-compatible one because OpenRouter's model/voice shape differs: the
 * `/models/user` endpoint returns each model with its OWN `supported_voices`
 * list (there is no server-wide voice list), and the API root is fixed — so
 * there is no server URL to configure and no config to collide with other
 * OpenAI-compatible servers.
 *
 * Synthesis, chunking, and playback are inherited from OpenAiSpeechService
 * (OpenRouter speaks the same `/audio/speech` API). What differs: a fixed base
 * URL, a required API key, and models/voices read from OpenRouter's catalog —
 * with the valid voice set tied to the selected model, since OpenRouter voices
 * are per-model.
 */
export class OpenRouterSpeechService extends OpenAiSpeechService {
  protected readonly providerLabel = "OpenRouter";

  private voiceCatalog: OpenRouterModel[] = [];

  constructor(settings: VoiceSettings) {
    super(
      settings.OPENROUTER_API_KEY,
      settings.OPENROUTER_VOICE,
      settings.OPENROUTER_MODEL,
      Number(settings.SPEED),
    );
    this.applySettings(settings);
  }

  updateCredentials(settings: VoiceSettings): void {
    this.applySettings(settings);
  }

  private applySettings(settings: VoiceSettings): void {
    this.apiKey = settings.OPENROUTER_API_KEY;
    this.voiceCatalog = settings.openrouterModelCatalog ?? [];
    // Never synthesize with a known PCM-only model — a user may still have one
    // saved from before it was denylisted (or re-added it by hand), and MP3
    // requests to it always fail. Reconcile onto the first MP3-capable model.
    this.model = reconcileOpenRouterModel(
      settings.OPENROUTER_MODEL,
      this.voiceCatalog,
    );
    this.responseFormat = "mp3";
    // Some models (e.g. Sesame CSM) reject a request with no voice, and
    // others reject a voice that isn't theirs. When the saved voice is empty
    // or no longer offered by the selected model, fall back to the model's
    // first supported voice so synthesis never sends a blank or invalid one.
    const options = voicesForModel(this.voiceCatalog, this.model, []);
    if (options.length > 0 && !options.some((v) => v.id === this.voice)) {
      this.voice = options[0].id;
    }
  }

  protected baseUrl(): string {
    return OPENROUTER_BASE_URL;
  }

  protected configurationError(): string | null {
    return this.apiKey ? null : "Missing OpenRouter API key";
  }

  getVoiceOptions(): VoiceOption[] {
    return voicesForModel(this.voiceCatalog, this.model, OPENAI_VOICES);
  }

  /**
   * Validate the API key by reading OpenRouter's speech-model catalog. On a
   * 200 the whole catalog (models with their per-model voices) is returned so
   * the settings can cache it and offer every model and voice.
   */
  async validateCredentials(): Promise<CredentialValidationResult> {
    if (!this.apiKey) {
      return { isValid: false, error: "Please enter your OpenRouter API key." };
    }

    try {
      const response = await requestUrl({
        url: `${OPENROUTER_BASE_URL}${OPENROUTER_MODELS_PATH}`,
        method: "GET",
        headers: this.authHeaders(),
        throw: false,
      });

      if (response.status === 401 || response.status === 403) {
        return {
          isValid: false,
          error: "OpenRouter rejected the API key.",
        };
      }
      if (response.status !== 200) {
        return {
          isValid: false,
          error: `OpenRouter answered with HTTP ${response.status}.`,
        };
      }

      const catalog = parseOpenRouterModels(safeJson(response));
      if (catalog.length === 0) {
        return {
          isValid: false,
          error:
            "OpenRouter answered but listed no speech models — is your key subscribed to a TTS model?",
        };
      }

      const voices = voicesForModel(catalog, this.model, []);
      return {
        isValid: true,
        voiceCount: voices.length || undefined,
        voices,
        models: catalog.map((m) => m.id),
        modelCatalog: catalog,
      };
    } catch (error) {
      console.error("OpenRouter credential validation error:", error);
      return {
        isValid: false,
        error:
          "Could not reach OpenRouter. Check your connection and try again.",
      };
    }
  }

  protected getErrorMessage(error: unknown): string {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: string }).message)
        : "";

    if (message.includes("Missing OpenRouter API key")) {
      return "Add your OpenRouter API key in settings.";
    }
    if (message.includes("401")) {
      return "OpenRouter rejected the API key.";
    }
    if (message.includes("429")) {
      return "OpenRouter's rate limit or quota was reached. Please wait and try again.";
    }
    if (message.includes("empty audio")) {
      return "OpenRouter returned no audio. Try a different voice or model.";
    }
    if (message.toLowerCase().includes("network")) {
      return "Could not reach OpenRouter. Check your connection.";
    }
    return message
      ? `OpenRouter error: ${message}`
      : "OpenRouter error. Please try again.";
  }
}

/** Parsed JSON body, or null when the body is not JSON. */
function safeJson(response: { json?: unknown }): unknown {
  try {
    return response.json ?? null;
  } catch {
    return null;
  }
}
