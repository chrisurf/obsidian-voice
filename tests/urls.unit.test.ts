import { mergeTextRuns, removeUrls } from "../src/processors/pipeline/urls";

describe("Skipping URLs Unit", () => {
  it("drops the address and leaves no stray space before punctuation", () => {
    expect(removeUrls("Mehr dazu unter https://example.com/docs.")).toBe(
      "Mehr dazu unter.",
    );
    expect(removeUrls("See www.example.com, then go on.")).toBe(
      "See, then go on.",
    );
  });

  it("joins the words around an address with a single space", () => {
    expect(removeUrls("unter https://example.com/docs und in der Doku")).toBe(
      "unter und in der Doku",
    );
  });

  it("keeps the spaces at the edges that separate it from a link", () => {
    expect(removeUrls("A normal ")).toBe("A normal ");
    expect(removeUrls(" link")).toBe(" link");
  });
});

describe("Merging text after skipped URLs Unit", () => {
  it("joins the texts around a dropped autolink into a tidy sentence", () => {
    const merged = mergeTextRuns([
      { type: "text", value: "Mehr dazu steht unter " },
      { type: "text", value: "" },
      { type: "text", value: "." },
      { type: "strong" },
      { type: "text", value: "  und  so ." },
    ]);
    expect(merged).toEqual([
      { type: "text", value: "Mehr dazu steht unter." },
      { type: "strong" },
      { type: "text", value: " und so." },
    ]);
  });
});
