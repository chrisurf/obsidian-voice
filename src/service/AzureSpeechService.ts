import { requestUrl } from "obsidian";
import {
  AZURE_VOICES,
  type VoiceOption,
  type VoiceSettings,
} from "../settings/VoiceSettings";
import { BaseSpeechService } from "./BaseSpeechService";
import type { CredentialValidationResult } from "./SpeechProvider";
import { mapAzureVoices } from "./voiceCatalog";

/**
 * Azure AI Speech (Cognitive Services) Text-to-Speech integration.
 *
 * - Receives SSML from TextSpeaker (Azure supports full SSML, so it reuses the
 *   same SSML pipeline as AWS Polly/Google and gets native pauses/emphasis).
 * - Azure requires a specific envelope: the inner SSML must be wrapped in
 *   <speak version xmlns xml:lang><voice name="...">…</voice></speak>, and
 *   prosody volume must not use decibels — both handled in toAzureSsml().
 * - Region-specific endpoint with an Ocp-Apim-Subscription-Key, via Obsidian
 *   requestUrl(); the MP3 bytes come back in the response body.
 * - Playback/controls/caching are inherited from BaseSpeechService.
 */

const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
// Conservative SSML chunk size. Azure caps output at 10 minutes per request;
// 2500 chars keeps each chunk well within that and matches the other providers.
const MAX_SSML_CHUNK_CHARS = 2500;

export class AzureSpeechService extends BaseSpeechService {
  readonly inputFormat = "ssml" as const;

  private apiKey: string;
  private region: string;
  // The full catalog fetched on "Test Credentials" (cached in settings). Falls
  // back to the curated AZURE_VOICES list until the user has validated.
  private dynamicVoices: VoiceOption[] | null;

  constructor(
    apiKey: string,
    region: string,
    voice: string,
    speed?: number,
    voiceCatalog?: VoiceOption[],
  ) {
    super(voice, speed);
    this.apiKey = apiKey;
    this.region = region;
    this.dynamicVoices =
      voiceCatalog && voiceCatalog.length > 0 ? voiceCatalog : null;
  }

  getVoiceOptions(): VoiceOption[] {
    return this.dynamicVoices ?? AZURE_VOICES;
  }

  updateCredentials(settings: VoiceSettings): void {
    this.apiKey = settings.AZURE_API_KEY;
    this.region = settings.AZURE_REGION;
    this.dynamicVoices =
      settings.azureVoiceCatalog && settings.azureVoiceCatalog.length > 0
        ? settings.azureVoiceCatalog
        : null;
  }

  /**
   * Synthesize and play SSML via Azure AI Speech.
   */
  async speak(
    content: string,
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    if (this.isLoading) {
      throw new Error("Azure Speech call already in progress.");
    }

    if (!this.apiKey || !this.region) {
      const error = new Error("Missing Azure Speech key or region");
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
      console.error("Error in Azure Speech speak:", error);
      this.reportError(error);
      throw error;
    } finally {
      this.isLoading = false;
      this.abortController = undefined;
    }
  }

  /**
   * Split the SSML into request-sized chunks (each a well-formed <speak>).
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
    const response = await requestUrl({
      url: `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.apiKey,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
        "User-Agent": "obsidian-voice",
      },
      body: this.toAzureSsml(ssml),
      throw: false,
    });

    if (response.status === 401) {
      throw new Error("Azure Speech: invalid key or region (401)");
    }
    if (response.status === 429) {
      throw new Error("Azure Speech: rate or quota limit reached (429)");
    }
    if (response.status >= 400) {
      throw new Error(`Azure Speech API error (HTTP ${response.status})`);
    }

    const arrayBuffer = response.arrayBuffer;
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("Azure Speech returned an empty audio response");
    }

    return new Blob([arrayBuffer], { type: "audio/mpeg" });
  }

  /**
   * Validate the key + region by listing voices.
   */
  async validateCredentials(): Promise<CredentialValidationResult> {
    if (!this.apiKey || !this.region) {
      return {
        isValid: false,
        error: "Please enter your Azure Speech key and region.",
      };
    }

    try {
      const response = await requestUrl({
        url: `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
        method: "GET",
        headers: { "Ocp-Apim-Subscription-Key": this.apiKey },
        throw: false,
      });

      if (response.status === 200) {
        const mapped = mapAzureVoices(response.json);
        return {
          isValid: true,
          voiceCount: mapped.length,
          voices: mapped,
        };
      }
      if (response.status === 401 || response.status === 403) {
        return {
          isValid: false,
          error: "Invalid Azure Speech key, or it doesn't match the region.",
        };
      }
      return {
        isValid: false,
        error: `Validation failed (HTTP ${response.status}).`,
      };
    } catch (error) {
      console.error("Azure Speech credential validation error:", error);
      return {
        isValid: false,
        error: "Network error during validation. Please try again.",
      };
    }
  }

  protected getErrorMessage(error: unknown): string {
    if (error && typeof error === "object" && "message" in error) {
      const message = String((error as { message: string }).message);

      if (message.includes("Missing Azure Speech key")) {
        return "Add your Azure Speech key and region in settings.";
      }
      if (message.includes("401")) {
        return "Invalid Azure Speech key or region.";
      }
      if (message.includes("429")) {
        return "Azure Speech quota or rate limit reached. Please wait and try again.";
      }
      if (message.includes("empty audio")) {
        return "Azure Speech returned no audio. Try a different voice.";
      }
      if (message.toLowerCase().includes("network")) {
        return "Connection failed. Check your internet.";
      }
      return `Azure Speech error: ${message}`;
    }
    return "Azure Speech error. Please try again.";
  }

  /**
   * Wrap the pipeline's inner SSML in Azure's required envelope and adjust the
   * one incompatible attribute: Azure prosody volume does not accept decibels,
   * so map `volume="±NdB"` to a bounded relative percentage.
   */
  private toAzureSsml(ssml: string): string {
    const inner = ssml
      .replace(/^\s*<speak[^>]*>/, "")
      .replace(/<\/speak>\s*$/, "")
      .replace(/volume="([+-]?\d+(?:\.\d+)?)dB"/g, (_match, db: string) => {
        const pct = Math.max(
          -50,
          Math.min(50, Math.round(parseFloat(db) * 10)),
        );
        const sign = pct >= 0 ? "+" : "";
        return `volume="${sign}${pct}%"`;
      });

    const locale = this.languageCode();
    return (
      `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}">` +
      `<voice name="${this.voice}">${inner}</voice>` +
      `</speak>`
    );
  }

  /**
   * Derive the locale from the voice ShortName (its first two hyphen-delimited
   * segments, e.g. "en-US-JennyNeural" → "en-US").
   */
  private languageCode(): string {
    const parts = this.voice.split("-");
    if (parts.length >= 2) {
      return `${parts[0]}-${parts[1]}`;
    }
    return "en-US";
  }
}
