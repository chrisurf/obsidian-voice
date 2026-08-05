import {
  mapAzureVoices,
  mapCartesiaVoices,
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

  describe("mapCartesiaVoices", () => {
    test("maps a bare array to VoiceOptions (id, name → label, language)", () => {
      const voices = mapCartesiaVoices([
        { id: "uuid-1", name: "Aria", language: "en" },
        { id: "uuid-2", name: "Lukas", language: "de", description: "warm" },
      ]);
      expect(voices).toEqual([
        { id: "uuid-1", label: "Aria", lang: "en" },
        { id: "uuid-2", label: "Lukas", lang: "de" },
      ]);
    });

    test("accepts the paginated { data: [...] } shape", () => {
      const voices = mapCartesiaVoices({
        data: [{ id: "uuid-1", name: "Aria", language: "en" }],
        has_more: false,
      });
      expect(voices).toHaveLength(1);
      expect(voices[0].id).toBe("uuid-1");
    });

    test("de-duplicates by id and skips entries without an id", () => {
      const voices = mapCartesiaVoices([
        { id: "uuid-1", name: "Aria", language: "en" },
        { id: "uuid-1", name: "Aria dup", language: "en" },
        { name: "No id", language: "en" },
      ]);
      expect(voices).toHaveLength(1);
    });

    test("falls back to the id as label and 'en' as lang when missing", () => {
      const voices = mapCartesiaVoices([{ id: "uuid-x" }]);
      expect(voices[0]).toEqual({ id: "uuid-x", label: "uuid-x", lang: "en" });
    });

    test("returns [] for non-list input", () => {
      expect(mapCartesiaVoices(null)).toEqual([]);
      expect(mapCartesiaVoices({ nope: true })).toEqual([]);
    });

    test("groups into language buckets via the picker helper", () => {
      const groups = groupVoicesByLanguage(
        mapCartesiaVoices([
          { id: "a", name: "Aria", language: "en" },
          { id: "b", name: "Lukas", language: "de" },
        ]),
      );
      const labels = groups.map((g) => g.label);
      expect(labels).toContain("English");
      expect(labels).toContain("German");
    });
  });
});
