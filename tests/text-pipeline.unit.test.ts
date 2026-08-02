import { serializeToText } from "../src/processors/pipeline/TextSerializer";
import type { Node } from "unist";
import { ElevenLabsService } from "../src/service/ElevenLabsService";
import { OpenAiSpeechService } from "../src/service/OpenAiSpeechService";
import { MiniMaxSpeechService } from "../src/service/MiniMaxSpeechService";
import { AzureSpeechService } from "../src/service/AzureSpeechService";

// Small mdast builders (the serializer only reads `type`, `value`, `children`).
const text = (value: string) => ({ type: "text", value });
const heading = (depth: number, children: unknown[]) => ({
  type: "heading",
  depth,
  children,
});
const paragraph = (children: unknown[]) => ({ type: "paragraph", children });
const strong = (children: unknown[]) => ({ type: "strong", children });
const root = (children: unknown[]) => ({ type: "root", children }) as Node;

describe("Unit Tests - Text Serializer (pause styles)", () => {
  describe('"none" — newline boundaries only', () => {
    test("flattens headings, paragraphs and inline emphasis to words", () => {
      const tree = root([
        heading(1, [text("Title")]),
        paragraph([text("Hello "), strong([text("bold")]), text(" world.")]),
      ]);

      const result = serializeToText(tree, { pauseStyle: "none" });

      expect(result).toContain("Title");
      expect(result).toContain("Hello");
      expect(result).toContain("bold");
      expect(result).toContain("world.");
      expect(result).not.toContain("<break");
      expect(result).not.toContain("<#");
    });

    test("adds a sentence stop after a heading without punctuation", () => {
      const tree = root([heading(2, [text("Overview")])]);
      const result = serializeToText(tree, { pauseStyle: "none" });
      expect(result).toContain("Overview.");
    });

    test("defaults to 'none' when no style is given", () => {
      const tree = root([paragraph([text("A.")]), paragraph([text("B.")])]);
      const result = serializeToText(tree);
      expect(result).not.toContain("<break");
      expect(result).not.toContain("<#");
    });
  });

  describe('"break-tags" — ElevenLabs', () => {
    test("emits <break> tags at heading and paragraph boundaries", () => {
      const tree = root([
        heading(1, [text("Heading")]),
        paragraph([text("First.")]),
        paragraph([text("Second.")]),
      ]);

      const result = serializeToText(tree, { pauseStyle: "break-tags" });

      expect(result).toContain('<break time="');
      expect(result).toContain("Heading");
      expect(result).toContain("First.");
      expect(result).toContain("Second.");
      expect(result).not.toContain("<#");
    });

    test("keeps word spacing around inline nodes", () => {
      const tree = root([
        paragraph([text("A normal "), strong([text("bold")]), text(" word.")]),
      ]);
      const result = serializeToText(tree, { pauseStyle: "break-tags" });
      expect(result).toContain("A normal bold word.");
    });
  });

  describe('"minimax" — native <#x#> markers (issue #85)', () => {
    test("emits <#x#> markers, never <break> tags", () => {
      const tree = root([
        heading(1, [text("Heading")]),
        paragraph([text("First.")]),
        paragraph([text("Second.")]),
      ]);

      const result = serializeToText(tree, { pauseStyle: "minimax" });

      expect(result).toMatch(/<#[\d.]+#>/);
      // The whole point of #85: no ElevenLabs break tag reaches MiniMax.
      expect(result).not.toContain("<break");
      expect(result).toContain("Heading");
      expect(result).toContain("First.");
      expect(result).toContain("Second.");
    });

    test("never places a marker at the very start or end", () => {
      const tree = root([paragraph([text("Only paragraph.")])]);
      const result = serializeToText(tree, { pauseStyle: "minimax" });
      // A single trailing paragraph pause would be at the end → stripped.
      expect(result).toBe("Only paragraph.");
    });

    test("merges consecutive markers into one (no back-to-back pauses)", () => {
      // A rule between two paragraphs would stack paragraph + rule markers.
      const tree = root([
        paragraph([text("Before.")]),
        { type: "ssmlBreak", data: { time: "1s" } },
        paragraph([text("After.")]),
      ]);
      const result = serializeToText(tree, { pauseStyle: "minimax" });
      expect(result).not.toMatch(/<#[\d.]+#>\s*<#[\d.]+#>/);
      expect(result).toContain("Before.");
      expect(result).toContain("After.");
    });
  });
});

describe("Unit Tests - Provider pause-style declarations", () => {
  test("ElevenLabs uses break tags", () => {
    const s = new ElevenLabsService("k", "voice", "eleven_multilingual_v2", 1);
    expect(s.textPauseStyle).toBe("break-tags");
  });

  test("MiniMax uses its native markers", () => {
    const s = new MiniMaxSpeechService(
      "k",
      "g",
      "Wise_Woman",
      "speech-02-hd",
      "api.minimax.io",
      1,
    );
    expect(s.textPauseStyle).toBe("minimax");
  });

  test("OpenAI reads markup literally, so it gets no pause markup", () => {
    const s = new OpenAiSpeechService("k", "alloy", "gpt-4o-mini-tts", 1);
    expect(s.textPauseStyle).toBe("none");
  });

  test("an SSML provider defaults to none (unused)", () => {
    const s = new AzureSpeechService("k", "eastus", "en-US-JennyNeural", 1);
    expect(s.textPauseStyle).toBe("none");
  });
});
