import {
  audioExtensionForMime,
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
});
