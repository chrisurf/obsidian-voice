import * as path from "path";
import {
  applyBlocks,
  checkGuide,
  headingSlugs,
  linkTargets,
  loadGuide,
  wikiFiles,
} from "../scripts/guide";

const guide = loadGuide(path.resolve(__dirname, ".."));

describe("Unit Tests - User Guide", () => {
  test("navigation is current and every link and image works", () => {
    expect(checkGuide(guide)).toEqual([]);
  });

  test("anchors are made like GitHub's", () => {
    const slugs = headingSlugs(
      "# Cache: never pay twice\n## On iPhone, iPad and Android\n## Setup\n## Setup\n```\n# not a heading\n```",
    );
    expect([...slugs]).toEqual([
      "cache-never-pay-twice",
      "on-iphone-ipad-and-android",
      "setup",
      "setup-1",
    ]);
  });

  test("finds Markdown and HTML links, not those in code", () => {
    expect(
      linkTargets(
        '[a](https://x.y/a "t") ![b](./b.png) <a href="#c">c</a> `[d](e)`',
      ),
    ).toEqual(["https://x.y/a", "./b.png", "#c"]);
  });

  test("generated blocks are replaced, and added when missing", () => {
    const page = applyBlocks("# Title\n", { header: "menu", footer: "pager" });
    expect(page).toBe(
      "<!-- guide:header -->\n\nmenu\n\n<!-- /guide:header -->\n\n# Title\n\n<!-- guide:footer -->\n\npager\n\n<!-- /guide:footer -->\n",
    );
    expect(applyBlocks(page, { header: "new" })).toContain("\n\nnew\n\n");
  });

  test("the wiki mirrors every page, with a sidebar and wiki links", () => {
    const files = wikiFiles(guide);
    expect(files.size).toBe(guide.pages.length + 2);
    expect(files.has("Home.md")).toBe(true);
    expect(files.get("_Sidebar.md")).toContain("/wiki/Bookmarks)");
    const bookmarks = files.get("Bookmarks.md")!;
    expect(bookmarks).not.toContain("guide:header");
    expect(bookmarks).not.toMatch(/blob\/main\/docs\/[^)"]+\.md/);
    expect(bookmarks).toContain("📍");
  });
});
