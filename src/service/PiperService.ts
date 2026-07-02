import { requestUrl } from "obsidian";
import type { VoiceOption, VoiceSettings } from "../settings/VoiceSettings";
import { PIPER_DEFAULT_URL } from "../settings/VoiceSettings";
import { BaseSpeechService } from "./BaseSpeechService";
import type { CredentialValidationResult } from "./SpeechProvider";
import { chunkPlainText } from "./textChunker";

/**
 * Piper local Text-to-Speech integration.
 *
 * Supports two server generations:
 *   - rhasspy/piper  (v1.0.0, archived) - synthesis at POST /
 *   - OHF-Voice/piper1-gpl (v1.4+, current) - synthesis at POST /synthesize
 *
 * The service auto-detects which endpoint the running server uses on the first
 * synthesis call and caches the result for subsequent calls.
 *
 * Requirements for the user:
 *   pip install "piper-tts[http]"
 *   python3 -m piper.download_voices <voice-name>
 *   python3 -m piper.http_server -m <voice-name>   # defaults to port 5000
 *
 * Speed mapping: Piper's length_scale is the inverse of the plugin's speed
 * multiplier (length_scale = 1 / speed). Plugin 2x (fast) -> length_scale 0.5;
 * plugin 0.5x (slow) -> length_scale 2.0.
 *
 * Output: WAV audio (not MP3). AudioFileManager derives the file extension
 * from the blob MIME type, so saved files are written as .wav.
 *
 * Playback/controls/caching are inherited from BaseSpeechService.
 */

// Conservative per-request size. Piper has no documented character limit but
// smaller chunks reduce per-request latency and avoid edge-case timeouts on
// very long documents. Matches the SSML pipeline's chunk target.
const MAX_CHUNK_CHARS = 3000;

/** OHF-Voice/piper1-gpl (v1.4+) synthesis endpoint. */
const PATH_SYNTHESIZE = "/synthesize";
/** Legacy rhasspy/piper (v1.0.0) synthesis endpoint. */
const PATH_ROOT = "/";
const PATH_VOICES = "/voices";

export class PiperService extends BaseSpeechService {
  readonly inputFormat = "text" as const;
  readonly supportsBreakTags = false as const;

  private serverUrl: string;
  /**
   * Cached synthesis path - null until first detection.
   * "/synthesize" for OHF-Voice/piper1-gpl; "/" for legacy rhasspy/piper.
   */
  private synthesisPath: string | null = null;
  private voiceCatalog: VoiceOption[];

  constructor(serverUrl: string, voice: string, speed?: number, voiceCatalog?: VoiceOption[]) {
    super(voice, speed);
    this.serverUrl = normalizeUrl(serverUrl);
    this.voiceCatalog = voiceCatalog ?? [];
  }

  getVoiceOptions(): VoiceOption[] {
    return this.voiceCatalog;
  }

  updateCredentials(settings: VoiceSettings): void {
    const newUrl = normalizeUrl(settings.PIPER_URL);
    if (newUrl !== this.serverUrl) {
      // Reset cached path so detection reruns for the new server.
      this.synthesisPath = null;
    }
    this.serverUrl = newUrl;
    this.voice = settings.PIPER_VOICE ?? "";
    this.voiceCatalog = settings.piperVoiceCatalog ?? [];
  }

  /**
   * Validate the connection by fetching /voices from the Piper HTTP server.
   * Returns the list of available voices so the settings tab can cache them.
   */
  async validateCredentials(): Promise<CredentialValidationResult> {
    try {
      const res = await requestUrl({
        url: `${this.serverUrl}${PATH_VOICES}`,
        method: "GET",
        throw: false,
      });

      if (res.status === 200) {
        const voices = parseVoicesResponse(res.json);

        return { isValid: true, voiceCount: voices.length, voices };
      }

      return {
        isValid: false,
        error: `Piper server returned HTTP ${res.status}. Is it running correctly?`,
      };
    } catch {
      return {
        isValid: false,
        error: `Cannot reach Piper server at ${this.serverUrl}. Make sure it is running (python3 -m piper.http_server -m <voice>).`,
      };
    }
  }

  /**
   * Synthesize and play plain text via Piper.
   */
  async speak(
    content: string,
    speed?: number,
    filePath?: string,
  ): Promise<void> {
    if (this.isLoading) {
      throw new Error("Piper call already in progress.");
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

        const blob = await this.synthesizeChunk(chunks[i], speed);

        if (this.abortController?.signal.aborted) {
          throw new Error("AbortError");
        }

        audioBlobs.push(blob);
        this.reportProgress(((i + 1) / chunks.length) * 0.95, 1);
      }

      const finalBlob = new Blob(audioBlobs, { type: "audio/wav" });
      this.playBlob(finalBlob, speed, filePath);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Error in Piper speak:", error);
      this.reportError(error);
      throw error;
    } finally {
      this.isLoading = false;
      this.abortController = undefined;
    }
  }

  /**
   * POST a single text chunk and return the WAV blob.
   * Tries /synthesize first (OHF-Voice/piper1-gpl); falls back to POST / on 404
   * (legacy rhasspy/piper v1.0.0). The detected path is cached for the session.
   */
  private async synthesizeChunk(text: string, speed?: number): Promise<Blob> {
    const effectiveSpeed = speed ?? this.speed;
    // Piper's length_scale is the inverse of the plugin's speed multiplier:
    //   plugin 2x (fast) -> length_scale 0.5
    //   plugin 0.5x (slow) -> length_scale 2.0
    const lengthScale = effectiveSpeed > 0 ? 1 / effectiveSpeed : 1;

    const body: Record<string, unknown> = {
      text,
      length_scale: lengthScale,
    };
    if (this.voice) {
      body["voice"] = this.voice;
    }

    const path = this.synthesisPath ?? PATH_SYNTHESIZE;
    const res = await requestUrl({
      url: `${this.serverUrl}${path}`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      throw: false,
    });

    // Legacy rhasspy/piper uses POST / instead of POST /synthesize.
    // Detect once and cache so all subsequent chunks skip the retry.
    if (
      res.status === 404 &&
      path === PATH_SYNTHESIZE &&
      this.synthesisPath === null
    ) {
      this.synthesisPath = PATH_ROOT;
      return this.synthesizeChunk(text, speed);
    }

    if (this.synthesisPath === null) {
      this.synthesisPath = PATH_SYNTHESIZE;
    }

    if (res.status !== 200) {
      throw new Error(`Piper synthesis failed (HTTP ${res.status})`);
    }

    const buf = res.arrayBuffer;
    if (!buf || buf.byteLength === 0) {
      throw new Error("Piper returned an empty audio response");
    }

    return new Blob([buf], { type: "audio/wav" });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip trailing slash so URL + path concatenation is always consistent. */
function normalizeUrl(url: string | undefined): string {
  return (url || PIPER_DEFAULT_URL).replace(/\/+$/, "");
}

/**
 * Parse the GET /voices response into VoiceOption[].
 *
 * Both server generations return an object keyed by voice name:
 *   { "en_US-lessac-medium": { language: { code, name_english, ... }, ... } }
 *
 * (The original documentation described an array, but the actual server
 * implementation uses a dict - verified from the Flask source.)
 */
function parseVoicesResponse(json: unknown): VoiceOption[] {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return [];
  }
  return Object.entries(json as Record<string, PiperVoiceConfig>).map(
    ([name, config]) => {
      const lang =
        config?.language?.name_english ?? config?.language?.code ?? "";
      return {
        id: name,
        label: lang ? `${name} (${lang})` : name,
        lang: config?.language?.code ?? "und",
        group: config?.language?.name_english ?? config?.language?.code,
      };
    },
  );
}

/** Partial shape of a voice config value from GET /voices. */
interface PiperVoiceConfig {
  language?: {
    code?: string;
    name_english?: string;
  };
}
