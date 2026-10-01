import { requestUrl } from "obsidian";
import {
  FISH_AUDIO_VOICES,
  type VoiceOption,
  type VoiceSettings,
} from "../settings/VoiceSettings";
import { BaseSpeechService } from "./BaseSpeechService";
import type { CredentialValidationResult } from "./SpeechProvider";
import { chunkPlainText } from "./textChunker";

/**
 * Fish Audio Text-to-Speech integration.
 *
 * - Receives plain spoken text from TextSpeaker. Fish Audio does not consume
 *   SSML, so Markdown structure is represented by natural newline pauses.
 * - Chunks long notes conservatively, synthesizes each chunk through the REST
 *   API, and concatenates the returned MP3 audio.
 * - Uses Obsidian's requestUrl() with Bearer authentication, matching the other
 *   HTTP providers and avoiding browser CORS restrictions.
 * - A blank voice id uses Fish Audio's default voice. Users can paste any
 *   public or private voice model id (`reference_id`) in settings.
 */

const FISH_AUDIO_BASE_URL = "https://api.fish.audio";
const MAX_CHUNK_CHARS = 3000;

export class FishAudioSpeechService extends BaseSpeechService {
  readonly inputFormat = "text" as const;

  private apiKey: string;
  private model: string;

  constructor(apiKey: string, voice: string, model: string, speed?: number) {
    super(voice, speed);
    this.apiKey = apiKey;
    this.model = model || "s2.1-pro-free";
  }

  getVoiceOptions(): VoiceOption[] {
    if (!this.voice) {
      return FISH_AUDIO_VOICES;
    }

    return [
      ...FISH_AUDIO_VOICES,
      {
        id: this.voice,
        label: `Custom voice (${shortVoiceId(this.voice)})`,
        lang: "und",
        group: "Fish Audio",
      },
    ];
  }

  updateCredentials(settings: VoiceSettings): void {
    this.apiKey = settings.FISH_AUDIO_API_KEY;
    this.model = settings.FISH_AUDIO_MODEL || "s2.1-pro-free";
    this.voice = settings.FISH_AUDIO_VOICE;
  }

  async speak(
    content: string,
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    if (this.isLoading) {
      throw new Error("Fish Audio call already in progress.");
    }

    if (!this.apiKey) {
      const error = new Error("Missing Fish Audio API key");
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
        this.reportProgress(((i + 1) / chunks.length) * 0.95, 1);
      }

      this.playBlob(
        new Blob(audioBlobs, { type: "audio/mpeg" }),
        speed,
        filePath,
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Error in Fish Audio speak:", error);
      this.reportError(error);
      throw error;
    } finally {
      this.isLoading = false;
      this.abortController = undefined;
    }
  }

  private async synthesizeChunk(text: string): Promise<Blob> {
    const response = await requestUrl({
      url: `${FISH_AUDIO_BASE_URL}/v1/tts`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
        model: this.model,
      },
      body: JSON.stringify({
        text,
        ...(this.voice ? { reference_id: this.voice } : {}),
        format: "mp3",
      }),
      throw: false,
    });

    if (response.status >= 400) {
      throw new Error(
        fishAudioHttpError(response.status, readJsonBody(response)),
      );
    }

    const arrayBuffer = response.arrayBuffer;
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("Fish Audio returned an empty audio response");
    }

    return new Blob([arrayBuffer], { type: "audio/mpeg" });
  }

  /** Validate the API key with the non-billable voice-model listing endpoint. */
  async validateCredentials(): Promise<CredentialValidationResult> {
    if (!this.apiKey) {
      return {
        isValid: false,
        error: "Please enter your Fish Audio API key.",
      };
    }

    try {
      const response = await requestUrl({
        url: `${FISH_AUDIO_BASE_URL}/model?page_size=1&self=true`,
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        throw: false,
      });

      if (response.status === 200) {
        return {
          isValid: true,
          voiceCount: this.getVoiceOptions().length,
        };
      }

      return {
        isValid: false,
        error: fishAudioHttpError(response.status, readJsonBody(response)),
      };
    } catch (error) {
      console.error("Fish Audio credential validation error:", error);
      return {
        isValid: false,
        error: "Network error during validation. Please try again.",
      };
    }
  }

  protected getErrorMessage(error: unknown): string {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: string }).message)
        : "";

    if (message.includes("Missing Fish Audio API key")) {
      return "Add your Fish Audio API key in settings.";
    }
    if (message.includes("401")) {
      return "Invalid or expired Fish Audio API key.";
    }
    if (message.includes("402")) {
      return "Fish Audio credits are exhausted. Add credit or use an available free model.";
    }
    if (message.includes("429")) {
      return "Fish Audio rate limit reached. Please wait and try again.";
    }
    if (message.includes("503")) {
      return "Fish Audio is temporarily busy. Please try again.";
    }
    if (message.includes("empty audio")) {
      return "Fish Audio returned no audio. Try a different voice or model.";
    }
    return message
      ? `Fish Audio error: ${message}`
      : "Fish Audio error. Please try again.";
  }
}

function shortVoiceId(voice: string): string {
  return voice.length > 12 ? `${voice.slice(0, 12)}…` : voice;
}

function readJsonBody(response: { json: unknown }): unknown {
  try {
    return response.json;
  } catch {
    return null;
  }
}

function fishAudioHttpError(status: number, body: unknown): string {
  const detail =
    body && typeof body === "object" && "message" in body
      ? String(body.message)
      : "";
  const suffix = detail ? `: ${detail}` : "";

  if (status === 401) {
    return `Fish Audio: invalid or expired API key (401)${suffix}`;
  }
  if (status === 402) {
    return `Fish Audio: insufficient credits (402)${suffix}`;
  }
  if (status === 429) {
    return `Fish Audio: rate limit reached (429)${suffix}`;
  }
  if (status === 503) {
    return `Fish Audio: service temporarily unavailable (503)${suffix}`;
  }
  return `Fish Audio API error (HTTP ${status})${suffix}`;
}
