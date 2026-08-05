import { requestUrl } from "obsidian";
import {
  CARTESIA_VOICES,
  type VoiceOption,
  type VoiceSettings,
} from "../settings/VoiceSettings";
import { BaseSpeechService } from "./BaseSpeechService";
import type { CredentialValidationResult } from "./SpeechProvider";
import { chunkPlainText } from "./textChunker";
import { mapCartesiaVoices } from "./voiceCatalog";

/**
 * Cartesia (Sonic) Text-to-Speech integration.
 *
 * - Receives plain spoken text from TextSpeaker (Cartesia takes plain text, so
 *   the text pipeline is used). Cartesia understands no pause markup, so it uses
 *   the "none" pause style (newline boundaries) inherited via textPauseStyle.
 * - Uses the synchronous /tts/bytes endpoint, which returns the MP3 bytes
 *   directly in the response body; long notes are chunked and concatenated.
 * - Cartesia voice ids are opaque UUIDs, so getVoiceOptions() returns the
 *   account catalog fetched from /voices on "Test Credentials" (cached in
 *   settings.cartesiaVoiceCatalog), falling back to CARTESIA_VOICES.
 * - Uses Obsidian's requestUrl() to bypass browser CORS and keep the key out of
 *   fetch/XHR. Speed is applied client-side via the audio element.
 */

const CARTESIA_BASE_URL = "https://api.cartesia.ai";
// A dated API version is required on every request; this stable version's
// schema matches the request/response shapes below.
const CARTESIA_VERSION = "2024-11-13";
// Conservative per-request size to keep first-audio latency low and stay well
// within the endpoint's transcript limit.
const MAX_CHUNK_CHARS = 2500;

export class CartesiaSpeechService extends BaseSpeechService {
  readonly inputFormat = "text" as const;

  private apiKey: string;
  private model: string;
  private language: string;
  // The full catalog fetched on "Test Credentials" (cached in settings). Falls
  // back to the curated CARTESIA_VOICES list until the user has validated.
  private dynamicVoices: VoiceOption[] | null;

  constructor(
    apiKey: string,
    voice: string,
    model: string,
    language: string,
    speed?: number,
    voiceCatalog?: VoiceOption[],
  ) {
    super(voice, speed);
    this.apiKey = apiKey;
    this.model = model || "sonic-2";
    this.language = language || "en";
    this.dynamicVoices =
      voiceCatalog && voiceCatalog.length > 0 ? voiceCatalog : null;
  }

  getVoiceOptions(): VoiceOption[] {
    return this.dynamicVoices ?? CARTESIA_VOICES;
  }

  updateCredentials(settings: VoiceSettings): void {
    this.apiKey = settings.CARTESIA_API_KEY;
    this.model = settings.CARTESIA_MODEL || "sonic-2";
    this.language = settings.CARTESIA_LANGUAGE || "en";
    this.dynamicVoices =
      settings.cartesiaVoiceCatalog && settings.cartesiaVoiceCatalog.length > 0
        ? settings.cartesiaVoiceCatalog
        : null;
  }

  private headers(): Record<string, string> {
    return {
      "X-API-Key": this.apiKey,
      "Cartesia-Version": CARTESIA_VERSION,
      "Content-Type": "application/json",
    };
  }

  /**
   * Synthesize and play plain text via Cartesia.
   */
  async speak(
    content: string,
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    if (this.isLoading) {
      throw new Error("Cartesia call already in progress.");
    }

    if (!this.apiKey) {
      const error = new Error("Missing Cartesia API key");
      this.reportError(error);
      throw error;
    }

    const text = content.trim();
    if (!text) {
      return;
    }

    this.isLoading = true;
    try {
      this.reportProgress(0, 1);

      const chunks = chunkPlainText(text, MAX_CHUNK_CHARS);
      const audioBlobs: Blob[] = [];

      for (let i = 0; i < chunks.length; i++) {
        if (this.abortController?.signal.aborted) {
          throw new Error("AbortError");
        }

        const blob = await this.synthesizeChunk(chunks[i]);

        if (this.abortController?.signal.aborted) {
          throw new Error("AbortError");
        }

        audioBlobs.push(blob);

        // Reserve the last slice of the bar for concatenation + buffering.
        this.reportProgress(((i + 1) / chunks.length) * 0.95, 1);
      }

      const finalBlob = new Blob(audioBlobs, { type: "audio/mpeg" });
      this.playBlob(finalBlob, speed, filePath);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Error in Cartesia speak:", error);
      this.reportError(error);
      throw error;
    } finally {
      this.isLoading = false;
      this.abortController = undefined;
    }
  }

  /**
   * Synthesize a single text chunk and return the MP3 blob.
   */
  private async synthesizeChunk(text: string): Promise<Blob> {
    const response = await requestUrl({
      url: `${CARTESIA_BASE_URL}/tts/bytes`,
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model_id: this.model,
        transcript: text,
        voice: { mode: "id", id: this.voice },
        language: this.language,
        output_format: {
          container: "mp3",
          sample_rate: 44100,
          bit_rate: 128000,
        },
      }),
      throw: false,
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error("Cartesia: invalid API key (HTTP 401)");
    }
    if (response.status === 429) {
      throw new Error("Cartesia: rate limit or quota reached (429)");
    }
    if (response.status >= 400) {
      throw new Error(`Cartesia API error (HTTP ${response.status})`);
    }

    const arrayBuffer = response.arrayBuffer;
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("Cartesia returned an empty audio response");
    }

    return new Blob([arrayBuffer], { type: "audio/mpeg" });
  }

  /**
   * Validate the API key by listing voices; a 200 means the key works and lets
   * us cache the account's full voice catalog for the picker.
   */
  async validateCredentials(): Promise<CredentialValidationResult> {
    if (!this.apiKey) {
      return { isValid: false, error: "Please enter your Cartesia API key." };
    }

    try {
      const response = await requestUrl({
        url: `${CARTESIA_BASE_URL}/voices`,
        method: "GET",
        headers: {
          "X-API-Key": this.apiKey,
          "Cartesia-Version": CARTESIA_VERSION,
        },
        throw: false,
      });

      if (response.status === 200) {
        const mapped = mapCartesiaVoices(response.json);
        return {
          isValid: true,
          voiceCount: mapped.length,
          voices: mapped,
        };
      }
      if (response.status === 401 || response.status === 403) {
        return { isValid: false, error: "Invalid Cartesia API key." };
      }
      return {
        isValid: false,
        error: `Validation failed (HTTP ${response.status}).`,
      };
    } catch (error) {
      console.error("Cartesia credential validation error:", error);
      return {
        isValid: false,
        error: "Network error during validation. Please try again.",
      };
    }
  }

  protected getErrorMessage(error: unknown): string {
    if (error && typeof error === "object" && "message" in error) {
      const message = String((error as { message: string }).message);

      if (
        message.includes("401") ||
        message.toLowerCase().includes("api key")
      ) {
        return "Invalid Cartesia API key.";
      }
      if (message.includes("Missing Cartesia API key")) {
        return "Add your Cartesia API key in settings.";
      }
      if (message.includes("429")) {
        return "Cartesia rate limit or quota reached. Please wait and try again.";
      }
      if (message.includes("empty audio")) {
        return "Cartesia returned no audio. Try a different voice or model.";
      }
      if (message.toLowerCase().includes("network")) {
        return "Connection failed. Check your internet.";
      }
      return `Cartesia error: ${message}`;
    }
    return "Cartesia error. Please try again.";
  }
}
