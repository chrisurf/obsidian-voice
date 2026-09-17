import { requestUrl } from "obsidian";
import {
  OPENAI_VOICES,
  type VoiceOption,
  type VoiceSettings,
} from "../settings/VoiceSettings";
import {
  concatWavBuffers,
  isWavBuffer,
  mimeForAudioExtension,
  type AudioExtension,
} from "../utils/audioFormat";
import { BaseSpeechService } from "./BaseSpeechService";
import type { CredentialValidationResult } from "./SpeechProvider";
import { chunkPlainText } from "./textChunker";

/**
 * OpenAI Text-to-Speech integration.
 *
 * - Receives plain spoken text from TextSpeaker (OpenAI's speech endpoint does
 *   not support SSML, so the text pipeline is used instead of the SSML pipeline).
 * - Chunks long notes to stay within the per-request input limit and
 *   concatenates the resulting audio.
 * - Uses Obsidian's requestUrl() with a Bearer token to bypass browser CORS
 *   (same rationale as the other HTTP providers) and to keep the key out of
 *   fetch/XHR client requests.
 * - Playback/controls/caching are inherited from BaseSpeechService. Speed is
 *   applied client-side via the audio element, so it is not sent to the API.
 *
 * OpenAiCompatibleSpeechService extends this class for any other server that
 * speaks the same `/audio/speech` API; the protected members below are the
 * points where the two differ.
 */

const OPENAI_BASE_URL = "https://api.openai.com/v1";
// Conservative per-request size. The speech endpoint accepts up to ~4096
// characters; smaller chunks lower first-audio latency and stay safely under
// the limit for every model.
const MAX_CHUNK_CHARS = 2000;

export class OpenAiSpeechService extends BaseSpeechService {
  readonly inputFormat = "text" as const;

  protected apiKey: string;
  protected model: string;
  /** Provider name used in error messages. */
  protected readonly providerLabel: string = "OpenAI";
  /** Audio format requested from the speech endpoint. */
  protected responseFormat: AudioExtension = "mp3";

  constructor(apiKey: string, voice: string, model: string, speed?: number) {
    super(voice, speed);
    this.apiKey = apiKey;
    this.model = model || "gpt-4o-mini-tts";
  }

  getVoiceOptions(): VoiceOption[] {
    return OPENAI_VOICES;
  }

  updateCredentials(settings: VoiceSettings): void {
    this.apiKey = settings.OPENAI_API_KEY;
    this.model = settings.OPENAI_MODEL || "gpt-4o-mini-tts";
  }

  /** The API root that `/audio/speech` and `/models` are appended to. */
  protected baseUrl(): string {
    return OPENAI_BASE_URL;
  }

  /**
   * Why synthesis cannot start with the current configuration, or null when it
   * can. OpenAI needs an API key.
   */
  protected configurationError(): string | null {
    return this.apiKey ? null : "Missing OpenAI API key";
  }

  /** Request headers carrying the API key, when one is set. */
  protected authHeaders(): Record<string, string> {
    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {};
  }

  /**
   * Synthesize and play plain text via the speech endpoint.
   */
  async speak(
    content: string,
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    if (this.isLoading) {
      throw new Error(`${this.providerLabel} call already in progress.`);
    }

    const configError = this.configurationError();
    if (configError) {
      const error = new Error(configError);
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
      const audioChunks: ArrayBuffer[] = [];

      for (let i = 0; i < chunks.length; i++) {
        if (this.abortController?.signal.aborted) {
          throw new Error("AbortError");
        }

        const audio = await this.synthesizeChunk(chunks[i]);

        if (this.abortController?.signal.aborted) {
          throw new Error("AbortError");
        }

        audioChunks.push(audio);

        // Reserve the last slice of the bar for concatenation + buffering.
        this.reportProgress(((i + 1) / chunks.length) * 0.95, 1);
      }

      this.playBlob(joinAudioChunks(audioChunks), speed, filePath);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error(`Error in ${this.providerLabel} speak:`, error);
      this.reportError(error);
      throw error;
    } finally {
      this.isLoading = false;
      this.abortController = undefined;
    }
  }

  /**
   * Synthesize a single text chunk and return its audio bytes.
   */
  private async synthesizeChunk(text: string): Promise<ArrayBuffer> {
    const response = await requestUrl({
      url: `${this.baseUrl()}/audio/speech`,
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/json",
        Accept: mimeForAudioExtension(this.responseFormat),
      },
      body: JSON.stringify({
        // Omitted when empty: some compatible servers have a single model and
        // reject an empty id, but accept a request without one.
        ...(this.model ? { model: this.model } : {}),
        input: text,
        voice: this.voice,
        response_format: this.responseFormat,
      }),
      throw: false,
    });

    const label = this.providerLabel;
    if (response.status === 401) {
      throw new Error(`${label}: invalid or expired API key (401)`);
    }
    if (response.status === 429) {
      throw new Error(`${label}: rate limit or quota reached (429)`);
    }
    if (response.status >= 400) {
      const message = errorMessageFrom(response);
      throw new Error(
        `${label} API error (HTTP ${response.status})${
          message ? `: ${message}` : ""
        }`,
      );
    }

    const arrayBuffer = response.arrayBuffer;
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error(`${label} returned an empty audio response`);
    }

    return arrayBuffer;
  }

  /**
   * Validate the API key. OpenAI has no list-voices endpoint, so we probe the
   * models endpoint; a 200 means the key works. The voice count reflects the
   * built-in catalog.
   */
  async validateCredentials(): Promise<CredentialValidationResult> {
    if (!this.apiKey) {
      return { isValid: false, error: "Please enter your OpenAI API key." };
    }

    try {
      const response = await requestUrl({
        url: `${this.baseUrl()}/models`,
        method: "GET",
        headers: this.authHeaders(),
        throw: false,
      });

      if (response.status === 200) {
        return { isValid: true, voiceCount: OPENAI_VOICES.length };
      }
      if (response.status === 401) {
        return { isValid: false, error: "Invalid or expired OpenAI API key." };
      }
      return {
        isValid: false,
        error: `Validation failed (HTTP ${response.status}).`,
      };
    } catch (error) {
      console.error("OpenAI credential validation error:", error);
      return {
        isValid: false,
        error: "Network error during validation. Please try again.",
      };
    }
  }

  protected getErrorMessage(error: unknown): string {
    if (error && typeof error === "object" && "message" in error) {
      const message = String((error as { message: string }).message);

      if (message.includes("401")) {
        return "Invalid OpenAI API key.";
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
        return "Connection failed. Check your internet.";
      }
      return `OpenAI error: ${message}`;
    }
    return "OpenAI error. Please try again.";
  }
}

/**
 * Join the per-chunk audio into one playable blob. MP3 frames can simply be
 * appended; WAV chunks each carry a header, so they are merged into one file.
 * The format is read from the bytes rather than trusted from the request, since
 * some servers ignore `response_format`.
 */
export function joinAudioChunks(chunks: ArrayBuffer[]): Blob {
  if (chunks.length > 0 && isWavBuffer(chunks[0])) {
    return new Blob([concatWavBuffers(chunks)], {
      type: mimeForAudioExtension("wav"),
    });
  }
  return new Blob(chunks, { type: mimeForAudioExtension("mp3") });
}

/** Best-effort error text from a JSON error body (`{ error: { message } }`). */
function errorMessageFrom(response: { json?: unknown }): string {
  try {
    const body = response.json as
      | { error?: { message?: unknown } | string; detail?: unknown }
      | undefined;
    if (typeof body?.error === "string") {
      return body.error;
    }
    if (typeof body?.error?.message === "string") {
      return body.error.message;
    }
    if (typeof body?.detail === "string") {
      return body.detail;
    }
  } catch {
    // Non-JSON body (requestUrl's json getter throws) — no detail to add.
  }
  return "";
}
