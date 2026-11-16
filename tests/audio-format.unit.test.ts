import {
  audioDurationSeconds,
  audioExtensionForMime,
  concatMp3Buffers,
  mp3AudioFrames,
  concatWavBuffers,
  isAudioExtension,
  isAudioPath,
  isWavBuffer,
  stripAudioExtension,
} from "../src/utils/audioFormat";

/** A minimal PCM WAV file holding `samples` as raw data bytes. */
function wav(samples: number[], dataSize = samples.length): ArrayBuffer {
  const out = new Uint8Array(44 + samples.length);
  const view = new DataView(out.buffer);
  const text = (offset: number, s: string) =>
    [...s].forEach((c, i) => (out[offset + i] = c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 24000, true);
  view.setUint32(28, 24000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, dataSize, true);
  out.set(samples, 44);
  return out.buffer;
}

function dataOf(buffer: ArrayBuffer): number[] {
  const view = new DataView(buffer);
  const size = view.getUint32(40, true);
  return [...new Uint8Array(buffer, 44, size)];
}

// MPEG-2 Layer III, 24 kHz mono, 48 kbps: 144-byte frames, side info 9 bytes.
const FRAME = [0xff, 0xf3, 0x64, 0xc4];
const FRAME_LENGTH = 144;
const TAG_OFFSET = 4 + 9;

/** One audio frame filled with `fill`, or a Xing header frame when tagged. */
function frame(fill: number, tag?: string): number[] {
  const out = new Array<number>(FRAME_LENGTH).fill(fill);
  out.splice(0, 4, ...FRAME);
  if (tag) {
    out.splice(TAG_OFFSET, 4, ...[...tag].map((c) => c.charCodeAt(0)));
  }
  return out;
}

/** An MP3 file: optional header frame, then audio frames filled 1, 2, 3… */
function mp3(frames: number, header?: string, id3 = false): ArrayBuffer {
  const bytes: number[] = [];
  if (id3) {
    bytes.push(...[..."ID3"].map((c) => c.charCodeAt(0)), 4, 0, 0, 0, 0, 0, 2);
    bytes.push(0, 0);
  }
  if (header) {
    bytes.push(...frame(0, header));
  }
  for (let i = 1; i <= frames; i++) {
    bytes.push(...frame(i));
  }
  return new Uint8Array(bytes).buffer;
}

function count(bytes: Uint8Array, text: string): number {
  return Buffer.from(bytes).toString("latin1").split(text).length - 1;
}

describe("Unit Tests - Audio format helpers", () => {
  test("recognises MP3 and WAV extensions and paths", () => {
    expect(isAudioExtension("mp3")).toBe(true);
    expect(isAudioExtension("WAV")).toBe(true);
    expect(isAudioExtension("png")).toBe(false);
    expect(isAudioPath("Audio/Note.wav")).toBe(true);
    expect(isAudioPath("Audio/Note.md")).toBe(false);
    expect(isAudioPath("Audio/no-extension")).toBe(false);
  });

  test("strips only audio extensions", () => {
    expect(stripAudioExtension("Chapter 2.mp3")).toBe("Chapter 2");
    expect(stripAudioExtension("Chapter 2.WAV")).toBe("Chapter 2");
    expect(stripAudioExtension("v1.2 notes")).toBe("v1.2 notes");
  });

  test("maps MIME types to a file extension, defaulting to MP3", () => {
    expect(audioExtensionForMime("audio/wav")).toBe("wav");
    expect(audioExtensionForMime("audio/x-wav")).toBe("wav");
    expect(audioExtensionForMime("audio/mpeg")).toBe("mp3");
    expect(audioExtensionForMime("")).toBe("mp3");
  });

  test("detects a WAV header", () => {
    expect(isWavBuffer(wav([1, 2]))).toBe(true);
    expect(isWavBuffer(new Uint8Array([0xff, 0xfb, 0, 0]).buffer)).toBe(false);
  });

  describe("concatWavBuffers", () => {
    test("joins the PCM data under a single header", () => {
      const joined = concatWavBuffers([wav([1, 2, 3]), wav([4, 5])]);
      const view = new DataView(joined);

      expect(isWavBuffer(joined)).toBe(true);
      expect(view.getUint32(4, true)).toBe(joined.byteLength - 8);
      expect(view.getUint32(24, true)).toBe(24000);
      expect(dataOf(joined)).toEqual([1, 2, 3, 4, 5]);
    });

    test("reads to the end when a streaming server left the data size open", () => {
      const joined = concatWavBuffers([wav([1, 2], 0xffffffff), wav([3], 0)]);
      expect(dataOf(joined)).toEqual([1, 2, 3]);
    });

    test("rejects data that is not WAV", () => {
      expect(() => concatWavBuffers([new ArrayBuffer(8)])).toThrow(/WAV/);
      expect(() => concatWavBuffers([])).toThrow();
    });
  });

  describe("concatMp3Buffers", () => {
    test("joins chunks without a header byte-wise, as before", () => {
      const a = mp3(2);
      const b = mp3(3);
      const out = new Uint8Array(concatMp3Buffers([a, b]));
      expect([...out]).toEqual([...new Uint8Array(a), ...new Uint8Array(b)]);
    });

    test("replaces the per-chunk Xing/Info headers with one for the whole file", () => {
      const out = new Uint8Array(
        concatMp3Buffers([mp3(2, "Xing"), mp3(3, "Info", true), mp3(1)]),
      );
      const view = new DataView(out.buffer);
      expect(count(out, "Xing")).toBe(1);
      expect(count(out, "Info")).toBe(0);
      expect(count(out, "ID3")).toBe(0);
      // Header frame first, then all six audio frames in order.
      expect(out[0]).toBe(0xff);
      const header = out.length - 6 * FRAME_LENGTH;
      const fills = [0, 1, 2, 3, 4, 5].map(
        (i) => out[header + i * FRAME_LENGTH + 20],
      );
      expect(fills).toEqual([1, 2, 1, 2, 3, 1]);
      // The tag holds frame count and total size.
      const tag = TAG_OFFSET;
      expect(String.fromCharCode(...out.subarray(tag, tag + 4))).toBe("Xing");
      expect(view.getUint32(tag + 4)).toBe(0x7);
      expect(view.getUint32(tag + 8)).toBe(6);
      expect(view.getUint32(tag + 12)).toBe(out.length);
      // Seek table rises from the first audio frame towards the end.
      const toc = [...out.subarray(tag + 16, tag + 116)];
      expect(toc[0]).toBe(Math.floor((header / out.length) * 256));
      expect([...toc].sort((x, y) => x - y)).toEqual(toc);
    });

    test("leaves data that is not MPEG Layer III untouched", () => {
      const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
      const tagged = mp3(1, "Xing");
      const out = new Uint8Array(concatMp3Buffers([tagged, junk]));
      expect(out.length).toBe(tagged.byteLength + junk.byteLength);
    });
  });

  describe("streaming helpers", () => {
    test("strips tags and header frames for appending to a stream", () => {
      const frames = mp3AudioFrames(mp3(3, "Xing", true));
      expect(frames.length).toBe(3 * FRAME_LENGTH);
      expect(count(frames, "Xing")).toBe(0);
      expect(frames[20]).toBe(1);
    });

    test("measures MP3 and WAV playing time", () => {
      // MPEG-2 Layer III: 576 samples per frame at 24 kHz.
      expect(audioDurationSeconds(mp3(250, "Xing"))).toBeCloseTo(6, 5);
      // 8-bit mono at 24 kHz: 24000 bytes per second.
      const view = new DataView(wav(new Array(12000).fill(0)));
      view.setUint32(28, 24000, true);
      expect(audioDurationSeconds(view.buffer)).toBeCloseTo(0.5, 5);
      expect(audioDurationSeconds(new ArrayBuffer(8))).toBeNull();
    });
  });
});
