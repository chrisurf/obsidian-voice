import {
  titleCaseAcronyms,
  toTitleCaseAcronym,
} from "../src/processors/pipeline/acronyms";

describe("Unit Tests - Acronym helpers", () => {
  describe("toTitleCaseAcronym", () => {
    test("title-cases an all-caps token", () => {
      expect(toTitleCaseAcronym("NASA")).toBe("Nasa");
      expect(toTitleCaseAcronym("FBI")).toBe("Fbi");
    });

    test("preserves the original length", () => {
      expect(toTitleCaseAcronym("API")).toHaveLength(3);
    });
  });

  describe("titleCaseAcronyms", () => {
    test("title-cases acronyms inside a sentence", () => {
      expect(titleCaseAcronyms("The NASA and FBI report")).toBe(
        "The Nasa and Fbi report",
      );
    });

    test("leaves single uppercase letters and normal words untouched", () => {
      expect(titleCaseAcronyms("A normal sentence with I")).toBe(
        "A normal sentence with I",
      );
    });

    test("does not change lowercase or mixed-case words", () => {
      expect(titleCaseAcronyms("iPhone and macOS")).toBe("iPhone and macOS");
    });

    test("preserves the overall length so offsets stay valid", () => {
      const input = "Use the API now";
      expect(titleCaseAcronyms(input)).toHaveLength(input.length);
    });
  });
});
