/**
 * Pure helpers for the audio file formats the plugin produces and plays.
 *
 * Every built-in provider returns MP3. The OpenAI-compatible provider can also
 * be switched to WAV (many self-hosted servers produce WAV natively), so saving,
 * the chapter list, and chunk concatenation need to know about both. Kept free
 * of Obsidian/DOM APIs so the logic is unit-testable.
 */

/** File extensions of the audio the plugin saves and lists as chapters. */
export const AUDIO_EXTENSIONS = ["mp3", "wav"] as const;

export type AudioExtension = (typeof AUDIO_EXTENSIONS)[number];

const MIME_BY_EXTENSION: Record<AudioExtension, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

/** Whether a file extension (without the dot) is a supported audio format. */
export function isAudioExtension(extension: string): boolean {
  return (AUDIO_EXTENSIONS as readonly string[]).includes(
    extension.toLowerCase(),
  );
}

/** Whether a vault path points at a supported audio file. */
export function isAudioPath(path: string): boolean {
  const dot = path.lastIndexOf(".");
  return dot !== -1 && isAudioExtension(path.slice(dot + 1));
}

/** A file name without its audio extension ("Chapter 2.wav" → "Chapter 2"). */
export function stripAudioExtension(name: string): string {
  return name.replace(/\.(mp3|wav)$/i, "");
}

/** The MIME type for an audio extension. */
export function mimeForAudioExtension(extension: AudioExtension): string {
  return MIME_BY_EXTENSION[extension];
}

/**
 * The file extension to save a blob under, from its MIME type. Anything that is
 * not recognisably WAV is saved as MP3, the plugin's historical default.
 */
export function audioExtensionForMime(mime: string): AudioExtension {
  const type = mime.toLowerCase();
  return type.includes("wav") || type.includes("wave") ? "wav" : "mp3";
}

/** Whether the bytes start with a RIFF/WAVE header. */
export function isWavBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) {
    return false;
  }
  const bytes = new Uint8Array(buffer, 0, 12);
  return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE";
}

/**
 * Join several WAV files into one playable WAV.
 *
 * Concatenating WAV blobs byte-wise does not work: each chunk carries its own
 * RIFF header, and players stop after the first chunk's declared data size.
 * This keeps the first file's format chunk, appends every file's PCM data, and
 * writes a single header with the combined sizes. Streaming servers sometimes
 * write a placeholder data size (0 or 0xFFFFFFFF); in that case the rest of the
 * file is taken as data.
 *
 * @throws when a buffer is not a WAV file or has no format/data chunk.
 */
export function concatWavBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 0) {
    throw new Error("No WAV data to join");
  }
  const parts = buffers.map(parseWav);
  const format = parts[0].format;
  const dataLength = parts.reduce((sum, part) => sum + part.data.length, 0);

  // RIFF header (12) + fmt chunk header (8) + fmt body + data header (8).
  const headerLength = 12 + 8 + format.length + 8;
  const out = new Uint8Array(headerLength + dataLength);
  const view = new DataView(out.buffer);

  writeAscii(out, 0, "RIFF");
  view.setUint32(4, out.length - 8, true);
  writeAscii(out, 8, "WAVE");
  writeAscii(out, 12, "fmt ");
  view.setUint32(16, format.length, true);
  out.set(format, 20);
  const dataHeader = 20 + format.length;
  writeAscii(out, dataHeader, "data");
  view.setUint32(dataHeader + 4, dataLength, true);

  let offset = headerLength;
  for (const part of parts) {
    out.set(part.data, offset);
    offset += part.data.length;
  }
  return out.buffer;
}

interface WavParts {
  format: Uint8Array;
  data: Uint8Array;
}

function parseWav(buffer: ArrayBuffer): WavParts {
  if (!isWavBuffer(buffer)) {
    throw new Error("Audio chunk is not a WAV file");
  }
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let format: Uint8Array | null = null;
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4);
    const declared = view.getUint32(offset + 4, true);
    const bodyStart = offset + 8;
    const remaining = bytes.length - bodyStart;

    if (id === "data") {
      if (!format) {
        break;
      }
      const size =
        declared === 0 || declared > remaining ? remaining : declared;
      return { format, data: bytes.subarray(bodyStart, bodyStart + size) };
    }
    if (id === "fmt ") {
      format = bytes.slice(
        bodyStart,
        bodyStart + Math.min(declared, remaining),
      );
    }
    // Chunks are padded to an even size.
    offset = bodyStart + declared + (declared % 2);
  }
  throw new Error("WAV file has no format or data chunk");
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let text = "";
  for (let i = start; i < start + length; i++) {
    text += String.fromCharCode(bytes[i]);
  }
  return text;
}

function writeAscii(bytes: Uint8Array, start: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    bytes[start + i] = text.charCodeAt(i);
  }
}
