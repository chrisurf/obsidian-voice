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

/**
 * Join several MP3 files into one MP3 that reports its full length.
 *
 * Appending MP3 bytes plays fine, but many encoders (LAME, libsndfile, ffmpeg)
 * put a Xing/Info header frame at the start of every file holding that file's
 * frame count. After a byte-wise join, players read the first header and show
 * the first chunk's length, or notice the mismatch and estimate a wrong one
 * from the variable bitrate. This drops every header frame and ID3 tag and
 * writes one Xing header for the whole stream (frame count, size, seek table).
 *
 * Chunks without such a header (Polly, Azure, ElevenLabs, OpenAI) are joined
 * byte-wise as before. Anything that is not MPEG Layer III is left untouched.
 */
export function concatMp3Buffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const joined = concatBytes(buffers.map((b) => new Uint8Array(b)));
  const parts = buffers.map((b) => parseMp3(new Uint8Array(b)));
  if (!parts.some((p) => p?.hadHeader) || parts.some((p) => !p)) {
    return joined.buffer as ArrayBuffer;
  }
  const frames = (parts as Mp3Parts[]).flatMap((p) => p.frames);
  if (frames.length === 0) {
    return joined.buffer as ArrayBuffer;
  }
  const header = xingFrame(frames);
  const out = concatBytes([header, ...frames]);
  writeXingCounts(out, header.length, frames);
  return out.buffer as ArrayBuffer;
}

/**
 * The audio frames of one MP3 file without its ID3 tags and Xing/Info header
 * frame — what a streaming player (MediaSource) appends chunk after chunk.
 * Returns the bytes unchanged when they are not MPEG Layer III.
 */
export function mp3AudioFrames(buffer: ArrayBuffer): Uint8Array {
  const parts = parseMp3(new Uint8Array(buffer));
  return parts ? concatBytes(parts.frames) : new Uint8Array(buffer);
}

/** The playing time of an MP3 or WAV file in seconds, or null if unknown. */
export function audioDurationSeconds(buffer: ArrayBuffer): number | null {
  if (isWavBuffer(buffer)) {
    try {
      const { format, data } = parseWav(buffer);
      const byteRate = new DataView(
        format.buffer,
        format.byteOffset,
        format.byteLength,
      ).getUint32(8, true);
      return byteRate > 0 ? data.length / byteRate : null;
    } catch {
      return null;
    }
  }
  const parts = parseMp3(new Uint8Array(buffer));
  if (!parts || parts.frames.length === 0) {
    return null;
  }
  return parts.frames.reduce((sum, frame) => {
    const info = frameAt(frame, 0) as FrameInfo;
    return sum + info.samples / info.sampleRate;
  }, 0);
}

/**
 * Join the per-chunk audio of one reading into one playable blob. Both formats
 * can carry a per-file header (WAV always, MP3 often a Xing/Info frame with
 * the length), so the chunks are merged into one file with a single header.
 * The format is read from the bytes rather than trusted from the request,
 * since some servers ignore the requested format.
 */
export function joinAudioBuffers(chunks: ArrayBuffer[]): Blob {
  if (chunks.length > 0 && isWavBuffer(chunks[0])) {
    return new Blob([concatWavBuffers(chunks)], {
      type: mimeForAudioExtension("wav"),
    });
  }
  return new Blob([concatMp3Buffers(chunks)], {
    type: mimeForAudioExtension("mp3"),
  });
}

type Mp3Frame = Uint8Array;

interface Mp3Parts {
  frames: Mp3Frame[];
  /** Whether the file carried a Xing/Info/VBRI header frame or an ID3 tag. */
  hadHeader: boolean;
}

interface FrameInfo {
  length: number;
  /** Offset of a Xing/Info tag inside the frame (after the side info). */
  tagOffset: number;
  sampleRate: number;
  /** Samples per channel the frame decodes to. */
  samples: number;
}

const LAYER3_KBPS = {
  mpeg1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  mpeg2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES = [44100, 48000, 32000];
const XING_FLAGS = 0x7; // frames + bytes + seek table
const XING_SIZE = 4 + 4 + 4 + 4 + 100;

/** The Layer III frame starting at `offset`, or null if there is none. */
function frameAt(bytes: Uint8Array, offset: number): FrameInfo | null {
  if (offset + 4 > bytes.length) {
    return null;
  }
  const [b0, b1, b2, b3] = bytes.subarray(offset, offset + 4);
  const version = (b1 >> 3) & 3; // 0 = 2.5, 2 = 2, 3 = 1
  const layer = (b1 >> 1) & 3; // 1 = Layer III
  const bitrate = b2 >> 4;
  const rate = (b2 >> 2) & 3;
  if (
    b0 !== 0xff ||
    (b1 & 0xe0) !== 0xe0 ||
    version === 1 ||
    layer !== 1 ||
    bitrate === 0 ||
    bitrate === 15 ||
    rate === 3
  ) {
    return null;
  }
  const mpeg1 = version === 3;
  const sampleRate = SAMPLE_RATES[rate] / (mpeg1 ? 1 : version === 2 ? 2 : 4);
  const kbps = (mpeg1 ? LAYER3_KBPS.mpeg1 : LAYER3_KBPS.mpeg2)[bitrate];
  const padding = (b2 >> 1) & 1;
  const length =
    Math.floor(((mpeg1 ? 144000 : 72000) * kbps) / sampleRate) + padding;
  const mono = b3 >> 6 === 3;
  const sideInfo = mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17;
  return {
    length,
    tagOffset: 4 + sideInfo,
    sampleRate,
    samples: mpeg1 ? 1152 : 576,
  };
}

/** Split one MP3 file into its audio frames, dropping tags and header frames. */
function parseMp3(bytes: Uint8Array): Mp3Parts | null {
  const frames: Mp3Frame[] = [];
  let hadHeader = false;
  let offset = 0;
  let end = bytes.length;

  if (end >= 128 && ascii(bytes, end - 128, 3) === "TAG") {
    end -= 128; // ID3v1
    hadHeader = true;
  }
  while (offset < end) {
    if (offset + 10 <= end && ascii(bytes, offset, 3) === "ID3") {
      const size =
        (bytes[offset + 6] << 21) |
        (bytes[offset + 7] << 14) |
        (bytes[offset + 8] << 7) |
        bytes[offset + 9];
      const footer = bytes[offset + 5] & 0x10 ? 10 : 0;
      offset += 10 + size + footer;
      hadHeader = true;
      continue;
    }
    const frame = frameAt(bytes, offset);
    if (!frame || offset + frame.length > end) {
      // A truncated last frame or stray bytes: keep what we have.
      if (frames.length > 0 && end - offset < 4096) {
        break;
      }
      return null;
    }
    const tag = ascii(bytes, offset + frame.tagOffset, 4);
    if (
      tag === "Xing" ||
      tag === "Info" ||
      ascii(bytes, offset + 36, 4) === "VBRI"
    ) {
      hadHeader = true;
    } else {
      frames.push(bytes.subarray(offset, offset + frame.length));
    }
    offset += frame.length;
  }
  return { frames, hadHeader };
}

/** An empty frame shaped like the first audio frame, big enough for a Xing tag. */
function xingFrame(frames: Mp3Frame[]): Uint8Array {
  const first = frames[0];
  const info = frameAt(first, 0) as FrameInfo;
  const needed = info.tagOffset + XING_SIZE;
  // The smallest bitrate whose frame holds the tag (no padding).
  for (let bitrate = 1; bitrate < 15; bitrate++) {
    const b2 = (bitrate << 4) | (first[2] & 0x0c);
    const header = [0xff, first[1] | 0x01, b2, first[3]]; // no CRC
    const length = (frameAt(new Uint8Array(header), 0) as FrameInfo).length;
    if (length >= needed) {
      const out = new Uint8Array(length);
      out.set(header);
      writeAscii(out, info.tagOffset, "Xing");
      return out;
    }
  }
  throw new Error("No MP3 frame size fits a Xing header");
}

/** Fill in the Xing tag: frame count, total bytes, and the 100-entry seek table. */
function writeXingCounts(
  out: Uint8Array,
  headerLength: number,
  frames: Mp3Frame[],
): void {
  const tag = (frameAt(out, 0) as FrameInfo).tagOffset;
  const view = new DataView(out.buffer);
  view.setUint32(tag + 4, XING_FLAGS);
  view.setUint32(tag + 8, frames.length);
  view.setUint32(tag + 12, out.length);
  const starts: number[] = [];
  let position = headerLength;
  for (const frame of frames) {
    starts.push(position);
    position += frame.length;
  }
  for (let i = 0; i < 100; i++) {
    const start = starts[Math.floor((i / 100) * frames.length)];
    out[tag + 16 + i] = Math.min(255, Math.floor((start / out.length) * 256));
  }
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
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
