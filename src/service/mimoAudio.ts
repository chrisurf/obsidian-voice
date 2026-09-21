/**
 * Pure helpers for Xiaomi MiMo TTS (chat-completions audio).
 *
 * MiMo is "OpenAI compatible" only in the chat sense: synthesis is
 * POST /v1/chat/completions with an `audio` field, and the MP3/WAV comes back
 * as base64 in `choices[0].message.audio.data`. Keeping decoding, message
 * construction, and response interpretation here — free of Obsidian/DOM APIs —
 * lets it be unit-tested and keeps the service thin.
 */

export const MIMO_MODEL = "mimo-v2.5-tts";
export const MIMO_DEFAULT_HOST = "api.xiaomimimo.com";

export interface MimoChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface MimoChatResponse {
  error?: { message?: string; type?: string; code?: string } | string;
  choices?: Array<{
    finish_reason?: string;
    message?: {
      audio?: {
        id?: string;
        data?: string;
        format?: string;
      };
    };
  }>;
}

export type MimoAudioResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: string };

/**
 * Build the chat messages MiMo expects: optional style in `user` (never
 * spoken) and the text to synthesise in `assistant`.
 */
export function buildMimoMessages(
  text: string,
  style?: string,
): MimoChatMessage[] {
  const messages: MimoChatMessage[] = [];
  const trimmedStyle = style?.trim();
  if (trimmedStyle) {
    messages.push({ role: "user", content: trimmedStyle });
  }
  messages.push({ role: "assistant", content: text });
  return messages;
}

/**
 * Chat-completions URL for a stored host (no protocol). Token Plan hosts
 * share the same `/v1/chat/completions` path as pay-as-you-go.
 */
export function mimoEndpoint(host: string): string {
  const cleaned = (host || MIMO_DEFAULT_HOST).trim().replace(/\/+$/, "");
  return `https://${cleaned}/v1/chat/completions`;
}

/**
 * Decode a standard base64 string into bytes. Strips whitespace and a data-URL
 * prefix if present. Throws on empty or malformed input.
 */
export function base64ToBytes(b64: string): Uint8Array {
  const stripped = b64.trim().replace(/\s/g, "");
  const comma = stripped.indexOf(",");
  const data =
    stripped.startsWith("data:") && comma !== -1
      ? stripped.slice(comma + 1)
      : stripped;
  if (!data) {
    throw new Error("Empty base64 audio data.");
  }

  let binary: string;
  try {
    binary = window.atob(data);
  } catch {
    throw new Error("Invalid base64 audio data.");
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  if (bytes.byteLength === 0) {
    throw new Error("Empty base64 audio data.");
  }
  return bytes;
}

/** Copy bytes into a standalone ArrayBuffer (safe to hand to Blob / join). */
export function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * Best-effort error text from a MiMo / OpenAI-style JSON error body.
 */
export function mimoErrorMessageFrom(resp: MimoChatResponse): string {
  const err = resp.error;
  if (typeof err === "string" && err.trim()) {
    return err.trim();
  }
  if (err && typeof err === "object" && typeof err.message === "string") {
    return err.message;
  }
  return "";
}

/**
 * Interpret a parsed chat-completions response: return the decoded audio
 * bytes, or a descriptive error (API error object, missing audio, bad
 * base64, content filter, …).
 */
export function extractMimoAudio(resp: MimoChatResponse): MimoAudioResult {
  const apiError = mimoErrorMessageFrom(resp);
  if (apiError) {
    return { ok: false, error: apiError };
  }

  const choice = resp.choices?.[0];
  if (choice?.finish_reason === "content_filter") {
    return {
      ok: false,
      error: "MiMo blocked the text (content filter).",
    };
  }

  const audioB64 = choice?.message?.audio?.data;
  if (!audioB64) {
    return { ok: false, error: "MiMo returned no audio." };
  }

  try {
    const bytes = base64ToBytes(audioB64);
    return { ok: true, bytes };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid audio data.",
    };
  }
}
