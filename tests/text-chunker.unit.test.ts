import { chunkPlainText } from "../src/service/textChunker";

describe("Unit Tests - Plain text chunker", () => {
  test("returns the text as a single chunk when under the limit", () => {
    expect(chunkPlainText("short text", 100)).toEqual(["short text"]);
  });

  test("splits on paragraph boundaries when possible", () => {
    const a = "a".repeat(40);
    const b = "b".repeat(40);
    const chunks = chunkPlainText(`${a}\n\n${b}`, 50);
    expect(chunks).toEqual([a, b]);
  });

  test("keeps every chunk within the limit", () => {
    const paragraph = "word ".repeat(300).trim(); // ~1500 chars
    const text = [paragraph, paragraph, paragraph].join("\n\n");
    const chunks = chunkPlainText(text, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1000);
    }
  });

  test("hard-splits a single oversized word run", () => {
    const text = "x".repeat(250);
    const chunks = chunkPlainText(text, 100);
    // No whitespace to break on, but it still must not lose content.
    expect(chunks.join("")).toBe(text);
  });

  test("does not produce empty chunks", () => {
    const text = "Sentence one. Sentence two. Sentence three.".repeat(50);
    const chunks = chunkPlainText(text, 80);
    expect(chunks.every((c) => c.trim().length > 0)).toBe(true);
  });

  test("takes a per-chunk limit, e.g. a small first chunk", () => {
    const sentence = "This sentence has forty characters in it. ";
    const text = sentence.repeat(20).trim();
    const chunks = chunkPlainText(text, (i) => (i === 0 ? 100 : 400));
    expect(chunks[0].length).toBeLessThanOrEqual(100);
    expect(chunks.slice(1).every((c) => c.length <= 400)).toBe(true);
    expect(chunks.length).toBe(3);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text);
  });

  test("tops up a chunk holding only a heading with the next sentences", () => {
    const paragraph = "A sentence of about thirty chars. ".repeat(10).trim();
    const chunks = chunkPlainText(`Heading\n\n${paragraph}`, 100);
    expect(chunks[0].startsWith("Heading\n\nA sentence")).toBe(true);
    expect(chunks[0].length).toBeGreaterThan(50);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
  });
});
