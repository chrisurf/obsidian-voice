import { requestUrl } from "obsidian";
import {
  OPENAI_VOICES,
  type VoiceOption,
  type VoiceSettings,
} from "../settings/VoiceSettings";
import { BaseSpeechService } from "./BaseSpeechService";
import { mapOpenAiModels, normalizeBaseUrl } from "./modelCatalog";
import type { CredentialValidationResult } from "./SpeechProvider";
import { chunkPlainText } from "./textChunker";

/**
 * OpenAI Text-to-Speech integration.
 *
 * - Receives plain spoken text from TextSpeaker (OpenAI's speech endpoint does
 *   not support SSML, so the text pipeline is used instead of the SSML pipeline).
 * - Chunks long notes to stay within the per-request input limit and
 *   concatenates the resulting MP3 blobs.
 * - Uses Obsidian's requestUrl() with a Bearer token to bypass browser CORS
 *   (same rationale as the other HTTP providers) and to keep the key out of
 *   fetch/XHR client requests.
 * - Playback/controls/caching are inherited from BaseSpeechService. Speed is
 *   applied client-side via the audio element, so it is not sent to the API.
 * - Supports OpenAI-compatible servers (self-hosted TTS) via a custom base
 *   URL: requests go to {base}/audio/speech and {base}/models, the API key
 *   becomes optional (many local servers are keyless), and validation returns
 *   the server's model list so the settings dropdown can offer it.
 */

const OPENAI_BASE_URL = "https://api.openai.com/v1";
// Conservative per-request size. The speech endpoint accepts up to ~4096
// characters; smaller chunks lower first-audio latency and stay safely under
// the limit for every model.
const MAX_CHUNK_CHARS = 2000;

export class OpenAiSpeechService extends BaseSpeechService {
  readonly inputFormat = "text" as const;

  private apiKey: string;
  private model: string;
  private customBaseUrl: string;

  constructor(
    apiKey: string,
    voice: string,
    model: string,
    speed?: number,
    baseUrl?: string,
  ) {
    super(voice, speed);
    this.apiKey = apiKey;
    this.model = model || "gpt-4o-mini-tts";
    this.customBaseUrl = normalizeBaseUrl(baseUrl);
  }

  private get baseUrl(): string {
    return this.customBaseUrl || OPENAI_BASE_URL;
  }

  private get isCustomEndpoint(): boolean {
    return this.customBaseUrl.length > 0;
  }

  // No Authorization header without a key — self-hosted servers are often keyless.
  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  getVoiceOptions(): VoiceOption[] {
    return OPENAI_VOICES;
  }

  updateCredentials(settings: VoiceSettings): void {
    this.apiKey = settings.OPENAI_API_KEY;
    this.model = settings.OPENAI_MODEL || "gpt-4o-mini-tts";
    this.customBaseUrl = normalizeBaseUrl(settings.OPENAI_BASE_URL);
  }

  /**
   * Synthesize and play plain text via OpenAI.
   */
  async speak(
    content: string,
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    if (this.isLoading) {
      throw new Error("OpenAI call already in progress.");
    }

    if (!this.apiKey && !this.isCustomEndpoint) {
      const error = new Error("Missing OpenAI API key");
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
      console.error("Error in OpenAI speak:", error);
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
      url: `${this.baseUrl}/audio/speech`,
      method: "POST",
      headers: this.buildHeaders({
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      }),
      body: JSON.stringify({
        model: this.model,
        input: text,
        voice: this.voice,
        response_format: "mp3",
      }),
      throw: false,
    });

    if (response.status === 401) {
      throw new Error("OpenAI: invalid or expired API key (401)");
    }
    if (response.status === 429) {
      throw new Error("OpenAI: rate limit or quota reached (429)");
    }
    if (response.status >= 400) {
      const message = response.json?.error?.message;
      throw new Error(
        `OpenAI API error (HTTP ${response.status})${
          message ? `: ${message}` : ""
        }`,
      );
    }

    const arrayBuffer = response.arrayBuffer;
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("OpenAI returned an empty audio response");
    }

    return new Blob([arrayBuffer], { type: "audio/mpeg" });
  }

  /**
   * Validate by probing the models endpoint. For custom servers the response
   * is also returned as a model catalog for the settings dropdown; the
   * official endpoint's is not — it lists every OpenAI model (chat,
   * embeddings, …) and the curated TTS list is the better UX there.
   */
  async validateCredentials(): Promise<CredentialValidationResult> {
    if (!this.apiKey && !this.isCustomEndpoint) {
      return { isValid: false, error: "Please enter your OpenAI API key." };
    }

    try {
      const response = await requestUrl({
        url: `${this.baseUrl}/models`,
        method: "GET",
        headers: this.buildHeaders(),
        throw: false,
      });

      if (response.status === 200) {
        const result: CredentialValidationResult = {
          isValid: true,
          voiceCount: OPENAI_VOICES.length,
        };
        if (this.isCustomEndpoint) {
          const models = mapOpenAiModels(response.json);
          if (models.length > 0) {
            result.models = models;
          }
        }
        return result;
      }
      if (response.status === 401) {
        return {
          isValid: false,
          error: this.isCustomEndpoint
            ? "The server rejected the API key (401)."
            : "Invalid or expired OpenAI API key.",
        };
      }
      return {
        isValid: false,
        error: `Validation failed (HTTP ${response.status}).`,
      };
    } catch (error) {
      console.error("OpenAI credential validation error:", error);
      return {
        isValid: false,
        error: this.isCustomEndpoint
          ? `Could not reach the server at ${this.baseUrl}. Check the URL and that the server is running.`
          : "Network error during validation. Please try again.",
      };
    }
  }

  protected getErrorMessage(error: unknown): string {
    if (error && typeof error === "object" && "message" in error) {
      const message = String((error as { message: string }).message);

      if (message.includes("401")) {
        return this.isCustomEndpoint
          ? "The server rejected the API key."
          : "Invalid OpenAI API key.";
      }
      if (message.includes("429")) {
        return "OpenAI rate limit or quota reached. Please wait and try again.";
      }
      if (message.includes("Missing OpenAI API key")) {
        return "Add your OpenAI API key in settings.";
      }
      if (message.includes("empty audio")) {
        return "OpenAI returned no audio. Try a different voice or model.";
      }
      if (message.toLowerCase().includes("network")) {
        return this.isCustomEndpoint
          ? `Could not reach the server at ${this.baseUrl}.`
          : "Connection failed. Check your internet.";
      }
      return `OpenAI error: ${message}`;
    }
    return "OpenAI error. Please try again.";
  }
}
