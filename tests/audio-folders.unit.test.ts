import {
  resolveSaveFolder,
  noteAudioPath,
  isDefaultFolder,
  toggleDefaultFolder,
  isFavoriteFolder,
  toggleFavorite,
  orderFoldersForPicker,
  suggestFreeBaseName,
} from "../src/utils/audioFolders";
import { DEFAULT_SETTINGS } from "../src/settings/VoiceSettings";

describe("Unit Tests - Custom Audio Folder", () => {
  describe("resolveSaveFolder", () => {
    test("uses the default folder when set", () => {
      expect(resolveSaveFolder("Media/Audio", "Notes")).toBe("Media/Audio");
    });

    test("falls back to the note's folder when no default", () => {
      expect(resolveSaveFolder("", "Notes")).toBe("Notes");
      expect(resolveSaveFolder("   ", "Notes")).toBe("Notes");
    });

    test("normalizes the vault root to '/'", () => {
      expect(resolveSaveFolder("", "")).toBe("/");
    });
  });

  describe("noteAudioPath", () => {
    test("points next to the note when no default folder is set", () => {
      expect(noteAudioPath("", "Notes", "My Note")).toBe("Notes/My Note.mp3");
    });

    test("uses the default folder when one is set", () => {
      expect(noteAudioPath("Media/Audio", "Notes", "My Note")).toBe(
        "Media/Audio/My Note.mp3",
      );
    });

    test("a root note with no default lands at the vault root", () => {
      expect(noteAudioPath("", "", "My Note")).toBe("My Note.mp3");
    });

    test("a default folder still applies to a root note", () => {
      expect(noteAudioPath("Media", "", "My Note")).toBe("Media/My Note.mp3");
    });
  });

  describe("default folder", () => {
    test("isDefaultFolder matches path-normalized, empty default is never a match", () => {
      expect(isDefaultFolder("Media", "Media")).toBe(true);
      expect(isDefaultFolder("/", "")).toBe(true);
      expect(isDefaultFolder("", "Media")).toBe(false);
      expect(isDefaultFolder("Media", "Other")).toBe(false);
    });

    test("toggleDefaultFolder sets when not default", () => {
      expect(toggleDefaultFolder("", "Media")).toBe("Media");
    });

    test("toggleDefaultFolder clears when already default", () => {
      expect(toggleDefaultFolder("Media", "Media")).toBe("");
    });

    test("toggleDefaultFolder replaces a different default", () => {
      expect(toggleDefaultFolder("Old", "New")).toBe("New");
    });
  });

  describe("favorites", () => {
    test("toggleFavorite adds and removes", () => {
      expect(toggleFavorite([], "Media/Audio")).toEqual(["Media/Audio"]);
      expect(toggleFavorite(["Media/Audio"], "Media/Audio")).toEqual([]);
    });

    test("isFavoriteFolder matches path-normalized", () => {
      expect(isFavoriteFolder(["/"], "")).toBe(true);
      expect(isFavoriteFolder(["Media"], "Other")).toBe(false);
    });
  });

  describe("orderFoldersForPicker", () => {
    test("default first (flagged), then favorites, then the rest sorted", () => {
      const all = ["b", "a", "Media/Audio", "c", "Podcasts"];
      const favorites = ["Podcasts", "c"];
      const result = orderFoldersForPicker(all, favorites, "Media/Audio");

      expect(result.map((f) => f.path)).toEqual([
        "Media/Audio", // default, first
        "Podcasts", // favorites, in order
        "c",
        "a", // rest, sorted
        "b",
      ]);
      expect(result[0].isDefault).toBe(true);
      expect(result[0].isFavorite).toBe(false);
      expect(result[1].isFavorite).toBe(true);
      expect(result[3].isDefault).toBe(false);
    });

    test("a folder that is both default and favorite shows once, at the top", () => {
      const result = orderFoldersForPicker(["a", "Media"], ["Media"], "Media");
      expect(result.map((f) => f.path)).toEqual(["Media", "a"]);
      expect(result[0].isDefault).toBe(true);
      expect(result[0].isFavorite).toBe(true);
    });

    test("ignores a default / favorites that no longer exist", () => {
      const result = orderFoldersForPicker(["a"], ["gone"], "missing");
      expect(result.map((f) => f.path)).toEqual(["a"]);
      expect(result[0].isDefault).toBe(false);
    });

    test("no default → plain favorites-first ordering", () => {
      const result = orderFoldersForPicker(["b", "a"], ["b"], "");
      expect(result.map((f) => f.path)).toEqual(["b", "a"]);
    });
  });

  describe("suggestFreeBaseName", () => {
    test("returns the name unchanged when it's free", () => {
      expect(suggestFreeBaseName("Note", [])).toBe("Note");
      expect(suggestFreeBaseName("Note", ["Other"])).toBe("Note");
    });

    test("appends the first free numeric suffix", () => {
      expect(suggestFreeBaseName("Note", ["Note"])).toBe("Note 1");
      expect(suggestFreeBaseName("Note", ["Note", "Note 1"])).toBe("Note 2");
    });

    test("comparison is case-insensitive", () => {
      expect(suggestFreeBaseName("Note", ["note"])).toBe("Note 1");
    });
  });

  describe("default settings", () => {
    test("default to no default folder and no favorites", () => {
      expect(DEFAULT_SETTINGS.defaultAudioFolder).toBe("");
      expect(DEFAULT_SETTINGS.favoriteAudioFolders).toEqual([]);
    });
  });
});
