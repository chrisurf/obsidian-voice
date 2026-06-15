import { requestUrl } from "obsidian";
import {
  ELEVENLABS_VOICES,
  type VoiceOption,
  type VoiceSettings,
} from "../settings/VoiceSettings";
import { BaseSpeechService } from "./BaseSpeechService";
import type { CredentialValidationResult } from "./SpeechProvider";

/**
 * ElevenLabs Text-to-Speech integration.
 *
 * - Receives plain spoken text from TextSpeaker (ElevenLabs does not support
 *   full SSML, so the text pipeline is used instead of the SSML pipeline).
 * - Chunks long notes to stay within the per-request character limit and
 *   concatenates the resulting MP3 blobs.
 * - Uses Obsidian's requestUrl() to bypass browser CORS (same rationale as the
 *   Polly path) and to keep the API key out of fetch/XHR client requests.
 * - Playback/controls/caching are inherited from BaseSpeechService.
 */

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io";
const OUTPUT_FORMAT = "mp3_44100_128";
// Conservative per-request size. multilingual_v2 allows 10k chars; smaller
// chunks lower first-audio latency and avoid hitting limits on any model.
const MAX_CHUNK_CHARS = 3000;

export class ElevenLabsService extends BaseSpeechService {
  readonly inputFormat = "text" as const;

  private apiKey: string;
  private model: string;

  constructor(apiKey: string, voice: string, model: string, speed?: number) {
    super(voice, speed);
    this.apiKey = apiKey;
    this.model = model || "eleven_multilingual_v2";
  }

  getVoiceOptions(): VoiceOption[] {
    return ELEVENLABS_VOICES;
  }

  updateCredentials(settings: VoiceSettings): void {
    this.apiKey = settings.ELEVENLABS_API_KEY;
    this.model = settings.ELEVENLABS_MODEL || "eleven_multilingual_v2";
  }

  /**
   * Synthesize and play plain text via ElevenLabs.
   */
  async speak(
    content: string,
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    if (this.isLoading) {
      throw new Error("ElevenLabs call already in progress.");
    }

    if (!this.apiKey) {
      const error = new Error("Missing ElevenLabs API key");
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

      const chunks = this.chunkText(text, MAX_CHUNK_CHARS);
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
      console.error("Error in ElevenLabs speak:", error);
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
    const voiceId = this.voice;
    const url = `${ELEVENLABS_BASE_URL}/v1/text-to-speech/${encodeURIComponent(
      voiceId,
    )}?output_format=${OUTPUT_FORMAT}`;

    const response = await requestUrl({
      url,
      method: "POST",
      headers: {
        "xi-api-key": this.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: this.model,
      }),
      throw: false,
    });

    if (response.status === 401) {
      throw new Error("ElevenLabs: invalid or expired API key (401)");
    }
    if (response.status === 429) {
      throw new Error("ElevenLabs: rate or concurrency limit reached (429)");
    }
    if (response.status >= 400) {
      throw new Error(`ElevenLabs API error (HTTP ${response.status})`);
    }

    const arrayBuffer = response.arrayBuffer;
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("ElevenLabs returned an empty audio response");
    }

    return new Blob([arrayBuffer], { type: "audio/mpeg" });
  }

  /**
   * Validate the API key by listing the account's voices.
   */
  async validateCredentials(): Promise<CredentialValidationResult> {
    if (!this.apiKey) {
      return { isValid: false, error: "Please enter your ElevenLabs API key." };
    }

    try {
      const response = await requestUrl({
        url: `${ELEVENLABS_BASE_URL}/v1/voices`,
        method: "GET",
        headers: { "xi-api-key": this.apiKey },
        throw: false,
      });

      if (response.status === 200) {
        const voices = response.json?.voices ?? [];
        return { isValid: true, voiceCount: voices.length };
      }
      if (response.status === 401) {
        return {
          isValid: false,
          error: "Invalid or expired ElevenLabs API key.",
        };
      }
      return {
        isValid: false,
        error: `Validation failed (HTTP ${response.status}).`,
      };
    } catch (error) {
      console.error("ElevenLabs credential validation error:", error);
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
        return "Invalid ElevenLabs API key.";
      }
      if (message.includes("429")) {
        return "ElevenLabs rate limit reached. Please wait and try again.";
      }
      if (message.includes("Missing ElevenLabs API key")) {
        return "Add your ElevenLabs API key in settings.";
      }
      if (message.includes("empty audio")) {
        return "ElevenLabs returned no audio. Try a different voice or model.";
      }
      if (message.toLowerCase().includes("network")) {
        return "Connection failed. Check your internet.";
      }
      return `ElevenLabs error: ${message}`;
    }
    return "ElevenLabs error. Please try again.";
  }

  /**
   * Split text into chunks under the given character limit, preferring
   * paragraph then sentence then word boundaries so audio stays natural.
   */
  private chunkText(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) {
      return [text];
    }

    const chunks: string[] = [];
    let current = "";

    const flush = () => {
      const trimmed = current.trim();
      if (trimmed) {
        chunks.push(trimmed);
      }
      current = "";
    };

    const addPiece = (piece: string, separator: string) => {
      if (!piece) return;
      if (current && (current + separator + piece).length > maxLen) {
        flush();
      }
      current = current ? current + separator + piece : piece;
    };

    const paragraphs = text.split(/\n{2,}/);
    for (const paragraph of paragraphs) {
      if (paragraph.length <= maxLen) {
        addPiece(paragraph, "\n\n");
        continue;
      }

      // Paragraph too long: split into sentences.
      flush();
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if (sentence.length <= maxLen) {
          addPiece(sentence, " ");
          continue;
        }

        // Sentence too long: hard-split by words.
        flush();
        const words = sentence.split(/\s+/);
        for (const word of words) {
          if (current && (current + " " + word).length > maxLen) {
            flush();
          }
          current = current ? current + " " + word : word;
        }
      }
    }

    flush();
    return chunks.length ? chunks : [text];
  }
}
