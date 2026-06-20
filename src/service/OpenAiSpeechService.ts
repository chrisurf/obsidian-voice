import { requestUrl } from "obsidian";
import {
  OPENAI_VOICES,
  type VoiceOption,
  type VoiceSettings,
} from "../settings/VoiceSettings";
import { BaseSpeechService } from "./BaseSpeechService";
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

    if (!this.apiKey) {
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
      url: `${OPENAI_BASE_URL}/audio/speech`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
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
        url: `${OPENAI_BASE_URL}/models`,
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
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
