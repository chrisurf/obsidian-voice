/**
 * Pure helpers for the MiniMax T2A (text-to-audio) HTTP API.
 *
 * MiniMax returns the synthesized audio as a hex-encoded string in
 * `data.audio` (with `output_format: "hex"`), and reports success/failure via
 * `base_resp.status_code` (0 = success). Keeping the decoding and response
 * interpretation here — free of Obsidian/DOM APIs — lets it be unit-tested and
 * keeps the service thin.
 */

export interface MiniMaxBaseResp {
  status_code?: number;
  status_msg?: string;
}

export interface MiniMaxT2AResponse {
  data?: {
    audio?: string;
    status?: number;
  };
  base_resp?: MiniMaxBaseResp;
}

export type T2AResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: string };

/**
 * Decode a hex string (e.g. "fffb90...") into bytes. Throws on malformed input
 * (odd length or non-hex characters) so callers surface a clear error.
 */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2 !== 0) {
    throw new Error("Invalid hex audio data (odd length).");
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const pair = clean.slice(i * 2, i * 2 + 2);
    const byte = Number.parseInt(pair, 16);
    if (Number.isNaN(byte) || !/^[0-9a-fA-F]{2}$/.test(pair)) {
      throw new Error("Invalid hex audio data (non-hex characters).");
    }
    bytes[i] = byte;
  }
  return bytes;
}

/**
 * Map a MiniMax `base_resp.status_code` to a friendly, actionable message.
 */
export function minimaxErrorMessage(code: number, msg?: string): string {
  switch (code) {
    case 1004:
      return "MiniMax: authentication failed — check your API key and Group ID.";
    case 1002:
      return "MiniMax: rate limit reached. Please wait and try again.";
    case 1039:
      return "MiniMax: token rate limit (TPM) reached. Please wait and try again.";
    case 1008:
      return "MiniMax: insufficient account balance.";
    case 1042:
      return "MiniMax: the text contains characters the voice cannot read.";
    case 2013:
    case 2049:
      return `MiniMax: invalid request${msg ? ` (${msg})` : ""}.`;
    default:
      return `MiniMax error ${code}${msg ? `: ${msg}` : ""}.`;
  }
}

/**
 * Interpret a parsed T2A response: return the decoded audio bytes, or a
 * descriptive error (bad credentials, empty audio, malformed hex, …).
 */
export function extractT2AAudio(resp: MiniMaxT2AResponse): T2AResult {
  const code = resp.base_resp?.status_code;
  if (code !== undefined && code !== 0) {
    return {
      ok: false,
      error: minimaxErrorMessage(code, resp.base_resp?.status_msg),
    };
  }

  const audioHex = resp.data?.audio;
  if (!audioHex) {
    return { ok: false, error: "MiniMax returned no audio." };
  }

  try {
    const bytes = hexToBytes(audioHex);
    if (bytes.byteLength === 0) {
      return { ok: false, error: "MiniMax returned an empty audio response." };
    }
    return { ok: true, bytes };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid audio data.",
    };
  }
}
