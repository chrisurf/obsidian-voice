import {
  mapAzureVoices,
  groupVoicesByLanguage,
  localeDisplayName,
} from "../src/service/voiceCatalog";
import type { VoiceOption } from "../src/settings/VoiceSettings";

describe("Unit Tests - Voice catalog", () => {
  describe("mapAzureVoices", () => {
    const raw = [
      {
        ShortName: "en-US-JennyNeural",
        DisplayName: "Jenny",
        Gender: "Female",
        Locale: "en-US",
        LocaleName: "English (United States)",
        VoiceType: "Neural",
        Status: "GA",
      },
      {
        ShortName: "de-DE-ConradNeural",
        DisplayName: "Conrad",
        Gender: "Male",
        Locale: "de-DE",
        LocaleName: "German (Germany)",
        VoiceType: "Neural",
        Status: "GA",
      },
      {
        // Legacy non-Neural voice — must be dropped.
        ShortName: "en-US-ZiraRUS",
        DisplayName: "Zira",
        Gender: "Female",
        Locale: "en-US",
        LocaleName: "English (United States)",
        VoiceType: "Standard",
        Status: "GA",
      },
    ];

    test("maps Neural voices to VoiceOptions with label, lang and group", () => {
      const voices = mapAzureVoices(raw);
      expect(voices).toContainEqual({
        id: "en-US-JennyNeural",
        label: "Jenny (Female)",
        lang: "en-US",
        group: "English (United States)",
      });
      expect(voices).toContainEqual({
        id: "de-DE-ConradNeural",
        label: "Conrad (Male)",
        lang: "de-DE",
        group: "German (Germany)",
      });
    });

    test("drops non-Neural (legacy) voices", () => {
      const ids = mapAzureVoices(raw).map((v) => v.id);
      expect(ids).not.toContain("en-US-ZiraRUS");
      expect(ids).toHaveLength(2);
    });

    test("skips entries missing a ShortName or Locale", () => {
      const voices = mapAzureVoices([
        { DisplayName: "NoId", Gender: "Female", VoiceType: "Neural" },
        { ShortName: "x-Neural", Gender: "Male", VoiceType: "Neural" },
      ]);
      expect(voices).toHaveLength(0);
    });

    test("dedupes by ShortName", () => {
      const dup = [raw[0], raw[0]];
      expect(mapAzureVoices(dup)).toHaveLength(1);
    });

    test("returns an empty list for non-array input", () => {
      expect(mapAzureVoices(null)).toEqual([]);
      expect(mapAzureVoices(undefined)).toEqual([]);
      expect(mapAzureVoices("nope")).toEqual([]);
    });
  });

  describe("groupVoicesByLanguage", () => {
    test("groups by the provided group label and sorts groups + voices", () => {
      const voices: VoiceOption[] = [
        { id: "b", label: "Bravo", lang: "de-DE", group: "German (Germany)" },
        {
          id: "a",
          label: "Alpha",
          lang: "en-US",
          group: "English (United States)",
        },
        { id: "c", label: "Charlie", lang: "de-DE", group: "German (Germany)" },
      ];
      const groups = groupVoicesByLanguage(voices);
      expect(groups.map((g) => g.label)).toEqual([
        "English (United States)",
        "German (Germany)",
      ]);
      // German group keeps both voices, sorted by label.
      expect(groups[1].voices.map((v) => v.label)).toEqual([
        "Bravo",
        "Charlie",
      ]);
    });

    test("falls back to a language name derived from lang when no group", () => {
      const voices: VoiceOption[] = [
        { id: "x", label: "Vicki", lang: "de-DE" },
      ];
      const groups = groupVoicesByLanguage(voices);
      expect(groups).toHaveLength(1);
      // Whatever Intl resolves to, it must be a non-empty label for the group.
      expect(groups[0].label.length).toBeGreaterThan(0);
      expect(groups[0].voices[0].id).toBe("x");
    });
  });

  describe("localeDisplayName", () => {
    test("returns a non-empty label (friendly name or the raw code)", () => {
      expect(localeDisplayName("de-DE").length).toBeGreaterThan(0);
      expect(localeDisplayName("en-US").length).toBeGreaterThan(0);
    });
  });
});
