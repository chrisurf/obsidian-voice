/**
 * Read and write chapters in an MP3's ID3v2 tag — pure, so it can be
 * unit-tested.
 *
 * Bookmarks are stored as standard ID3v2 chapters ("ID3v2 Chapter Frame
 * Addendum" 1.0): one CHAP frame per bookmark (start and end time plus a TIT2
 * title) and a CTOC frame listing them in order. Apple Podcasts, Overcast,
 * Android's media3 and tag editors read them. Writing replaces only the CHAP
 * and CTOC frames; every other frame (title, artist, cover) is kept as it is.
 * A file without a tag gets a new ID3v2.3 tag, the most widely read version.
 * An old reading that kept every chunk's Xing header is repaired on the way
 * (see repairMp3), so iPhone and iPad can seek to its bookmarks.
 */

import { audioDurationSeconds, repairMp3 } from "./audioFormat";
import { sortBookmarks, type Bookmark } from "./bookmarks";

/** An ID3 tag this module can't rewrite safely (e.g. ID3v2.2). */
export class UnsupportedTagError extends Error {}

interface Tag {
  /** Major version: 3 or 4. */
  version: number;
  /** Bytes of the whole tag, header (and footer) included. */
  length: number;
  /** The frames, each with its 10-byte header. */
  frames: Uint8Array[];
}

/** The bookmarks stored in an MP3's ID3v2 chapters, in playing order. */
export function readChapters(buffer: ArrayBuffer): Bookmark[] {
  let tag: Tag | null;
  try {
    tag = parseTag(new Uint8Array(buffer));
  } catch {
    return [];
  }
  if (!tag) {
    return [];
  }
  const out: Bookmark[] = [];
  for (const frame of tag.frames) {
    if (frameId(frame) !== "CHAP") {
      continue;
    }
    const chapter = parseChap(frameBody(frame, tag.version), tag.version);
    if (chapter) {
      out.push(chapter);
    }
  }
  return sortBookmarks(out);
}

/**
 * The MP3 with `bookmarks` as its chapters (none removes them). The ID3v2 tag
 * at the start is rewritten; the audio frames are unchanged (a stream with
 * several Xing headers gets one for the whole stream).
 * @throws UnsupportedTagError for a tag version other than 2.3 / 2.4.
 */
export function writeChapters(
  buffer: ArrayBuffer,
  bookmarks: readonly Bookmark[],
): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  const tag = parseTag(bytes);
  const version = tag?.version ?? 3;
  const audio = new Uint8Array(repairMp3(bytes.slice(tag?.length ?? 0).buffer));

  const kept = (tag?.frames ?? []).filter((f) => {
    const id = frameId(f);
    return id !== "CHAP" && id !== "CTOC";
  });
  const chapters = chapterFrames(audio, bookmarks, version);
  const frames = [...kept, ...chapters];
  if (frames.length === 0) {
    return audio.slice().buffer;
  }

  const body = concat(frames);
  const out = new Uint8Array(10 + body.length + audio.length);
  out.set([0x49, 0x44, 0x33, version, 0, 0]); // "ID3", no flags
  out.set(syncsafe(body.length), 6);
  out.set(body, 10);
  out.set(audio, 10 + body.length);
  return out.buffer;
}

/** The CTOC + CHAP frames for the bookmarks, or none. */
function chapterFrames(
  audio: Uint8Array,
  bookmarks: readonly Bookmark[],
  version: number,
): Uint8Array[] {
  const sorted = sortBookmarks(bookmarks);
  if (sorted.length === 0) {
    return [];
  }
  const seconds = audioDurationSeconds(audio.slice().buffer);
  const last = sorted[sorted.length - 1].startMs;
  const durationMs = Math.max(
    last,
    seconds === null ? last : Math.round(seconds * 1000),
  );
  const ids = sorted.map((_, i) => `chp${i}`);

  const toc = concat([
    latin1z("toc"),
    new Uint8Array([0x03, sorted.length]), // top-level + ordered, entry count
    ...ids.map(latin1z),
  ]);
  const chaps = sorted.map((b, i) => {
    const end = i + 1 < sorted.length ? sorted[i + 1].startMs : durationMs;
    const times = new Uint8Array(16);
    const view = new DataView(times.buffer);
    view.setUint32(0, b.startMs);
    view.setUint32(4, Math.max(b.startMs, end));
    view.setUint32(8, 0xffffffff); // no byte offsets
    view.setUint32(12, 0xffffffff);
    const title = frame("TIT2", encodeText(b.title, version), version);
    return frame("CHAP", concat([latin1z(ids[i]), times, title]), version);
  });
  return [frame("CTOC", toc, version), ...chaps];
}

/** Parse the ID3v2 tag at the start of the file, or null if there is none. */
function parseTag(bytes: Uint8Array): Tag | null {
  if (bytes.length < 10 || ascii(bytes, 0, 3) !== "ID3") {
    return null;
  }
  const version = bytes[3];
  if (version !== 3 && version !== 4) {
    throw new UnsupportedTagError(
      `ID3v2.${version} tags can't hold bookmarks; only 2.3 and 2.4 can.`,
    );
  }
  const flags = bytes[5];
  const size = readSyncsafe(bytes, 6);
  const length = 10 + size + (version === 4 && flags & 0x10 ? 10 : 0);
  let body = bytes.subarray(10, Math.min(bytes.length, 10 + size));
  // ID3v2.3 unsynchronises the whole tag; v2.4 marks it per frame.
  if (version === 3 && flags & 0x80) {
    body = resync(body);
  }
  let offset = 0;
  if (flags & 0x40) {
    // Extended header: dropped when the tag is rewritten.
    offset =
      version === 3
        ? 4 + new DataView(body.buffer, body.byteOffset).getUint32(0)
        : readSyncsafe(body, 0);
  }
  const frames: Uint8Array[] = [];
  while (offset + 10 <= body.length && body[offset] !== 0) {
    const id = ascii(body, offset, 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) {
      break;
    }
    const frameSize =
      version === 4
        ? readSyncsafe(body, offset + 4)
        : new DataView(body.buffer, body.byteOffset).getUint32(offset + 4);
    const end = offset + 10 + frameSize;
    if (end > body.length) {
      break;
    }
    frames.push(body.subarray(offset, end));
    offset = end;
  }
  return { version, length, frames };
}

/** A frame's content, without its header and any v2.3 / v2.4 extras. */
function frameBody(frame: Uint8Array, version: number): Uint8Array | null {
  const format = frame[9];
  let body = frame.subarray(10);
  if (version === 3) {
    if (format & 0xc0) {
      return null; // compressed or encrypted
    }
    return format & 0x20 ? body.subarray(1) : body; // group id
  }
  if (format & 0x0c) {
    return null; // compressed or encrypted
  }
  if (format & 0x40) {
    body = body.subarray(1); // group id
  }
  if (format & 0x01) {
    body = body.subarray(4); // data length indicator
  }
  return format & 0x02 ? resync(body) : body;
}

function parseChap(body: Uint8Array | null, version: number): Bookmark | null {
  if (!body) {
    return null;
  }
  const idEnd = body.indexOf(0);
  if (idEnd < 0 || idEnd + 17 > body.length) {
    return null;
  }
  const id = ascii(body, 0, idEnd);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const startMs = view.getUint32(idEnd + 1);
  let title = "";
  let offset = idEnd + 17;
  while (offset + 10 <= body.length && body[offset] !== 0) {
    const sub = ascii(body, offset, 4);
    const size =
      version === 4
        ? readSyncsafe(body, offset + 4)
        : view.getUint32(offset + 4);
    const end = Math.min(body.length, offset + 10 + size);
    if (sub === "TIT2") {
      const text = frameBody(body.subarray(offset, end), version);
      title = text ? decodeText(text) : "";
    }
    offset = end;
  }
  return { id, startMs, title: title || id };
}

/** A frame with its header (v2.4 sizes are syncsafe). */
function frame(id: string, body: Uint8Array, version: number): Uint8Array {
  const out = new Uint8Array(10 + body.length);
  writeAscii(out, 0, id);
  if (version === 4) {
    out.set(syncsafe(body.length), 4);
  } else {
    new DataView(out.buffer).setUint32(4, body.length);
  }
  out.set(body, 10);
  return out;
}

/**
 * A text frame body: Latin-1 when it fits, otherwise UTF-8 (v2.4) or UTF-16
 * with a byte order mark (v2.3, which has no UTF-8).
 */
function encodeText(text: string, version: number): Uint8Array {
  if ([...text].every((c) => c.charCodeAt(0) <= 0xff)) {
    return concat([new Uint8Array([0]), latin1(text)]);
  }
  if (version === 4) {
    return concat([new Uint8Array([3]), new TextEncoder().encode(text)]);
  }
  const out = new Uint8Array(3 + text.length * 2);
  out.set([1, 0xff, 0xfe]);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out[3 + i * 2] = code & 0xff;
    out[4 + i * 2] = code >> 8;
  }
  return out;
}

function decodeText(body: Uint8Array): string {
  const encoding = body[0];
  const data = body.subarray(1);
  let text: string;
  if (encoding === 1 || encoding === 2) {
    let little = encoding === 1;
    let start = 0;
    if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
      little = true;
      start = 2;
    } else if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) {
      little = false;
      start = 2;
    }
    text = "";
    for (let i = start; i + 1 < data.length; i += 2) {
      const code = little
        ? data[i] | (data[i + 1] << 8)
        : (data[i] << 8) | data[i + 1];
      if (code === 0) {
        break;
      }
      text += String.fromCharCode(code);
    }
  } else if (encoding === 3) {
    text = new TextDecoder("utf-8").decode(data);
  } else {
    text = ascii(data, 0, data.length);
  }
  const nul = text.indexOf("\u0000");
  return (nul >= 0 ? text.slice(0, nul) : text).trim();
}

/** Undo unsynchronisation: every 0xFF 0x00 becomes 0xFF. */
function resync(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  let length = 0;
  for (let i = 0; i < bytes.length; i++) {
    out[length++] = bytes[i];
    if (bytes[i] === 0xff && bytes[i + 1] === 0x00) {
      i++;
    }
  }
  return out.subarray(0, length);
}

function readSyncsafe(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function syncsafe(value: number): Uint8Array {
  return new Uint8Array([
    (value >> 21) & 0x7f,
    (value >> 14) & 0x7f,
    (value >> 7) & 0x7f,
    value & 0x7f,
  ]);
}

function frameId(frame: Uint8Array): string {
  return ascii(frame, 0, 4);
}

function latin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  writeAscii(out, 0, text);
  return out;
}

/** Latin-1 text with its terminating zero byte. */
function latin1z(text: string): Uint8Array {
  return concat([latin1(text), new Uint8Array([0])]);
}

function concat(parts: Uint8Array[]): Uint8Array {
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
  for (let i = start; i < start + length && i < bytes.length; i++) {
    text += String.fromCharCode(bytes[i]);
  }
  return text;
}

function writeAscii(bytes: Uint8Array, start: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    bytes[start + i] = text.charCodeAt(i);
  }
}
