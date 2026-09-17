import { requestUrl } from "obsidian";
import {
  OPENAI_VOICES,
  type VoiceOption,
  type VoiceSettings,
} from "../settings/VoiceSettings";
import type { CredentialValidationResult } from "./SpeechProvider";
import { OpenAiSpeechService } from "./OpenAiSpeechService";
import {
  VOICE_LIST_PATHS,
  countModelEntries,
  mergeVoiceCatalog,
  normalizeBaseUrl,
  parseListInput,
  parseModelList,
  parseVoiceList,
} from "./openAiCompatible";

/**
 * Any server that implements OpenAI's `/audio/speech` API: routers such as
 * OpenRouter or LiteLLM, hosted APIs such as Groq or DeepInfra, and self-hosted
 * servers such as Kokoro-FastAPI, Speaches, or LocalAI.
 *
 * Synthesis, chunking, and playback are inherited from OpenAiSpeechService.
 * What differs: the server URL is user-configured, the API key is optional
 * (many local servers need none), the audio format is selectable (MP3 or WAV),
 * and models/voices are read from the server — merged with entries the user
 * added by hand — instead of coming from a fixed catalog.
 */
export class OpenAiCompatibleSpeechService extends OpenAiSpeechService {
  protected readonly providerLabel = "OpenAI-compatible server";

  private serverUrl: string;
  private voiceCatalog: VoiceOption[];
  private customVoices: string[];

  constructor(settings: VoiceSettings) {
    super(
      settings.OPENAI_COMPAT_API_KEY,
      settings.OPENAI_COMPAT_VOICE,
      settings.OPENAI_COMPAT_MODEL,
      Number(settings.SPEED),
    );
    this.serverUrl = "";
    this.voiceCatalog = [];
    this.customVoices = [];
    this.applySettings(settings);
  }

  updateCredentials(settings: VoiceSettings): void {
    this.applySettings(settings);
  }

  private applySettings(settings: VoiceSettings): void {
    this.apiKey = settings.OPENAI_COMPAT_API_KEY;
    // No default model: servers name their models differently, so an empty
    // model is sent as-is and servers that ignore it still work.
    this.model = settings.OPENAI_COMPAT_MODEL;
    this.serverUrl = settings.OPENAI_COMPAT_BASE_URL;
    this.responseFormat = settings.OPENAI_COMPAT_FORMAT;
    this.voiceCatalog = settings.openaiCompatVoiceCatalog ?? [];
    this.customVoices = parseListInput(settings.OPENAI_COMPAT_CUSTOM_VOICES);
  }

  getVoiceOptions(): VoiceOption[] {
    return mergeVoiceCatalog(
      this.voiceCatalog,
      this.customVoices,
      OPENAI_VOICES,
    );
  }

  protected baseUrl(): string {
    return normalizeBaseUrl(this.serverUrl) ?? "";
  }

  protected configurationError(): string | null {
    return normalizeBaseUrl(this.serverUrl) ? null : "Missing server URL";
  }

  /**
   * Check that the server is reachable (and the key accepted), and read its
   * models and voices. A server without a `/models` endpoint still counts as
   * valid — only the model list stays empty.
   */
  async validateCredentials(): Promise<CredentialValidationResult> {
    const base = normalizeBaseUrl(this.serverUrl);
    if (!base) {
      return {
        isValid: false,
        error: "Enter a server URL starting with http:// or https://.",
      };
    }

    let models: string[] = [];
    try {
      const response = await requestUrl({
        url: `${base}/models`,
        method: "GET",
        headers: this.authHeaders(),
        throw: false,
      });

      if (response.status === 401 || response.status === 403) {
        return {
          isValid: false,
          error: this.apiKey
            ? "The server rejected the API key."
            : "The server requires an API key.",
        };
      }
      if (response.status === 200) {
        const body = safeJson(response);
        // A server that answers 200 with no model list at all is almost
        // certainly not an OpenAI-compatible endpoint (a proxy or web page
        // answering on that URL), so say so instead of reporting success.
        if (countModelEntries(body) === 0) {
          return {
            isValid: false,
            error:
              "The server answered but listed no models — is this an OpenAI-compatible endpoint?",
          };
        }
        models = parseModelList(body);
      } else if (response.status !== 404) {
        return {
          isValid: false,
          error: `The server answered with HTTP ${response.status}. Check the URL.`,
        };
      }
    } catch (error) {
      console.error("OpenAI-compatible server check failed:", error);
      return {
        isValid: false,
        error:
          "Could not reach the server. Check the URL (localhost only works on this device).",
      };
    }

    const voices = await this.fetchVoices(base);
    return {
      isValid: true,
      voiceCount: voices.length || undefined,
      voices,
      models,
    };
  }

  /** The first non-empty voice list among the known voice endpoints. */
  private async fetchVoices(base: string): Promise<VoiceOption[]> {
    for (const path of VOICE_LIST_PATHS) {
      try {
        const response = await requestUrl({
          url: `${base}${path}`,
          method: "GET",
          headers: this.authHeaders(),
          throw: false,
        });
        if (response.status !== 200) {
          continue;
        }
        const voices = parseVoiceList(safeJson(response));
        if (voices.length > 0) {
          return voices;
        }
      } catch {
        // Endpoint missing or not JSON — try the next one.
      }
    }
    return [];
  }

  protected getErrorMessage(error: unknown): string {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: string }).message)
        : "";

    if (message.includes("Missing server URL")) {
      return "Add your server URL in settings.";
    }
    if (message.includes("401")) {
      return "The server rejected the API key.";
    }
    if (message.includes("429")) {
      return "The server's rate limit or quota was reached. Please wait and try again.";
    }
    if (message.includes("empty audio")) {
      return "The server returned no audio. Try a different voice or model.";
    }
    if (message.toLowerCase().includes("network")) {
      return "Could not reach the server. Check the URL and your connection.";
    }
    return message
      ? `Server error: ${message}`
      : "Server error. Please try again.";
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
