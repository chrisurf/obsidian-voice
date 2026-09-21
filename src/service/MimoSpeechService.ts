import { requestUrl } from "obsidian";
import {
  MIMO_VOICES,
  type VoiceOption,
  type VoiceSettings,
} from "../settings/VoiceSettings";
import { BaseSpeechService } from "./BaseSpeechService";
import type { CredentialValidationResult } from "./SpeechProvider";
import { chunkPlainText } from "./textChunker";
import { joinAudioChunks } from "./OpenAiSpeechService";
import {
  MIMO_DEFAULT_HOST,
  MIMO_MODEL,
  buildMimoMessages,
  bytesToArrayBuffer,
  extractMimoAudio,
  mimoEndpoint,
  mimoErrorMessageFrom,
  type MimoChatResponse,
} from "./mimoAudio";

/**
 * Xiaomi MiMo Text-to-Speech integration (mimo-v2.5-tts).
 *
 * - Receives plain spoken text from TextSpeaker. MiMo's TTS is a chat
 *   completions call (not `/audio/speech`), so the text pipeline is used.
 * - Optional style instruction is sent as a `user` message (never spoken);
 *   the note text is the `assistant` message. Inline tags such as `(温柔)`
 *   in the note are passed through as-is.
 * - Chunks long notes (≈500 characters) so each request stays well under
 *   the 8K-token context and the JSON+base64 audio payload stays small.
 *   Chunks are concatenated, then played. Speed is applied client-side.
 * - Audio comes back as base64 in the JSON body; it is decoded by the pure
 *   helpers in mimoAudio.ts.
 * - Uses Obsidian's requestUrl() to bypass browser CORS and keep the key
 *   out of fetch/XHR. Auth is both `api-key` and Bearer (Xiaomi accepts either).
 */

// MiMo returns audio as base64 inside JSON (often WAV). 2500 Chinese chars is
// several minutes of speech and can freeze requestUrl/JSON.parse; ~500 chars
// keeps each payload small and the progress bar moving.
const MAX_CHUNK_CHARS = 500;

export class MimoSpeechService extends BaseSpeechService {
  readonly inputFormat = "text" as const;
  // MiMo would read `<break>` / `<#x#>` aloud. Inline audio tags like `(温柔)`
  // are part of the note text and do not need pipeline markup.
  readonly textPauseStyle = "none" as const;

  private apiKey: string;
  private host: string;
  private style: string;

  constructor(
    apiKey: string,
    voice: string,
    host: string,
    style: string,
    speed?: number,
  ) {
    super(voice, speed);
    this.apiKey = apiKey;
    this.host = host || MIMO_DEFAULT_HOST;
    this.style = style || "";
  }

  getVoiceOptions(): VoiceOption[] {
    return MIMO_VOICES;
  }

  updateCredentials(settings: VoiceSettings): void {
    this.apiKey = settings.MIMO_API_KEY;
    this.host = settings.MIMO_HOST || MIMO_DEFAULT_HOST;
    this.style = settings.MIMO_STYLE || "";
  }

  private endpoint(): string {
    return mimoEndpoint(this.host);
  }

  private authHeaders(): Record<string, string> {
    return {
      "api-key": this.apiKey,
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  /**
   * Synthesize and play plain text via MiMo.
   */
  async speak(
    content: string,
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    if (this.isLoading) {
      throw new Error("MiMo call already in progress.");
    }

    if (!this.apiKey) {
      const error = new Error("Missing MiMo API key");
      this.reportError(error);
      throw error;
    }

    const text = content.trim();
    if (!text) {
      return;
    }

    this.isLoading = true;
    try {
      await this.speakPrepared([{ title: "Note", text }], speed, filePath);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Error in MiMo speak:", error);
      this.reportError(error);
      throw error;
    } finally {
      this.isLoading = false;
      this.abortController = undefined;
    }
  }

  async speakNoteSections(
    sections: { title: string; text: string }[],
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    if (this.isLoading) {
      throw new Error("MiMo call already in progress.");
    }
    if (!this.apiKey) {
      const error = new Error("Missing MiMo API key");
      this.reportError(error);
      throw error;
    }
    const parts = sections.filter((section) => section.text.trim());
    if (parts.length === 0) {
      return;
    }

    this.isLoading = true;
    try {
      await this.speakPrepared(parts, speed, filePath);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Error in MiMo speak:", error);
      this.reportError(error);
      throw error;
    } finally {
      this.isLoading = false;
      this.abortController = undefined;
    }
  }

  /**
   * Synthesize each titled part (further split if still long), start playback
   * as soon as the first blob is ready, and join everything for download.
   */
  private async speakPrepared(
    parts: { title: string; text: string }[],
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    const units: { title: string; text: string }[] = [];
    for (const part of parts) {
      const chunks = chunkPlainText(part.text.trim(), MAX_CHUNK_CHARS);
      if (chunks.length <= 1) {
        units.push({ title: part.title, text: chunks[0] ?? part.text });
        continue;
      }
      chunks.forEach((chunk, index) => {
        units.push({
          title: `${part.title} (${index + 1}/${chunks.length})`,
          text: chunk,
        });
      });
    }

    this.reportProgress(0, 1);
    this.beginNotePlaylist(
      units.map((unit) => unit.title),
      filePath,
    );

    const audioChunks: ArrayBuffer[] = [];
    for (let i = 0; i < units.length; i++) {
      if (this.abortController?.signal.aborted) {
        const abort = new Error("AbortError");
        abort.name = "AbortError";
        throw abort;
      }

      this.reportProgress((i / units.length) * 0.95, 1);
      const audio = await this.synthesizeChunk(units[i].text);

      if (this.abortController?.signal.aborted) {
        const abort = new Error("AbortError");
        abort.name = "AbortError";
        throw abort;
      }

      audioChunks.push(audio);
      this.appendNoteSection(joinAudioChunks([audio]), speed);
      this.reportProgress(((i + 1) / units.length) * 0.95, 1);
    }

    this.finishNotePlaylist(joinAudioChunks(audioChunks), filePath);
  }

  /**
   * Synthesize a single text chunk and return its audio bytes.
   */
  private async synthesizeChunk(text: string): Promise<ArrayBuffer> {
    const response = await requestUrl({
      url: this.endpoint(),
      method: "POST",
      headers: {
        ...this.authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MIMO_MODEL,
        messages: buildMimoMessages(text, this.style),
        audio: {
          format: "mp3",
          voice: this.voice,
        },
      }),
      throw: false,
    });

    if (response.status === 401) {
      throw new Error("MiMo: invalid API key (HTTP 401)");
    }
    if (response.status === 429) {
      throw new Error("MiMo: rate limit or quota reached (HTTP 429)");
    }
    if (response.status >= 400) {
      const detail = mimoErrorMessageFrom(
        (response.json ?? {}) as MimoChatResponse,
      );
      throw new Error(
        `MiMo API error (HTTP ${response.status})${detail ? `: ${detail}` : ""}`,
      );
    }

    const result = extractMimoAudio((response.json ?? {}) as MimoChatResponse);
    if (!result.ok) {
      throw new Error(result.error);
    }

    return bytesToArrayBuffer(result.bytes);
  }

  /**
   * Validate the credentials. MiMo has no free list endpoint, so we send the
   * smallest possible synthesis request and check that audio comes back — this
   * confirms the API key and host work together.
   */
  async validateCredentials(): Promise<CredentialValidationResult> {
    if (!this.apiKey) {
      return {
        isValid: false,
        error: "Please enter your MiMo API key.",
      };
    }

    try {
      const response = await requestUrl({
        url: this.endpoint(),
        method: "POST",
        headers: {
          ...this.authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MIMO_MODEL,
          messages: buildMimoMessages("."),
          audio: {
            format: "mp3",
            voice: this.voice || "mimo_default",
          },
        }),
        throw: false,
      });

      if (response.status === 401) {
        return { isValid: false, error: "Invalid MiMo API key." };
      }
      if (response.status >= 400) {
        const detail = mimoErrorMessageFrom(
          (response.json ?? {}) as MimoChatResponse,
        );
        return {
          isValid: false,
          error: detail
            ? `Validation failed (HTTP ${response.status}): ${detail}`
            : `Validation failed (HTTP ${response.status}).`,
        };
      }

      const result = extractMimoAudio(
        (response.json ?? {}) as MimoChatResponse,
      );
      if (result.ok) {
        return { isValid: true, voiceCount: MIMO_VOICES.length };
      }
      return { isValid: false, error: result.error };
    } catch (error) {
      console.error("MiMo credential validation error:", error);
      return {
        isValid: false,
        error: "Network error during validation. Please try again.",
      };
    }
  }

  protected getErrorMessage(error: unknown): string {
    if (error && typeof error === "object" && "message" in error) {
      const message = String((error as { message: string }).message);

      if (message.includes("Missing MiMo")) {
        return "Add your MiMo API key in settings.";
      }
      if (
        message.includes("401") ||
        message.toLowerCase().includes("api key")
      ) {
        return "Invalid MiMo API key. Check it in settings.";
      }
      if (message.includes("429") || message.toLowerCase().includes("rate")) {
        return "MiMo rate limit reached. Please wait and try again.";
      }
      if (message.toLowerCase().includes("content filter")) {
        return "MiMo blocked the text (content filter).";
      }
      if (message.toLowerCase().includes("no audio")) {
        return "MiMo returned no audio. Try a different voice or shorter text.";
      }
      if (message.toLowerCase().includes("network")) {
        return "Connection failed. Check your internet.";
      }
      return `MiMo error: ${message}`;
    }
    return "MiMo error. Please try again.";
  }
}
