import {
  chunkSSML,
  validateChunks,
} from "../src/processors/pipeline/SSMLChunker";
import { validateSSML } from "./utils/test-helpers";

describe("Unit Tests - SSML Processing (Core Functions)", () => {
  describe("XML Character Escaping", () => {
    test("should handle escaped XML special characters in SSML", () => {
      const ssml = "<speak>Text with &amp; &lt; &gt; characters</speak>";
      expect(validateSSML(ssml)).toBe(true);
    });

    test("should validate SSML with German umlauts", () => {
      const ssml =
        "<speak>Möglichkeiten &amp; Überlegungen für Änderungen</speak>";
      expect(validateSSML(ssml)).toBe(true);
    });

    test("should validate SSML with French accented characters", () => {
      const ssml = "<speak>Café &amp; résumé avec naïveté</speak>";
      expect(validateSSML(ssml)).toBe(true);
    });
  });

  describe("SSML Structure", () => {
    test("should validate SSML with prosody tags", () => {
      const ssml = '<speak><prosody rate="medium">Bold text</prosody></speak>';
      expect(validateSSML(ssml)).toBe(true);
    });

    test("should validate SSML with break tags", () => {
      const ssml = '<speak>Text before<break time="500ms"/>text after</speak>';
      expect(validateSSML(ssml)).toBe(true);
    });

    test("should validate complex SSML with multiple elements", () => {
      const ssml =
        '<speak><p>Heading text</p><break time="800ms"/><prosody rate="fast">Fast text</prosody></speak>';
      expect(validateSSML(ssml)).toBe(true);
    });
  });
});

describe("Unit Tests - SSML Chunking", () => {
  describe("Small Content (No Chunking)", () => {
    test("should not chunk content under 2500 chars", () => {
      const smallSSML = "<speak>Short content here</speak>";
      const chunks = chunkSSML(smallSSML, 2500);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].ssml).toContain("Short content here");
      expect(chunks[0].index).toBe(0);
      expect(chunks[0].total).toBe(1);
    });

    test("should handle content exactly at threshold", () => {
      const content = "a".repeat(2485); // Just under limit with <speak> tags
      const ssml = `<speak>${content}</speak>`;
      const chunks = chunkSSML(ssml, 2500);

      expect(chunks).toHaveLength(1);
    });
  });

  describe("Large Content (Chunking Required)", () => {
    test("should chunk large content into multiple pieces", () => {
      // Create content that exceeds 2500 chars
      const largeContent = "This is a sentence. ".repeat(150); // ~3000 chars
      const ssml = `<speak>${largeContent}</speak>`;
      const chunks = chunkSSML(ssml, 2500);

      expect(chunks.length).toBeGreaterThan(1);

      // Verify each chunk is valid
      chunks.forEach((chunk, index) => {
        expect(chunk.ssml).toMatch(/^<speak>.*<\/speak>$/);
        expect(chunk.index).toBe(index);
        expect(chunk.total).toBe(chunks.length);
        expect(chunk.ssml.length).toBeLessThanOrEqual(2500 + 15); // Allow <speak> tags
      });
    });

    test("should preserve SSML structure across chunks", () => {
      const content = "<p>Paragraph 1.</p>".repeat(200); // Increased to ensure > 2500 chars
      const ssml = `<speak>${content}</speak>`;
      const chunks = chunkSSML(ssml, 2500);

      expect(chunks.length).toBeGreaterThan(1);

      // Each chunk should have balanced tags
      chunks.forEach((chunk) => {
        expect(validateSSML(chunk.ssml)).toBe(true);
      });
    });

    test("should split at natural boundaries (prosody tags)", () => {
      const prosodyContent =
        '<prosody rate="medium">Text here.</prosody>'.repeat(100); // Increased to ensure > 2500 chars
      const ssml = `<speak>${prosodyContent}</speak>`;
      const chunks = chunkSSML(ssml, 2500);

      expect(chunks.length).toBeGreaterThan(1);

      // Verify splitting happened at prosody boundaries
      chunks.forEach((chunk) => {
        expect(validateSSML(chunk.ssml)).toBe(true);
      });
    });

    test("should handle AWS Polly size limit correctly", () => {
      // Simulate a large document
      const largeDoc = "Word ".repeat(1000); // ~5000 chars
      const ssml = `<speak>${largeDoc}</speak>`;
      const chunks = chunkSSML(ssml, 2500);

      // Verify AWS Polly limit is respected
      chunks.forEach((chunk) => {
        // Each chunk should be under the text content limit
        expect(chunk.ssml.length).toBeLessThan(3000); // Conservative estimate
      });
    });
  });

  describe("Chunk Validation", () => {
    test("should validate correctly chunked SSML", () => {
      const content = "Test content. ".repeat(200);
      const ssml = `<speak>${content}</speak>`;
      const chunks = chunkSSML(ssml, 2500);

      const validation = validateChunks(chunks);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test("should detect invalid chunks without speak tags", () => {
      const invalidChunks = [
        { ssml: "Missing speak tags", index: 0, total: 1 },
      ];

      const validation = validateChunks(invalidChunks);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    test("should detect chunks exceeding size limit", () => {
      const tooLargeContent = "x".repeat(7000);
      const invalidChunks = [
        { ssml: `<speak>${tooLargeContent}</speak>`, index: 0, total: 1 },
      ];

      const validation = validateChunks(invalidChunks);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors[0]).toContain("exceeds 6000 characters");
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty content", () => {
      const emptySSML = "<speak></speak>";
      const chunks = chunkSSML(emptySSML, 2500);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].ssml).toBe("<speak></speak>");
    });

    test("should handle content with XML special characters", () => {
      const specialChars = "Text & more < test > symbols. ".repeat(100);
      const escapedContent = specialChars
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const ssml = `<speak>${escapedContent}</speak>`;
      const chunks = chunkSSML(ssml, 2500);

      chunks.forEach((chunk) => {
        expect(validateSSML(chunk.ssml)).toBe(true);
        expect(chunk.ssml).toContain("&amp;");
      });
    });

    test("should handle mixed SSML tags", () => {
      const mixedContent = `
        <p>Paragraph with <prosody rate="fast">fast speech</prosody>.</p>
        <break time="500ms"/>
        <p>Another paragraph.</p>
      `.repeat(50);
      const ssml = `<speak>${mixedContent}</speak>`;
      const chunks = chunkSSML(ssml, 2500);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk) => {
        expect(validateSSML(chunk.ssml)).toBe(true);
      });
    });
  });
});

describe("Unit Tests - Validation Helpers", () => {
  describe("SSML Validation", () => {
    test("should validate correct SSML", () => {
      const validSSML = "<speak>Hello world with &amp; symbol</speak>";
      expect(validateSSML(validSSML)).toBe(true);
    });

    test("should reject SSML with unescaped ampersand", () => {
      const invalidSSML = "<speak>Hello world with & symbol</speak>";
      expect(validateSSML(invalidSSML)).toBe(false);
    });

    test("should reject SSML without speak tags", () => {
      const invalidSSML = "Just plain text";
      expect(validateSSML(invalidSSML)).toBe(false);
    });

    test("should handle complex SSML with multiple elements", () => {
      const complexSSML =
        '<speak>Number <say-as interpret-as="number">123</say-as> &amp; break<break time="500ms"/> here</speak>';
      expect(validateSSML(complexSSML)).toBe(true);
    });
  });
});
