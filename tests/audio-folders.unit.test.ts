import {
  resolveSaveFolder,
  isFavoriteFolder,
  toggleFavorite,
  orderFoldersForPicker,
} from "../src/utils/audioFolders";
import { DEFAULT_SETTINGS } from "../src/settings/VoiceSettings";

describe("Unit Tests - Custom Audio Folder", () => {
  describe("resolveSaveFolder", () => {
    test("note mode always uses the note's folder", () => {
      expect(resolveSaveFolder("note", "Media/Audio", "Notes")).toBe("Notes");
    });

    test("note mode normalizes the vault root to '/'", () => {
      expect(resolveSaveFolder("note", "", "")).toBe("/");
    });

    test("custom mode uses the last folder when set", () => {
      expect(resolveSaveFolder("custom", "Media/Audio", "Notes")).toBe(
        "Media/Audio",
      );
    });

    test("custom mode falls back to the note folder when no last folder", () => {
      expect(resolveSaveFolder("custom", "", "Notes")).toBe("Notes");
      expect(resolveSaveFolder("custom", "   ", "Notes")).toBe("Notes");
    });
  });

  describe("favorites", () => {
    test("toggleFavorite adds a folder", () => {
      expect(toggleFavorite([], "Media/Audio")).toEqual(["Media/Audio"]);
    });

    test("toggleFavorite removes an existing folder", () => {
      expect(toggleFavorite(["Media/Audio"], "Media/Audio")).toEqual([]);
    });

    test("toggleFavorite normalizes the vault root", () => {
      expect(toggleFavorite([], "")).toEqual(["/"]);
      expect(toggleFavorite(["/"], "")).toEqual([]);
    });

    test("isFavoriteFolder matches path-normalized", () => {
      expect(isFavoriteFolder(["/"], "")).toBe(true);
      expect(isFavoriteFolder(["Media"], "Media")).toBe(true);
      expect(isFavoriteFolder(["Media"], "Other")).toBe(false);
    });
  });

  describe("orderFoldersForPicker", () => {
    test("lists favorites first, then the rest sorted naturally", () => {
      const all = ["b", "a", "Media/Audio", "c"];
      const favorites = ["Media/Audio", "c"];
      const result = orderFoldersForPicker(all, favorites);
      expect(result.map((f) => f.path)).toEqual(["Media/Audio", "c", "a", "b"]);
      expect(result[0].isFavorite).toBe(true);
      expect(result[2].isFavorite).toBe(false);
    });

    test("ignores favorites that no longer exist", () => {
      const result = orderFoldersForPicker(["a"], ["gone"]);
      expect(result.map((f) => f.path)).toEqual(["a"]);
    });

    test("de-duplicates folders", () => {
      const result = orderFoldersForPicker(["a", "a"], []);
      expect(result.map((f) => f.path)).toEqual(["a"]);
    });
  });

  describe("default settings", () => {
    test("default to saving next to the note with no favorites", () => {
      expect(DEFAULT_SETTINGS.audioSaveMode).toBe("note");
      expect(DEFAULT_SETTINGS.favoriteAudioFolders).toEqual([]);
      expect(DEFAULT_SETTINGS.lastAudioFolder).toBe("");
    });
  });
});
