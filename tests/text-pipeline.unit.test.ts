import { serializeToText } from "../src/processors/pipeline/TextSerializer";
import type { Node } from "unist";

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

describe("Unit Tests - Text Serializer (ElevenLabs plain text)", () => {
  describe("Plain text output (no pause tags)", () => {
    test("flattens headings, paragraphs and inline emphasis to words", () => {
      const tree = root([
        heading(1, [text("Title")]),
        paragraph([text("Hello "), strong([text("bold")]), text(" world.")]),
      ]);

      const result = serializeToText(tree, { pauseTags: false });

      expect(result).toContain("Title");
      expect(result).toContain("Hello");
      expect(result).toContain("bold");
      expect(result).toContain("world.");
      expect(result).not.toContain("<break");
    });

    test("adds a sentence stop after a heading without punctuation", () => {
      const tree = root([heading(2, [text("Overview")])]);
      const result = serializeToText(tree, { pauseTags: false });
      expect(result).toContain("Overview.");
    });

    test("reads code node content verbatim", () => {
      const tree = root([{ type: "code", value: "const x = 1;" }]) as Node;
      const result = serializeToText(tree, { pauseTags: false });
      expect(result).toContain("const x = 1;");
    });
  });

  describe("Natural pause tags", () => {
    test("emits <break> tags at heading and paragraph boundaries", () => {
      const tree = root([
        heading(1, [text("Heading")]),
        paragraph([text("First.")]),
        paragraph([text("Second.")]),
      ]);

      const result = serializeToText(tree, { pauseTags: true });

      expect(result).toContain('<break time="');
      expect(result).toContain("Heading");
      expect(result).toContain("First.");
      expect(result).toContain("Second.");
    });

    test("maps horizontal-rule placeholders to a longer pause", () => {
      const tree = root([
        paragraph([text("Before.")]),
        { type: "ssmlBreak", data: { time: "1s" } },
        paragraph([text("After.")]),
      ]);

      const result = serializeToText(tree, { pauseTags: true });
      // Three break tags: paragraph, rule, paragraph
      expect(
        (result.match(/<break time="/g) || []).length,
      ).toBeGreaterThanOrEqual(2);
    });

    test("keeps word spacing around inline nodes", () => {
      const tree = root([
        paragraph([text("A normal "), strong([text("bold")]), text(" word.")]),
      ]);
      const result = serializeToText(tree, { pauseTags: true });
      expect(result).toContain("A normal bold word.");
    });
  });
});
