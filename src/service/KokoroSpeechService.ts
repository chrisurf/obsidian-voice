import { requestUrl } from "obsidian";
import {
  KOKORO_VOICES,
  type VoiceOption,
  type VoiceSettings,
} from "../settings/VoiceSettings";
import { BaseSpeechService } from "./BaseSpeechService";
import type { CredentialValidationResult } from "./SpeechProvider";
import { chunkPlainText } from "./textChunker";

/**
 * Kokoro TTS integration (local or self-hosted via Kokoro-FastAPI).
 *
 * - Receives plain spoken text from TextSpeaker (Kokoro accepts plain text).
 * - Chunks long notes to stay within the per-request input limit and
 *   concatenates the resulting MP3 blobs.
 * - Uses Obsidian's requestUrl() so the request works inside Obsidian's
 *   sandboxed environment and avoids browser CORS issues.
 * - No API key is required; the endpoint is assumed to be reachable on the
 *   configured base URL (default http://localhost:8880).
 */

const DEFAULT_KOKORO_BASE_URL = "http://localhost:8880";
// Kokoro-FastAPI is comfortable with a few thousand characters; keep a
// conservative limit to avoid timeouts and to enable progress feedback.
const MAX_CHUNK_CHARS = 2000;

export class KokoroSpeechService extends BaseSpeechService {
  readonly inputFormat = "text" as const;
  readonly supportsBreakTags = false;

  private baseUrl: string;
  private model: string;
  private langCode: string;

  constructor(
    baseUrl: string,
    voice: string,
    model: string,
    langCode: string,
    speed?: number,
  ) {
    super(voice, speed);
    this.baseUrl = (baseUrl || DEFAULT_KOKORO_BASE_URL).replace(/\/$/, "");
    this.model = model || "kokoro";
    this.langCode = langCode || "p";
  }

  getVoiceOptions(): VoiceOption[] {
    return KOKORO_VOICES;
  }

  updateCredentials(settings: VoiceSettings): void {
    this.baseUrl = (
      settings.KOKORO_BASE_URL || DEFAULT_KOKORO_BASE_URL
    ).replace(/\/$/, "");
    this.voice = settings.KOKORO_VOICE;
    this.model = settings.KOKORO_MODEL || "kokoro";
    this.langCode = settings.KOKORO_LANG_CODE || "p";
  }

  /**
   * Synthesize and play plain text via a local Kokoro-FastAPI endpoint.
   */
  async speak(
    content: string,
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    if (this.isLoading) {
      throw new Error("Kokoro TTS call already in progress.");
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
        this.reportProgress(((i + 1) / chunks.length) * 0.95, 1);
      }

      const finalBlob = new Blob(audioBlobs, { type: "audio/mpeg" });
      this.playBlob(finalBlob, speed, filePath);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Error in Kokoro speak:", error);
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
      url: `${this.baseUrl}/v1/audio/speech`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        voice: this.voice,
        lang_code: this.langCode,
        response_format: "mp3",
        speed: 1.0,
      }),
      throw: false,
    });

    if (response.status === 404) {
      throw new Error(
        "Kokoro TTS endpoint not found. Is Kokoro running at the configured URL?",
      );
    }
    if (response.status >= 400) {
      const message = response.json?.error?.message || response.text;
      throw new Error(
        `Kokoro TTS error (HTTP ${response.status})${
          message ? `: ${message}` : ""
        }`,
      );
    }

    const arrayBuffer = response.arrayBuffer;
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("Kokoro returned an empty audio response");
    }

    return new Blob([arrayBuffer], { type: "audio/mpeg" });
  }

  /**
   * Validate the Kokoro endpoint by probing the /v1/models route.
   */
  async validateCredentials(): Promise<CredentialValidationResult> {
    try {
      const response = await requestUrl({
        url: `${this.baseUrl}/v1/models`,
        method: "GET",
        throw: false,
      });

      if (response.status === 200) {
        return { isValid: true, voiceCount: KOKORO_VOICES.length };
      }
      if (response.status === 404) {
        return {
          isValid: false,
          error: "Kokoro endpoint not found. Check the base URL.",
        };
      }
      return {
        isValid: false,
        error: `Validation failed (HTTP ${response.status}).`,
      };
    } catch (error) {
      console.error("Kokoro credential validation error:", error);
      return {
        isValid: false,
        error:
          "Could not reach Kokoro TTS. Make sure the server is running and reachable.",
      };
    }
  }

  protected getErrorMessage(error: unknown): string {
    if (error && typeof error === "object" && "message" in error) {
      const message = String((error as { message: string }).message);

      if (message.includes("404")) {
        return "Kokoro TTS endpoint not found. Check the base URL and make sure the server is running.";
      }
      if (message.includes("empty audio")) {
        return "Kokoro returned no audio. Try a different voice or lang_code.";
      }
      if (message.toLowerCase().includes("network")) {
        return "Connection failed. Check that Kokoro TTS is running.";
      }
      return `Kokoro error: ${message}`;
    }
    return "Kokoro TTS error. Please try again.";
  }
}
