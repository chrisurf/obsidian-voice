import { requestUrl } from "obsidian";
import {
  GOOGLE_VOICES,
  type VoiceOption,
  type VoiceSettings,
} from "../settings/VoiceSettings";
import { BaseSpeechService } from "./BaseSpeechService";
import type { CredentialValidationResult } from "./SpeechProvider";

/**
 * Google Cloud Text-to-Speech integration.
 *
 * - Receives SSML from TextSpeaker (Google Cloud TTS supports full SSML, so it
 *   reuses the same SSML pipeline as AWS Polly and gets native pauses/emphasis).
 * - Chunks long notes on the SSML byte budget and concatenates the resulting
 *   MP3 blobs (Google's per-request limit is 5000 bytes of input).
 * - Uses Obsidian's requestUrl() with an API key (X-Goog-Api-Key header) to
 *   bypass browser CORS and keep the key out of fetch/XHR client requests.
 * - Playback/controls/caching are inherited from BaseSpeechService.
 */

const GOOGLE_BASE_URL = "https://texttospeech.googleapis.com/v1";
// Conservative SSML chunk size. Google's hard limit is 5000 bytes of input
// (markup included); 2500 chars stays well under it even for multi-byte scripts.
const MAX_SSML_CHUNK_CHARS = 2500;

/** Decode a base64 string to bytes (works in both Electron and Node tests). */
function base64ToBytes(base64: string): Uint8Array {
  const binary =
    typeof atob === "function"
      ? atob(base64)
      : Buffer.from(base64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class GoogleTtsService extends BaseSpeechService {
  readonly inputFormat = "ssml" as const;

  private apiKey: string;

  constructor(apiKey: string, voice: string, speed?: number) {
    super(voice, speed);
    this.apiKey = apiKey;
  }

  getVoiceOptions(): VoiceOption[] {
    return GOOGLE_VOICES;
  }

  updateCredentials(settings: VoiceSettings): void {
    this.apiKey = settings.GOOGLE_API_KEY;
  }

  /**
   * Synthesize and play SSML via Google Cloud TTS.
   */
  async speak(
    content: string,
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    if (this.isLoading) {
      throw new Error("Google TTS call already in progress.");
    }

    if (!this.apiKey) {
      const error = new Error("Missing Google Cloud API key");
      this.reportError(error);
      throw error;
    }

    const ssml = content.trim();
    if (!ssml) {
      return;
    }

    this.isLoading = true;
    try {
      this.reportProgress(0, 1);

      const chunks = await this.chunkSsml(ssml);
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
      console.error("Error in Google TTS speak:", error);
      this.reportError(error);
      throw error;
    } finally {
      this.isLoading = false;
      this.abortController = undefined;
    }
  }

  /**
   * Split the SSML into request-sized chunks (reusing the SSML chunker so each
   * chunk stays a well-formed <speak> document).
   */
  private async chunkSsml(ssml: string): Promise<string[]> {
    if (ssml.length <= MAX_SSML_CHUNK_CHARS) {
      return [ssml];
    }
    const { chunkSSML, validateChunks } =
      await import("../processors/pipeline/SSMLChunker");
    const chunks = chunkSSML(ssml, MAX_SSML_CHUNK_CHARS);
    const validation = validateChunks(chunks);
    if (!validation.isValid) {
      throw new Error(`SSML chunking failed: ${validation.errors.join(", ")}`);
    }
    return chunks.map((chunk) => chunk.ssml);
  }

  /**
   * Synthesize a single SSML chunk and return the MP3 blob.
   */
  private async synthesizeChunk(ssml: string): Promise<Blob> {
    const body = {
      input: { ssml: this.toGoogleSsml(ssml) },
      voice: {
        languageCode: this.languageCode(),
        name: this.voice,
      },
      audioConfig: { audioEncoding: "MP3" },
    };

    const response = await requestUrl({
      url: `${GOOGLE_BASE_URL}/text:synthesize`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
      },
      body: JSON.stringify(body),
      throw: false,
    });

    if (response.status === 400 || response.status === 403) {
      const message = response.json?.error?.message;
      throw new Error(
        `Google TTS rejected the request (HTTP ${response.status})${
          message ? `: ${message}` : ""
        }`,
      );
    }
    if (response.status === 429) {
      throw new Error("Google TTS: rate or quota limit reached (429)");
    }
    if (response.status >= 400) {
      throw new Error(`Google TTS API error (HTTP ${response.status})`);
    }

    const audioContent = response.json?.audioContent;
    if (!audioContent) {
      throw new Error("Google TTS returned an empty audio response");
    }

    return new Blob([base64ToBytes(audioContent) as BlobPart], {
      type: "audio/mpeg",
    });
  }

  /**
   * Validate the API key by listing voices.
   */
  async validateCredentials(): Promise<CredentialValidationResult> {
    if (!this.apiKey) {
      return {
        isValid: false,
        error: "Please enter your Google Cloud API key.",
      };
    }

    try {
      const response = await requestUrl({
        url: `${GOOGLE_BASE_URL}/voices`,
        method: "GET",
        headers: { "X-Goog-Api-Key": this.apiKey },
        throw: false,
      });

      if (response.status === 200) {
        const voices = response.json?.voices ?? [];
        return { isValid: true, voiceCount: voices.length };
      }
      if (response.status === 400 || response.status === 403) {
        return {
          isValid: false,
          error:
            "Invalid API key, or the Cloud Text-to-Speech API is not enabled for this key/project.",
        };
      }
      return {
        isValid: false,
        error: `Validation failed (HTTP ${response.status}).`,
      };
    } catch (error) {
      console.error("Google TTS credential validation error:", error);
      return {
        isValid: false,
        error: "Network error during validation. Please try again.",
      };
    }
  }

  protected getErrorMessage(error: unknown): string {
    if (error && typeof error === "object" && "message" in error) {
      const message = String((error as { message: string }).message);

      if (message.includes("Missing Google Cloud API key")) {
        return "Add your Google Cloud API key in settings.";
      }
      if (message.includes("403") || message.includes("400")) {
        return "Invalid Google Cloud API key or the Text-to-Speech API is not enabled.";
      }
      if (message.includes("429")) {
        return "Google TTS quota or rate limit reached. Please wait and try again.";
      }
      if (message.includes("empty audio")) {
        return "Google TTS returned no audio. Try a different voice.";
      }
      if (message.toLowerCase().includes("network")) {
        return "Connection failed. Check your internet.";
      }
      return `Google TTS error: ${message}`;
    }
    return "Google TTS error. Please try again.";
  }

  /**
   * Adjust Polly-style SSML to Google's accepted vocabulary. Google's
   * say-as uses "cardinal" where Polly uses "number"; everything else in the
   * pipeline's output (prosody/break/characters/sub) is valid Google SSML.
   */
  private toGoogleSsml(ssml: string): string {
    return ssml.replace(/interpret-as="number"/g, 'interpret-as="cardinal"');
  }

  /**
   * Derive the BCP-47 languageCode from the voice name (its first two
   * hyphen-delimited segments, e.g. "en-US-Neural2-C" → "en-US").
   */
  private languageCode(): string {
    const parts = this.voice.split("-");
    if (parts.length >= 2) {
      return `${parts[0]}-${parts[1]}`;
    }
    return "en-US";
  }
}
