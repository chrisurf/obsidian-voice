import {
  addBookmark,
  bookmarkPositions,
  defaultBookmarkTitle,
  formatClock,
  removeBookmark,
  renameBookmark,
  type Bookmark,
} from "../src/utils/bookmarks";
import {
  readChapters,
  UnsupportedTagError,
  writeChapters,
} from "../src/utils/id3Chapters";
import { audioDurationSeconds } from "../src/utils/audioFormat";

// MPEG-2 Layer III, 24 kHz mono, 48 kbps: 144-byte frames of 24 ms each.
const FRAME = [0xff, 0xf3, 0x64, 0xc4];

function mp3(frames: number, tag: number[] = []): ArrayBuffer {
  const bytes = [...tag];
  for (let i = 1; i <= frames; i++) {
    const frame = new Array<number>(144).fill(i);
    frame.splice(0, 4, ...FRAME);
    bytes.push(...frame);
  }
  return new Uint8Array(bytes).buffer;
}

const text = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** An ID3v2.3 tag holding one TIT2 (song title) frame. */
function titleTag(title: string, flags = 0): number[] {
  const body = [0, ...text(title)];
  const frame = [...text("TIT2"), 0, 0, 0, body.length, 0, 0, ...body];
  return [...text("ID3"), 3, 0, flags, 0, 0, 0, frame.length, ...frame];
}

const bm = (id: string, startMs: number, title = id): Bookmark => ({
  id,
  startMs,
  title,
});

describe("Unit Tests - Bookmarks", () => {
  test("adds bookmarks in playing order with numbered names", () => {
    let list: Bookmark[] = [];
    list = addBookmark(list, 5000, "a").list;
    const second = addBookmark(list, 1000, "b");
    expect(second.added).toBe(true);
    expect(second.bookmark.title).toBe("Bookmark 2");
    expect(second.list.map((b) => b.id)).toEqual(["b", "a"]);
  });

  test("a second tap at the same position keeps one bookmark", () => {
    const list = addBookmark([], 5000, "a").list;
    const again = addBookmark(list, 5600, "b");
    expect(again.added).toBe(false);
    expect(again.bookmark.id).toBe("a");
    expect(again.list).toHaveLength(1);
  });

  test("the default name skips a name that is taken", () => {
    expect(defaultBookmarkTitle([bm("a", 0, "Bookmark 2")])).toBe("Bookmark 3");
  });

  test("renames and removes by id; an empty name is ignored", () => {
    const list = [bm("a", 0), bm("b", 2000)];
    expect(renameBookmark(list, "b", "  Intro ")[1].title).toBe("Intro");
    expect(renameBookmark(list, "b", "   ")[1].title).toBe("b");
    expect(removeBookmark(list, "a").map((b) => b.id)).toEqual(["b"]);
  });

  test("positions on the timeline leave out bookmarks past the end", () => {
    const shares = bookmarkPositions([bm("a", 5000), bm("b", 20000)], 10);
    expect(shares.map((p) => p.share)).toEqual([0.5]);
    expect(bookmarkPositions([bm("a", 0)], 0)).toEqual([]);
  });

  test("formats positions as m:ss and h:mm:ss", () => {
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(754)).toBe("12:34");
    expect(formatClock(3725)).toBe("1:02:05");
  });
});

describe("Unit Tests - ID3 chapters", () => {
  test("a file without a tag gets one; the audio is unchanged", () => {
    const original = mp3(100);
    const written = writeChapters(original, [
      bm("x", 1200, "Intro"),
      bm("y", 400, "Start"),
    ]);
    const bytes = new Uint8Array(written);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("ID3\u0003");
    expect(bytes.subarray(written.byteLength - original.byteLength)).toEqual(
      new Uint8Array(original),
    );
    const read = readChapters(written);
    expect(read.map((b) => [b.startMs, b.title])).toEqual([
      [400, "Start"],
      [1200, "Intro"],
    ]);
    expect(audioDurationSeconds(written)).toBeCloseTo(2.4);
  });

  test("keeps the other frames and replaces earlier chapters", () => {
    const tagged = mp3(10, titleTag("My song"));
    const once = writeChapters(tagged, [bm("a", 0, "One"), bm("b", 100)]);
    const twice = writeChapters(once, [bm("c", 50, "Only")]);
    expect(readChapters(twice).map((b) => b.title)).toEqual(["Only"]);
    const latin = Buffer.from(twice).toString("latin1");
    expect(latin).toContain("My song");
    expect(latin.split("CHAP")).toHaveLength(2);
    expect(latin.split("CTOC")).toHaveLength(2);
  });

  test("removing every bookmark leaves the other frames", () => {
    const tagged = writeChapters(mp3(5, titleTag("Kept")), [bm("a", 0)]);
    const cleared = writeChapters(tagged, []);
    expect(readChapters(cleared)).toEqual([]);
    expect(Buffer.from(cleared).toString("latin1")).toContain("Kept");
  });

  test("removing every bookmark from an untagged file drops the tag", () => {
    const original = mp3(5);
    const cleared = writeChapters(writeChapters(original, [bm("a", 0)]), []);
    expect(new Uint8Array(cleared)).toEqual(new Uint8Array(original));
  });

  test("names outside Latin-1 survive in ID3v2.3 (UTF-16)", () => {
    const written = writeChapters(mp3(5), [bm("a", 0, "Ärger – 東京 🎧")]);
    expect(readChapters(written)[0].title).toBe("Ärger – 東京 🎧");
  });

  test("ID3v2.4 tags stay 2.4 and use UTF-8 names", () => {
    const v24 = titleTag("Song");
    v24[3] = 4;
    const written = writeChapters(mp3(5, v24), [bm("a", 24, "Größe 東")]);
    expect(new Uint8Array(written)[3]).toBe(4);
    expect(readChapters(written)[0]).toMatchObject({
      startMs: 24,
      title: "Größe 東",
    });
  });

  test("a reading with a header per chunk is repaired on the way", () => {
    // Two chunks, each with its own Xing header frame (joined byte-wise).
    const xing = (frames: number) => {
      const bytes = new Uint8Array(mp3(frames + 1));
      bytes.set(text("Xing"), 4 + 9);
      return [...bytes];
    };
    const broken = new Uint8Array([...xing(50), ...xing(50)]).buffer;
    const written = writeChapters(broken, [bm("a", 1500, "Late")]);
    const latin = Buffer.from(written).toString("latin1");
    expect(latin.split("Xing")).toHaveLength(2);
    expect(readChapters(written)[0].title).toBe("Late");
    expect(audioDurationSeconds(written)).toBeCloseTo(2.4);
  });

  test("the last chapter ends at the end of the audio", () => {
    const written = new Uint8Array(writeChapters(mp3(100), [bm("a", 1000)]));
    // CHAP header (10 bytes), then "chp0\0", then the times.
    const at = Buffer.from(written).toString("latin1").indexOf("CHAP") + 15;
    const view = new DataView(written.buffer);
    expect(view.getUint32(at)).toBe(1000);
    expect(view.getUint32(at + 4)).toBe(2400);
  });

  test("ID3v2.2 tags are refused, reading them finds no bookmarks", () => {
    const v22 = [...text("ID3"), 2, 0, 0, 0, 0, 0, 0];
    expect(() => writeChapters(mp3(2, v22), [bm("a", 0)])).toThrow(
      UnsupportedTagError,
    );
    expect(readChapters(mp3(2, v22))).toEqual([]);
  });

  test("a file without a tag has no bookmarks", () => {
    expect(readChapters(mp3(3))).toEqual([]);
    expect(readChapters(new ArrayBuffer(0))).toEqual([]);
  });
});
