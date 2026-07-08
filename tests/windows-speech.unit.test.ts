import {
  windowsBreakToMs,
  buildWindowsSsmlChunks,
  parseWindowsVoices,
  parseChunkLine,
  isWindowsDesktop,
} from "../src/service/WindowsSpeechService";

describe("Unit Tests - Windows native speech", () => {
  describe("windowsBreakToMs", () => {
    test("converts seconds to whole milliseconds", () => {
      expect(windowsBreakToMs("0.5s")).toBe(500);
      expect(windowsBreakToMs("2s")).toBe(2000);
      expect(windowsBreakToMs("0.35s")).toBe(350);
    });

    test("passes milliseconds through, rounding", () => {
      expect(windowsBreakToMs("400ms")).toBe(400);
      expect(windowsBreakToMs("350ms")).toBe(350);
    });

    test("falls back to 350ms for unparseable input", () => {
      expect(windowsBreakToMs("")).toBe(350);
      expect(windowsBreakToMs("nonsense")).toBe(350);
      expect(windowsBreakToMs("5")).toBe(350);
    });
  });

  describe("buildWindowsSsmlChunks", () => {
    test("wraps spoken text in an SSML <speak> with the voice language", () => {
      const [ssml] = buildWindowsSsmlChunks("Hello world.", "fr-FR");
      expect(ssml).toContain(
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="fr-FR">',
      );
      expect(ssml).toContain("Hello world.");
      expect(ssml.endsWith("</speak>")).toBe(true);
    });

    test("converts break markers into real SSML <break> tags", () => {
      const [ssml] = buildWindowsSsmlChunks(
        'Title. <break time="0.5s" /> Body.',
        "en-US",
      );
      expect(ssml).toContain('<break time="500ms"/>');
      // The literal marker must not survive to be read aloud.
      expect(ssml).not.toContain('time="0.5s"');
      expect(ssml).not.toContain("&lt;break");
    });

    test("XML-escapes special characters in the spoken text", () => {
      const [ssml] = buildWindowsSsmlChunks("Tom & Jerry: 2 < 3 > 1", "en-US");
      expect(ssml).toContain("Tom &amp; Jerry: 2 &lt; 3 &gt; 1");
    });

    test("splits long text into multiple well-formed SSML chunks", () => {
      const long = "Sentence number one is here. ".repeat(400); // ~11k chars
      const chunks = buildWindowsSsmlChunks(long, "en-US", 4000);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.startsWith("<speak")).toBe(true);
        expect(chunk.endsWith("</speak>")).toBe(true);
      }
    });

    test("never splits a break marker across a chunk boundary", () => {
      // Force many small chunks with markers throughout; every emitted break
      // must be a complete tag, never a stray fragment.
      const text = Array.from(
        { length: 50 },
        (_v, i) => `Item ${i}. <break time="0.2s" /> `,
      ).join("");
      const chunks = buildWindowsSsmlChunks(text, "en-US", 60);
      const joined = chunks.join("");
      // Real breaks only; no leftover literal markers or half-tags.
      expect(joined).toContain('<break time="200ms"/>');
      expect(joined).not.toContain('time="0.2s"');
    });
  });

  describe("parseWindowsVoices", () => {
    const raw = [
      {
        engine: "onecore",
        name: "Microsoft Hortense",
        lang: "fr-FR",
        gender: "Female",
      },
      {
        engine: "sapi",
        name: "Microsoft Zira Desktop",
        lang: "en-US",
        gender: "Female",
      },
    ];

    test("maps voices with an engine-qualified id and a friendly label", () => {
      const voices = parseWindowsVoices(raw);
      expect(voices).toContainEqual({
        id: "onecore|Microsoft Hortense",
        label: "Hortense (Female)",
        lang: "fr-FR",
      });
      expect(voices).toContainEqual({
        id: "sapi|Microsoft Zira Desktop",
        label: "Zira Desktop (Female)",
        lang: "en-US",
      });
    });

    test("defaults an unknown engine to onecore", () => {
      const [v] = parseWindowsVoices([{ name: "Some Voice", lang: "en-GB" }]);
      expect(v.id).toBe("onecore|Some Voice");
    });

    test("omits the gender suffix when unset or neutral", () => {
      const voices = parseWindowsVoices([
        { engine: "onecore", name: "A", lang: "en-US", gender: "NotSet" },
        { engine: "onecore", name: "B", lang: "en-US", gender: "Neutral" },
      ]);
      expect(voices.map((v) => v.label)).toEqual(["A", "B"]);
    });

    test("drops entries without a name and dedupes by id", () => {
      const voices = parseWindowsVoices([
        { engine: "onecore", lang: "en-US" },
        raw[0],
        raw[0],
      ]);
      expect(voices).toHaveLength(1);
      expect(voices[0].id).toBe("onecore|Microsoft Hortense");
    });

    test("accepts a single object or nullish input", () => {
      expect(parseWindowsVoices(raw[0])).toHaveLength(1);
      expect(parseWindowsVoices(null)).toEqual([]);
      expect(parseWindowsVoices(undefined)).toEqual([]);
    });

    test("falls back to en-US when a voice reports no language", () => {
      const [v] = parseWindowsVoices([{ engine: "sapi", name: "X" }]);
      expect(v.lang).toBe("en-US");
    });
  });

  describe("parseChunkLine", () => {
    test("parses a CHUNK protocol line", () => {
      expect(parseChunkLine("CHUNK 0 mp3 C:\\tmp\\chunk_0.mp3")).toEqual({
        index: 0,
        format: "mp3",
        path: "C:\\tmp\\chunk_0.mp3",
      });
    });

    test("keeps spaces in the path", () => {
      const parsed = parseChunkLine("CHUNK 2 wav C:\\my notes\\chunk_2.wav");
      expect(parsed).toEqual({
        index: 2,
        format: "wav",
        path: "C:\\my notes\\chunk_2.wav",
      });
    });

    test("returns null for non-CHUNK lines", () => {
      expect(parseChunkLine("DONE")).toBeNull();
      expect(parseChunkLine("VOICES []")).toBeNull();
      expect(parseChunkLine("")).toBeNull();
    });
  });

  describe("isWindowsDesktop", () => {
    test("returns a boolean without throwing", () => {
      expect(typeof isWindowsDesktop()).toBe("boolean");
    });
  });
});
