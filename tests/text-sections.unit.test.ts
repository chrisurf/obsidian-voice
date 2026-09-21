import { splitMarkdownByHeading } from "../src/utils/textSections";

describe("Unit Tests - splitMarkdownByHeading", () => {
  test("returns a single untitled section when there are no headings", () => {
    const sections = splitMarkdownByHeading("hello\n\nworld");
    expect(sections).toEqual([{ title: "", markdown: "hello\n\nworld" }]);
  });

  test("splits on ATX headings and keeps the heading in the body", () => {
    const markdown = [
      "preamble",
      "",
      "# One",
      "alpha",
      "",
      "## Two",
      "beta",
    ].join("\n");
    const sections = splitMarkdownByHeading(markdown);
    expect(sections.map((s) => s.title)).toEqual([
      "Introduction",
      "One",
      "Two",
    ]);
    expect(sections[1].markdown).toContain("# One");
    expect(sections[1].markdown).toContain("alpha");
    expect(sections[2].markdown).toContain("beta");
  });

  test("ignores headings inside fenced code blocks", () => {
    const markdown = ["# Real", "```", "# Fake", "```", "body"].join("\n");
    const sections = splitMarkdownByHeading(markdown);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Real");
    expect(sections[0].markdown).toContain("# Fake");
  });
});
