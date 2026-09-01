import {
  buildMarkerPairs,
  removeEnclosed,
  syntaxNodeSkip,
  SKIP_ENCLOSURE_PRESETS,
} from "../src/processors/pipeline/skipMarkers";
describe("Unit Tests - removeEnclosed scanner", () => {
  test("removes ASCII parentheses and their content", () => {
    const pairs = buildMarkerPairs(["paren"], []);
    expect(removeEnclosed("Keep this (skip this) text", pairs)).toBe(
      "Keep this text",
    );
  });

  test("removes full-width Chinese parentheses", () => {
    const pairs = buildMarkerPairs(["fullwidth-paren"], []);
    expect(removeEnclosed("正文（备注）继续", pairs)).toBe("正文继续");
  });

  test("supports one level of same-pair nesting", () => {
    const pairs = buildMarkerPairs(["paren"], []);
    expect(removeEnclosed("a (b (c) d) e", pairs)).toBe("a e");
  });

  test("leaves an unmatched opener untouched (fail-safe)", () => {
    const pairs = buildMarkerPairs(["paren"], []);
    expect(removeEnclosed("half open (never closed", pairs)).toBe(
      "half open (never closed",
    );
  });

  test("handles several enabled presets in one text", () => {
    const pairs = buildMarkerPairs(["paren", "square", "fullwidth-paren"], []);
    expect(removeEnclosed("A (x) B [y] C （z） D", pairs)).toBe("A B C D");
  });

  test("removes inline Obsidian comments across newlines", () => {
    const pairs = buildMarkerPairs(["obsidian-comment"], []);
    expect(removeEnclosed("before %% hidden\nline %% after", pairs)).toBe(
      "before after",
    );
  });

  test("supports literal custom marker pairs", () => {
    const pairs = buildMarkerPairs(
      [],
      [
        { open: "((", close: "))" },
        { open: "[note]", close: "[/note]" },
      ],
    );
    expect(removeEnclosed("a ((secret)) b", pairs)).toBe("a b");
    expect(removeEnclosed("x [note]secret[/note] y", pairs)).toBe("x y");
  });

  test("empty pair list is a no-op", () => {
    expect(removeEnclosed("anything (here)", [])).toBe("anything (here)");
  });

  test("buildMarkerPairs ignores blank pairs but keeps same-delimiter pairs", () => {
    const pairs = buildMarkerPairs(
      ["square"],
      [
        { open: "  ", close: ")" },
        { open: "((", close: "" },
        { open: "**", close: "**" },
      ],
    );
    expect(pairs).toEqual([
      { open: "[", close: "]" },
      { open: "**", close: "**" },
    ]);
  });

  test("removes wiki-link style pairs at the raw-text level", () => {
    const pairs = buildMarkerPairs([], [{ open: "[[", close: "]]" }]);
    expect(removeEnclosed("before [[Page|alias]] after", pairs)).toBe(
      "before after",
    );
  });

  test("syntaxNodeSkip maps markdown delimiters to AST node types", () => {
    expect(
      syntaxNodeSkip([
        { open: "**", close: "**" },
        { open: "[[", close: "]]" },
      ]),
    ).toEqual({ strong: true, emphasis: false, inlineCode: false });
    expect(
      syntaxNodeSkip([
        { open: "*", close: "*" },
        { open: "`", close: "`" },
      ]),
    ).toEqual({ strong: false, emphasis: true, inlineCode: true });
    expect(syntaxNodeSkip([{ open: "(", close: ")" }])).toEqual({
      strong: false,
      emphasis: false,
      inlineCode: false,
    });
  });

  test("preset ids all resolve to a pair", () => {
    for (const preset of SKIP_ENCLOSURE_PRESETS) {
      expect(buildMarkerPairs([preset.id], [])).toEqual([preset.pair]);
    }
  });
});
