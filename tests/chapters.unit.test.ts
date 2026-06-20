import {
  listChapters,
  chapterName,
  listMp3Folders,
  folderDisplayName,
  normalizeFolderPath,
} from "../src/utils/chapters";

describe("Unit Tests - Chapter helpers", () => {
  describe("chapterName", () => {
    test("strips the folder and the .mp3 extension", () => {
      expect(chapterName("notes/audio/Chapter 2.mp3")).toBe("Chapter 2");
    });

    test("is case-insensitive about the extension", () => {
      expect(chapterName("Intro.MP3")).toBe("Intro");
    });

    test("leaves a bare name untouched", () => {
      expect(chapterName("Summary")).toBe("Summary");
    });
  });

  describe("listChapters", () => {
    test("sorts numerically so Chapter 2 comes before Chapter 10", () => {
      const result = listChapters([
        "Chapter 10.mp3",
        "Chapter 2.mp3",
        "Chapter 1.mp3",
      ]);
      expect(result.map((c) => c.name)).toEqual([
        "Chapter 1",
        "Chapter 2",
        "Chapter 10",
      ]);
    });

    test("returns display names without extension", () => {
      const result = listChapters(["folder/Intro.mp3"]);
      expect(result).toEqual([{ path: "folder/Intro.mp3", name: "Intro" }]);
    });

    test("does not mutate the input array", () => {
      const input = ["b.mp3", "a.mp3"];
      listChapters(input);
      expect(input).toEqual(["b.mp3", "a.mp3"]);
    });

    test("handles an empty list", () => {
      expect(listChapters([])).toEqual([]);
    });
  });

  describe("normalizeFolderPath", () => {
    test("maps an empty path to the vault root", () => {
      expect(normalizeFolderPath("")).toBe("/");
    });

    test("leaves a non-empty path untouched", () => {
      expect(normalizeFolderPath("notes/audio")).toBe("notes/audio");
    });
  });

  describe("folderDisplayName", () => {
    test("returns the folder's own name", () => {
      expect(folderDisplayName("Projects/Audiobooks/Part 1")).toBe("Part 1");
    });

    test("renders the vault root as a slash", () => {
      expect(folderDisplayName("/")).toBe("/");
      expect(folderDisplayName("")).toBe("/");
    });

    test("handles a single-segment folder", () => {
      expect(folderDisplayName("audio")).toBe("audio");
    });
  });

  describe("listMp3Folders", () => {
    test("returns only folders that contain MP3s, de-duplicated", () => {
      const result = listMp3Folders([
        "notes/audio/a.mp3",
        "notes/audio/b.mp3",
        "podcasts/c.mp3",
      ]);
      expect(result).toEqual([
        { path: "notes/audio", name: "audio" },
        { path: "podcasts", name: "podcasts" },
      ]);
    });

    test("treats files in the vault root as the '/' folder", () => {
      const result = listMp3Folders(["intro.mp3"]);
      expect(result).toEqual([{ path: "/", name: "/" }]);
    });

    test("sorts folders naturally by display name", () => {
      const result = listMp3Folders([
        "Part 10/a.mp3",
        "Part 2/b.mp3",
        "Part 1/c.mp3",
      ]);
      expect(result.map((f) => f.name)).toEqual([
        "Part 1",
        "Part 2",
        "Part 10",
      ]);
    });

    test("handles an empty list", () => {
      expect(listMp3Folders([])).toEqual([]);
    });
  });
});
