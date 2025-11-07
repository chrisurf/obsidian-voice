import SSMLTagger from "../src/utils/SSMLTagger";
import { RegExHelper } from "../src/utils/RegExHelper";
import { validateSSML } from "./utils/test-helpers";

describe("Unit Tests - SSML Processing", () => {
  let ssmlTagger: SSMLTagger;

  beforeEach(() => {
    ssmlTagger = new SSMLTagger();
  });

  describe("SSML Character Escaping", () => {
    test("should escape ampersand characters", () => {
      const input = "Company & Partners";
      const result = ssmlTagger.addSSMLTags(input);

      expect(result).toContain("&amp;");
      expect(result).not.toContain("Company & Partners");
      expect(validateSSML(result)).toBe(true);
    });

    test("should escape all XML special characters", () => {
      const input = "Text with & < > \" ' characters";
      const result = ssmlTagger.addSSMLTags(input);

      expect(result).toContain("&amp;");
      expect(result).toContain("&lt;");
      expect(result).toContain("&gt;");
      expect(result).toContain("&quot;");
      expect(result).toContain("&apos;");
      expect(validateSSML(result)).toBe(true);
    });

    test("should handle German umlauts and special characters", () => {
      const input = "Möglichkeiten & Überlegungen für Änderungen";
      const result = ssmlTagger.addSSMLTags(input);

      expect(result).toContain("&amp;");
      expect(result).toContain("Möglichkeiten");
      expect(result).toContain("Überlegungen");
      expect(validateSSML(result)).toBe(true);
    });

    test("should handle French accented characters", () => {
      const input = "Café & résumé avec naïveté";
      const result = ssmlTagger.addSSMLTags(input);

      expect(result).toContain("&amp;");
      expect(result).toContain("Café");
      expect(result).toContain("résumé");
      expect(validateSSML(result)).toBe(true);
    });

    test("should wrap output in speak tags", () => {
      const input = "Simple test";
      const result = ssmlTagger.addSSMLTags(input);

      expect(result).toMatch(/^<speak>.*<\/speak>$/);
      expect(validateSSML(result)).toBe(true);
    });
  });

  describe("SSML Enhancement Features", () => {
    test("should add break tags after punctuation", () => {
      const input = "First sentence. Second sentence!";
      const result = ssmlTagger.addSSMLTags(input);

      expect(result).toContain('<break time="500ms"/>');
      expect(validateSSML(result)).toBe(true);
    });

    test("should handle numbers with say-as tags", () => {
      const input = "The year is 2023";
      const result = ssmlTagger.addSSMLTags(input);

      expect(result).toContain('<say-as interpret-as="number">2023</say-as>');
      expect(validateSSML(result)).toBe(true);
    });
  });
});

describe("Unit Tests - Text Processing", () => {
  describe("RegExHelper", () => {
    test("should remove markdown special characters", () => {
      const input = "**Bold** *italic* `code` text";
      const helper = new RegExHelper(input);
      const result = helper.getcleanContent();

      // Should remove markdown formatting but preserve text
      expect(result).not.toContain("**");
      expect(result).not.toContain("*");
      expect(result).not.toContain("`");
      expect(result).toContain("Bold");
      expect(result).toContain("italic");
      expect(result).toContain("code");
    });

    test("should remove links and brackets", () => {
      const input = "Visit [our website](https://example.com) for more info.";
      const helper = new RegExHelper(input);
      const result = helper.getcleanContent();

      expect(result).not.toContain("[");
      expect(result).not.toContain("]");
      expect(result).not.toContain("(");
      expect(result).not.toContain(")");
      expect(result).toContain("our website");
      expect(result).toContain("for more info");
    });

    test("should preserve German text while removing formatting", () => {
      const input = "**Notizen & Mögliche Folgefragen (für Sie):**";
      const helper = new RegExHelper(input);
      const result = helper.getcleanContent();

      expect(result).toContain("Notizen");
      expect(result).toContain("Mögliche");
      expect(result).toContain("Folgefragen");
      // Note: "(für Sie)" is removed by removeLinks() as it removes all parentheses content
      // This is intended behavior for removing markdown links like [text](url)
      expect(result).not.toContain("für Sie"); // Parentheses content is removed
      expect(result).not.toContain("("); // Parentheses are removed
      expect(result).not.toContain(")"); // Parentheses are removed
      // Should preserve the ampersand for SSML processing
      expect(result).toContain("&");
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
