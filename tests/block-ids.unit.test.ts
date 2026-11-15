import { removeBlockIds } from "../src/processors/pipeline/blockIds";

describe("Obsidian block IDs Unit", () => {
  it("drops a block ID at the end of a heading or paragraph (#100)", () => {
    expect(removeBlockIds("Heading 1 ^some-heading")).toBe("Heading 1");
    expect(removeBlockIds("This is some text. ^some-text")).toBe(
      "This is some text.",
    );
  });

  it("drops it at the end of every line, and on a line of its own", () => {
    expect(removeBlockIds("First line ^a1\nSecond line ^b2")).toBe(
      "First line\nSecond line",
    );
    expect(removeBlockIds("^table-id")).toBe("");
  });

  it("leaves footnotes, exponents and a caret mid-sentence alone", () => {
    expect(removeBlockIds("A claim^[a note] here.")).toBe(
      "A claim^[a note] here.",
    );
    expect(removeBlockIds("It is 2^10 bytes")).toBe("It is 2^10 bytes");
    expect(removeBlockIds("Press ^c to copy, then go on.")).toBe(
      "Press ^c to copy, then go on.",
    );
  });
});
