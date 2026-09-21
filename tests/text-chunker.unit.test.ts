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
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  test("splits Chinese on 。！？ and never exceeds the limit", () => {
    const sentence = "这是一句用来测试分块的中文。";
    const text = sentence.repeat(40);
    const chunks = chunkPlainText(text, 80);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("").replace(/\s/g, "")).toBe(text);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(80);
    }
  });

  test("hard-splits a long Chinese paragraph with no punctuation", () => {
    const text = "汉字".repeat(200);
    const chunks = chunkPlainText(text, 50);
    expect(chunks.join("")).toBe(text);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
  });

  test("does not produce empty chunks", () => {
    const text = "Sentence one. Sentence two. Sentence three.".repeat(50);
    const chunks = chunkPlainText(text, 80);
    expect(chunks.every((c) => c.trim().length > 0)).toBe(true);
  });
});
