import { requestUrl } from "obsidian";
import {
  MINIMAX_VOICES,
  type VoiceOption,
  type VoiceSettings,
} from "../settings/VoiceSettings";
import { BaseSpeechService } from "./BaseSpeechService";
import type { CredentialValidationResult } from "./SpeechProvider";
import { chunkPlainText } from "./textChunker";
import { extractT2AAudio, type MiniMaxT2AResponse } from "./minimaxAudio";

/**
 * MiniMax Text-to-Speech integration (T2A v2).
 *
 * - Receives plain spoken text from TextSpeaker (MiniMax's T2A endpoint takes
 *   plain text, so the text pipeline is used instead of the SSML pipeline).
 * - Chunks long notes and concatenates the resulting MP3 blobs.
 * - MiniMax needs an API key AND a Group ID; the key is a Bearer token and the
 *   Group ID is a query parameter. The regional host is configurable (global vs
 *   mainland China) so users in either region can reach the API.
 * - Audio comes back as a hex-encoded string (`output_format: "hex"`); it is
 *   decoded to MP3 bytes by the pure helpers in minimaxAudio.ts.
 * - Uses Obsidian's requestUrl() to bypass browser CORS and keep credentials
 *   out of fetch/XHR. Speed is applied client-side via the audio element (as
 *   with the other providers), so it is not sent to the API.
 */

// Conservative per-request size. T2A accepts far more, but smaller chunks lower
// first-audio latency and keep each request well within limits.
const MAX_CHUNK_CHARS = 3000;

export class MiniMaxSpeechService extends BaseSpeechService {
  readonly inputFormat = "text" as const;

  private apiKey: string;
  private groupId: string;
  private model: string;
  private host: string;

  constructor(
    apiKey: string,
    groupId: string,
    voice: string,
    model: string,
    host: string,
    speed?: number,
  ) {
    super(voice, speed);
    this.apiKey = apiKey;
    this.groupId = groupId;
    this.model = model || "speech-02-hd";
    this.host = host || "api.minimax.io";
  }

  getVoiceOptions(): VoiceOption[] {
    return MINIMAX_VOICES;
  }

  updateCredentials(settings: VoiceSettings): void {
    this.apiKey = settings.MINIMAX_API_KEY;
    this.groupId = settings.MINIMAX_GROUP_ID;
    this.model = settings.MINIMAX_MODEL || "speech-02-hd";
    this.host = settings.MINIMAX_HOST || "api.minimax.io";
  }

  private endpoint(): string {
    return `https://${this.host}/v1/t2a_v2?GroupId=${encodeURIComponent(
      this.groupId,
    )}`;
  }

  /**
   * Synthesize and play plain text via MiniMax.
   */
  async speak(
    content: string,
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    if (this.isLoading) {
      throw new Error("MiniMax call already in progress.");
    }

    if (!this.apiKey || !this.groupId) {
      const error = new Error("Missing MiniMax API key or Group ID");
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
      console.error("Error in MiniMax speak:", error);
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
      url: this.endpoint(),
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        text,
        stream: false,
        output_format: "hex",
        language_boost: "auto",
        voice_setting: {
          voice_id: this.voice,
          speed: 1.0,
          vol: 1.0,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: "mp3",
          channel: 1,
        },
      }),
      throw: false,
    });

    if (response.status === 401) {
      throw new Error("MiniMax: invalid API key (HTTP 401)");
    }
    if (response.status >= 400) {
      throw new Error(`MiniMax API error (HTTP ${response.status})`);
    }

    const result = extractT2AAudio((response.json ?? {}) as MiniMaxT2AResponse);
    if (!result.ok) {
      throw new Error(result.error);
    }

    return new Blob([result.bytes as BlobPart], { type: "audio/mpeg" });
  }

  /**
   * Validate the credentials. MiniMax has no free list endpoint, so we send the
   * smallest possible synthesis request and check the logical status code — this
   * confirms the API key, Group ID and host all work together.
   */
  async validateCredentials(): Promise<CredentialValidationResult> {
    if (!this.apiKey || !this.groupId) {
      return {
        isValid: false,
        error: "Please enter your MiniMax API key and Group ID.",
      };
    }

    try {
      const response = await requestUrl({
        url: this.endpoint(),
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          text: ".",
          stream: false,
          output_format: "hex",
          voice_setting: { voice_id: this.voice },
          audio_setting: { format: "mp3" },
        }),
        throw: false,
      });

      if (response.status === 401) {
        return { isValid: false, error: "Invalid MiniMax API key." };
      }
      if (response.status >= 400) {
        return {
          isValid: false,
          error: `Validation failed (HTTP ${response.status}).`,
        };
      }

      const result = extractT2AAudio(
        (response.json ?? {}) as MiniMaxT2AResponse,
      );
      if (result.ok) {
        return { isValid: true, voiceCount: MINIMAX_VOICES.length };
      }
      return { isValid: false, error: result.error };
    } catch (error) {
      console.error("MiniMax credential validation error:", error);
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
        return "Invalid MiniMax API key or Group ID. Check both in settings.";
      }
      if (message.includes("Missing MiniMax")) {
        return "Add your MiniMax API key and Group ID in settings.";
      }
      if (message.toLowerCase().includes("balance")) {
        return "MiniMax account balance is insufficient.";
      }
      if (message.toLowerCase().includes("rate limit")) {
        return "MiniMax rate limit reached. Please wait and try again.";
      }
      if (message.toLowerCase().includes("no audio")) {
        return "MiniMax returned no audio. Try a different voice or model.";
      }
      if (message.toLowerCase().includes("network")) {
        return "Connection failed. Check your internet.";
      }
      return `MiniMax error: ${message}`;
    }
    return "MiniMax error. Please try again.";
  }
}
