import { listChapters, chapterName } from "../src/utils/chapters";

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
});
