import { TFile } from "obsidian";
import { BookmarkStore, type BookmarkHost } from "../src/utils/BookmarkStore";
import { readChapters, writeChapters } from "../src/utils/id3Chapters";

// MPEG-2 Layer III, 24 kHz mono: 144-byte frames of 24 ms each.
function mp3(frames = 500): ArrayBuffer {
  const bytes: number[] = [];
  for (let i = 0; i < frames; i++) {
    const frame = new Array<number>(144).fill(i + 1);
    frame.splice(0, 4, 0xff, 0xf3, 0x64, 0xc4);
    bytes.push(...frame);
  }
  return new Uint8Array(bytes).buffer;
}

function tfile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  file.name = path.split("/").pop() ?? path;
  file.extension = path.split(".").pop() ?? "";
  return file;
}

/** A vault of MP3s in memory, counting writes. */
function fakeApp(files: Record<string, ArrayBuffer>) {
  const writes: string[] = [];
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) =>
        path in files ? tfile(path) : null,
      readBinary: async (file: TFile) => files[file.path],
      modifyBinary: async (file: TFile, data: ArrayBuffer) => {
        files[file.path] = data;
        writes.push(file.path);
      },
    },
  };
  return { app, files, writes };
}

function fakeHost(playing = new Set<string>()) {
  let journal: Record<string, { startMs: number; title: string }[]> = {};
  const reloaded: string[] = [];
  const host: BookmarkHost = {
    getJournal: () => journal,
    setJournal: async (j) => {
      journal = j;
    },
    isPlaying: (path) => playing.has(path),
    reloadIfLoaded: (path) => reloaded.push(path),
  };
  return { host, playing, reloaded, journal: () => journal };
}

const file = (path: string) => ({ kind: "file" as const, path });

describe("Unit Tests - Bookmark store", () => {
  beforeAll(() => {
    (global as unknown as { window: unknown }).window = {
      setTimeout,
      clearTimeout,
    };
  });
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("reads the bookmarks stored in a file", async () => {
    const stored = writeChapters(mp3(), [
      { id: "x", startMs: 240, title: "Intro" },
    ]);
    const { app } = fakeApp({ "a.mp3": stored });
    const store = new BookmarkStore(app as never, fakeHost().host);
    expect(store.get(file("a.mp3"))).toBeNull(); // still reading
    const list = await store.load("a.mp3");
    expect(list.map((b) => b.title)).toEqual(["Intro"]);
    expect(store.get(file("a.mp3"))).toHaveLength(1);
  });

  test("a bookmarked file with a header per chunk is rewritten once", async () => {
    // Bookmarks written by 1.22 into a reading joined byte-wise before 1.21:
    // the tag, then two chunks that each kept their Xing header frame.
    const chunk = () => {
      const bytes = new Uint8Array(mp3(50));
      bytes.set(
        [..."Xing"].map((c) => c.charCodeAt(0)),
        4 + 9,
      );
      return [...bytes];
    };
    const tagged = new Uint8Array(
      writeChapters(mp3(1), [{ id: "x", startMs: 1500, title: "Late" }]),
    );
    const tagLength = 10 + ((tagged[8] << 7) | tagged[9]);
    const { app, files, writes } = fakeApp({
      "old.mp3": new Uint8Array([
        ...tagged.subarray(0, tagLength),
        ...chunk(),
        ...chunk(),
      ]).buffer,
      "ok.mp3": writeChapters(mp3(), [{ id: "y", startMs: 0, title: "Ok" }]),
    });
    const store = new BookmarkStore(app as never, fakeHost().host);
    await store.load("old.mp3");
    await store.load("ok.mp3");
    jest.advanceTimersByTime(2000);
    await store.flush();
    expect(writes).toEqual(["old.mp3"]);
    const latin = Buffer.from(files["old.mp3"]).toString("latin1");
    expect(latin.split("Xing")).toHaveLength(2);
    expect(readChapters(files["old.mp3"])[0].title).toBe("Late");
  });

  test("writes a moment after the last change, once", async () => {
    const { app, files, writes } = fakeApp({ "a.mp3": mp3() });
    const { host, journal } = fakeHost();
    const store = new BookmarkStore(app as never, host);
    await store.add(file("a.mp3"), 100);
    await store.add(file("a.mp3"), 6000);
    expect(journal()["a.mp3"]).toHaveLength(2);
    expect(writes).toEqual([]);
    jest.advanceTimersByTime(2000);
    await store.flush();
    expect(writes).toEqual(["a.mp3"]);
    expect(readChapters(files["a.mp3"]).map((b) => b.startMs)).toEqual([
      100, 6000,
    ]);
    expect(journal()).toEqual({});
  });

  test("never writes a file while it plays; a pause writes it", async () => {
    const { app, writes } = fakeApp({ "a.mp3": mp3() });
    const { host, playing, reloaded, journal } = fakeHost(new Set(["a.mp3"]));
    const store = new BookmarkStore(app as never, host);
    await store.add(file("a.mp3"), 100);
    jest.advanceTimersByTime(5000);
    await store.flush();
    expect(writes).toEqual([]);
    expect(journal()["a.mp3"]).toHaveLength(1);

    playing.clear();
    await store.flush();
    expect(writes).toEqual(["a.mp3"]);
    expect(reloaded).toEqual(["a.mp3"]);
  });

  test("bookmarks left unwritten are written on the next start", async () => {
    const { app, files } = fakeApp({ "a.mp3": mp3() });
    const { host } = fakeHost();
    await host.setJournal({ "a.mp3": [{ startMs: 480, title: "Kept" }] });
    const store = new BookmarkStore(app as never, host);
    expect(store.peek("a.mp3")?.map((b) => b.title)).toEqual(["Kept"]);
    await store.flush();
    expect(readChapters(files["a.mp3"])[0].title).toBe("Kept");
    expect(host.getJournal()).toEqual({});
  });

  test("renaming and removing change the file", async () => {
    const { app, files } = fakeApp({ "a.mp3": mp3() });
    const store = new BookmarkStore(app as never, fakeHost().host);
    const { bookmark } = await store.add(file("a.mp3"), 100);
    const second = await store.add(file("a.mp3"), 9000);
    await store.rename(file("a.mp3"), bookmark.id, "Start");
    await store.remove(file("a.mp3"), second.bookmark.id);
    await store.flush();
    expect(readChapters(files["a.mp3"]).map((b) => b.title)).toEqual(["Start"]);
  });

  test("bookmarks follow a renamed file", async () => {
    const { app, files } = fakeApp({ "a.mp3": mp3() });
    const { host, journal } = fakeHost(new Set(["a.mp3"]));
    const store = new BookmarkStore(app as never, host);
    await store.add(file("a.mp3"), 100);
    files["b.mp3"] = files["a.mp3"];
    delete files["a.mp3"];
    store.renamed("a.mp3", "b.mp3");
    expect(Object.keys(journal())).toEqual(["b.mp3"]);
    await store.flush();
    expect(readChapters(files["b.mp3"])).toHaveLength(1);
  });

  test("a reading keeps its bookmarks until it is saved", async () => {
    const { app } = fakeApp({});
    const store = new BookmarkStore(app as never, fakeHost().host);
    const reading = {
      kind: "reading" as const,
      reading: { path: "n.md", id: 1 },
    };
    await store.add(reading, 240);
    await store.add(reading, 9600);
    expect(store.get(reading)).toHaveLength(2);
    // A new reading starts without bookmarks.
    expect(
      store.get({ kind: "reading", reading: { path: "n.md", id: 2 } }),
    ).toEqual([]);

    const blob = new Blob([mp3()]);
    const saved = await store.bytesForSave(blob, "n.mp3", reading.reading);
    expect(readChapters(saved).map((b) => b.startMs)).toEqual([240, 9600]);
    // From now on its bookmarks are the saved file's.
    expect(store.filePath(reading)).toBe("n.mp3");
    expect(store.peek("n.mp3")).toHaveLength(2);
  });

  test("audio that isn't the bookmarked reading is saved as it is", async () => {
    const { app } = fakeApp({});
    const store = new BookmarkStore(app as never, fakeHost().host);
    const bytes = mp3();
    const saved = await store.bytesForSave(new Blob([bytes]), "n.mp3", null);
    expect(new Uint8Array(saved)).toEqual(new Uint8Array(bytes));
  });
});
