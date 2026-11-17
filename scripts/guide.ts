/**
 * Builds and checks the User Guide in docs/.
 *
 * The pages and their order live in docs/guide.json. This script writes the
 * parts every page shares, between HTML-comment markers:
 *
 * - `guide:header` — the menu of all sections and the breadcrumb
 *   (User Guide › Section › Page),
 * - `guide:footer` — links to the previous and the next page,
 * - `guide:toc` (docs/README.md) — the table of contents,
 * - `guide:pages` (a section's README.md) — the pages of that section.
 *
 * Every link is absolute (github.com/…/blob/main/…, images on
 * raw.githubusercontent.com): Obsidian shows the README in the plugin details
 * and turns relative links into broken internal links, while absolute ones
 * open in the browser. `--check` fails on blocks that are out of date,
 * relative links, links to files or headings that don't exist, and images
 * nobody uses.
 *
 * `--wiki <dir>` writes the same pages as a GitHub wiki (see wikiFiles); the
 * wiki workflow publishes it on every push to main.
 *
 * Usage: npx tsx scripts/guide.ts [--check | --wiki <dir>]
 *        (npm run docs:build / docs:check / docs:wiki)
 */

import * as fs from "fs";
import * as path from "path";

interface PageConfig {
  file: string;
  title: string;
  description: string;
}

interface SectionConfig {
  dir: string;
  title: string;
  description: string;
  pages: PageConfig[];
}

interface GuideConfig {
  repo: string;
  branch: string;
  title: string;
  sections: SectionConfig[];
}

/** A page of the guide, in reading order. */
export interface GuidePage {
  /** Path inside docs/, e.g. "using-voice/bookmarks.md". */
  rel: string;
  title: string;
  description: string;
  kind: "home" | "section" | "page";
  section: SectionConfig | null;
}

export interface Guide {
  root: string;
  config: GuideConfig;
  pages: GuidePage[];
}

const BLOCKS = ["header", "footer", "toc", "pages"] as const;
type BlockName = (typeof BLOCKS)[number];

export function loadGuide(root: string): Guide {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, "docs", "guide.json"), "utf8"),
  ) as GuideConfig;
  const pages: GuidePage[] = [
    {
      rel: "README.md",
      title: config.title,
      description: "",
      kind: "home",
      section: null,
    },
  ];
  for (const section of config.sections) {
    pages.push({
      rel: `${section.dir}/README.md`,
      title: section.title,
      description: section.description,
      kind: "section",
      section,
    });
    for (const page of section.pages) {
      pages.push({
        rel: `${section.dir}/${page.file}`,
        title: page.title,
        description: page.description,
        kind: "page",
        section,
      });
    }
  }
  return { root, config, pages };
}

/** The absolute address of a file in the repository (path from the root). */
export function blobUrl(guide: Guide, repoPath: string): string {
  return `https://github.com/${guide.config.repo}/blob/${guide.config.branch}/${repoPath}`;
}

/** The absolute address of an image (path from the root). */
export function rawUrl(guide: Guide, repoPath: string): string {
  return `https://raw.githubusercontent.com/${guide.config.repo}/${guide.config.branch}/${repoPath}`;
}

const pageUrl = (guide: Guide, rel: string) => blobUrl(guide, `docs/${rel}`);

function header(guide: Guide, page: GuidePage): string {
  const home = pageUrl(guide, "README.md");
  const menu = [
    page.kind === "home"
      ? `**[🏠 ${guide.config.title}](${home})**`
      : `[🏠 ${guide.config.title}](${home})`,
    ...guide.config.sections.map((s) => {
      const link = `[${s.title}](${pageUrl(guide, `${s.dir}/README.md`)})`;
      return s === page.section ? `**${link}**` : link;
    }),
  ].join(" · ");
  const crumbs =
    page.kind === "home"
      ? [`**${guide.config.title}**`]
      : page.kind === "section"
        ? [`[${guide.config.title}](${home})`, `**${page.title}**`]
        : [
            `[${guide.config.title}](${home})`,
            `[${page.section!.title}](${pageUrl(guide, `${page.section!.dir}/README.md`)})`,
            `**${page.title}**`,
          ];
  return `${menu}\n\n📍 ${crumbs.join(" › ")}`;
}

function footer(guide: Guide, page: GuidePage): string {
  const index = guide.pages.indexOf(page);
  const prev = guide.pages[index - 1];
  const next = guide.pages[index + 1];
  const cell = (p: GuidePage | undefined, label: string, align: string) =>
    p
      ? `<td align="${align}">${label}<br><a href="${pageUrl(guide, p.rel)}"><b>${p.title}</b></a></td>`
      : `<td></td>`;
  return [
    "---",
    "",
    "<table><tr>",
    cell(prev, "← Previous", "left"),
    cell(next, "Next →", "right"),
    "</tr></table>",
  ].join("\n");
}

function toc(guide: Guide): string {
  return guide.config.sections
    .map((section) => {
      const lines = [
        `### [${section.title}](${pageUrl(guide, `${section.dir}/README.md`)})`,
        "",
        section.description,
        "",
        ...section.pages.map(
          (p) =>
            `- [${p.title}](${pageUrl(guide, `${section.dir}/${p.file}`)}) — ${p.description}`,
        ),
      ];
      return lines.join("\n");
    })
    .join("\n\n");
}

function sectionPages(guide: Guide, section: SectionConfig): string {
  return section.pages
    .map(
      (p) =>
        `- **[${p.title}](${pageUrl(guide, `${section.dir}/${p.file}`)})** — ${p.description}`,
    )
    .join("\n");
}

/** The generated blocks a page should hold. */
export function blocksFor(
  guide: Guide,
  page: GuidePage,
): Partial<Record<BlockName, string>> {
  const blocks: Partial<Record<BlockName, string>> = {
    header: header(guide, page),
    footer: footer(guide, page),
  };
  if (page.kind === "home") {
    blocks.toc = toc(guide);
  }
  if (page.kind === "section") {
    blocks.pages = sectionPages(guide, page.section!);
  }
  return blocks;
}

const markers = (name: BlockName) =>
  [`<!-- guide:${name} -->`, `<!-- /guide:${name} -->`] as const;

/**
 * The page with its generated blocks filled in. A missing header is added at
 * the top and a missing footer at the end; toc and pages blocks must be
 * placed by hand.
 */
export function applyBlocks(
  content: string,
  blocks: Partial<Record<BlockName, string>>,
): string {
  let out = content;
  for (const name of BLOCKS) {
    const body = blocks[name];
    if (body === undefined) {
      continue;
    }
    const [open, close] = markers(name);
    const block = `${open}\n\n${body}\n\n${close}`;
    const start = out.indexOf(open);
    const end = out.indexOf(close);
    if (start >= 0 && end > start) {
      out = out.slice(0, start) + block + out.slice(end + close.length);
    } else if (name === "header") {
      out = `${block}\n\n${out}`;
    } else if (name === "footer") {
      out = `${out.trimEnd()}\n\n${block}\n`;
    }
  }
  return out;
}

/** Write the generated blocks into every page. Returns the pages changed. */
export function buildGuide(guide: Guide): string[] {
  const changed: string[] = [];
  for (const page of guide.pages) {
    const file = path.join(guide.root, "docs", page.rel);
    const content = fs.existsSync(file)
      ? fs.readFileSync(file, "utf8")
      : `# ${page.title}\n`;
    const next = applyBlocks(content, blocksFor(guide, page));
    if (next !== content) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, next);
      changed.push(page.rel);
    }
  }
  return changed;
}

/** GitHub's anchor for a heading (duplicates get -1, -2, …). */
export function headingSlugs(markdown: string): Set<string> {
  const slugs = new Set<string>();
  const seen = new Map<string, number>();
  for (const line of stripCode(markdown).split("\n")) {
    const match = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!match) {
      continue;
    }
    const text = match[1]
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text
      .replace(/<[^>]+>/g, "")
      .replace(/[`*_~]/g, "");
    const base = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s/g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    slugs.add(count === 0 ? base : `${base}-${count}`);
  }
  return slugs;
}

function stripCode(markdown: string): string {
  return markdown
    .replace(/^(```|~~~)[\s\S]*?^\1/gm, "")
    .replace(/`[^`\n]*`/g, "");
}

/** Every link and image target in a Markdown file (Markdown and HTML). */
export function linkTargets(markdown: string): string[] {
  const text = stripCode(markdown);
  const targets: string[] = [];
  for (const m of text.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    targets.push(m[1]);
  }
  for (const m of text.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    targets.push(m[1]);
  }
  return targets;
}

/** The Markdown files the check covers: the guide plus the root pages. */
function checkedFiles(root: string): string[] {
  const files = ["README.md", "TROUBLESHOOTING.md"].filter((f) =>
    fs.existsSync(path.join(root, f)),
  );
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(root, dir), {
      withFileTypes: true,
    })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(rel);
      } else if (entry.name.endsWith(".md")) {
        files.push(rel);
      }
    }
  };
  walk("docs");
  return files;
}

/** Problems with the guide; empty when all is well. */
export function checkGuide(guide: Guide): string[] {
  const { root, config } = guide;
  const problems: string[] = [];
  const blob = `https://github.com/${config.repo}/blob/${config.branch}/`;
  const tree = `https://github.com/${config.repo}/tree/${config.branch}/`;
  const raw = `https://raw.githubusercontent.com/${config.repo}/${config.branch}/`;
  const usedImages = new Set<string>();

  // Every page exists, and its generated blocks are up to date.
  for (const page of guide.pages) {
    const file = path.join(root, "docs", page.rel);
    if (!fs.existsSync(file)) {
      problems.push(`docs/${page.rel}: missing (listed in docs/guide.json)`);
      continue;
    }
    const content = fs.readFileSync(file, "utf8");
    const blocks = blocksFor(guide, page);
    for (const name of Object.keys(blocks) as BlockName[]) {
      if (!content.includes(markers(name)[0])) {
        problems.push(`docs/${page.rel}: no ${name} block`);
      }
    }
    if (applyBlocks(content, blocks) !== content) {
      problems.push(
        `docs/${page.rel}: navigation is out of date (run npm run docs:build)`,
      );
    }
  }

  const listed = new Set(guide.pages.map((p) => `docs/${p.rel}`));
  for (const file of checkedFiles(root)) {
    if (file.startsWith("docs/") && !listed.has(file)) {
      problems.push(`${file}: not listed in docs/guide.json`);
    }
    const content = fs.readFileSync(path.join(root, file), "utf8");
    const ownSlugs = headingSlugs(content);
    for (const target of linkTargets(content)) {
      const [address, anchor] = target.split("#") as [string, string?];
      if (target.startsWith("#")) {
        if (!ownSlugs.has(target.slice(1))) {
          problems.push(`${file}: no heading for ${target}`);
        }
        continue;
      }
      if (/^(mailto|obsidian):/.test(target)) {
        continue;
      }
      if (!/^https?:\/\//.test(target)) {
        problems.push(`${file}: relative link ${target} (use an absolute one)`);
        continue;
      }
      const base = [blob, tree, raw].find((b) => address.startsWith(b));
      if (!base) {
        continue; // an external site
      }
      const repoPath = decodeURIComponent(
        address.slice(base.length).split("?")[0],
      );
      const local = path.join(root, repoPath);
      if (!fs.existsSync(local)) {
        problems.push(`${file}: links to ${repoPath}, which doesn't exist`);
        continue;
      }
      if (base === raw || /\.(png|jpe?g|gif|svg|webp)$/i.test(repoPath)) {
        usedImages.add(repoPath);
      }
      if (anchor && repoPath.endsWith(".md")) {
        const slugs = headingSlugs(fs.readFileSync(local, "utf8"));
        if (!slugs.has(anchor)) {
          problems.push(`${file}: no heading #${anchor} in ${repoPath}`);
        }
      }
    }
  }

  const images = path.join(root, "docs", "images");
  if (fs.existsSync(images)) {
    for (const name of fs.readdirSync(images)) {
      if (!usedImages.has(`docs/images/${name}`)) {
        problems.push(`docs/images/${name}: not used on any page`);
      }
    }
  }
  return problems;
}

/** A page's name in the GitHub wiki, e.g. "Speed-skipping-and-repeat". */
export function wikiName(page: GuidePage): string {
  if (page.kind === "home") {
    return "Home";
  }
  return page.title.replace(/[\\/:*?"<>|,]/g, "").replace(/\s+/g, "-");
}

/**
 * The GitHub wiki, page for page the same as docs/: Home.md and one file per
 * page (the wiki has no folders), _Sidebar.md with the table of contents
 * shown next to every page, and _Footer.md. Links to guide pages point into
 * the wiki; images and other links stay as they are.
 */
export function wikiFiles(guide: Guide): Map<string, string> {
  const { repo, branch } = guide.config;
  const wikiUrl = (page: GuidePage) =>
    `https://github.com/${repo}/wiki/${encodeURIComponent(wikiName(page))}`;
  const byRel = new Map(guide.pages.map((p) => [p.rel, p]));
  const docsBase = `https://github.com/${repo}/blob/${branch}/docs/`;
  const toWiki = (markdown: string) =>
    markdown.replace(
      new RegExp(
        `${docsBase.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}([^)\\s"#]+)`,
        "g",
      ),
      (match, rel: string) => {
        const page = byRel.get(rel);
        return page ? wikiUrl(page) : match;
      },
    );

  const files = new Map<string, string>();
  for (const page of guide.pages) {
    let content = fs.readFileSync(
      path.join(guide.root, "docs", page.rel),
      "utf8",
    );
    // The sidebar is the menu; keep the breadcrumb.
    const [open, close] = markers("header");
    const start = content.indexOf(open);
    const end = content.indexOf(close);
    if (start >= 0 && end > start) {
      const crumb = /^📍.*$/m.exec(content.slice(start, end))?.[0] ?? "";
      content = `${content.slice(0, start)}${crumb}${content.slice(end + close.length)}`;
    }
    content = content.replace(/^<!-- \/?guide:[a-z]+ -->\n?/gm, "");
    files.set(
      `${wikiName(page)}.md`,
      toWiki(content).replace(/\n{3,}/g, "\n\n"),
    );
  }

  const sidebar = [
    `**[🏠 ${guide.config.title}](${wikiUrl(guide.pages[0])})**`,
    "",
    ...guide.config.sections.flatMap((section) => {
      const index = guide.pages.find(
        (p) => p.rel === `${section.dir}/README.md`,
      )!;
      return [
        `**[${section.title}](${wikiUrl(index)})**`,
        "",
        ...section.pages.map((p) => {
          const page = byRel.get(`${section.dir}/${p.file}`)!;
          return `- [${p.title}](${wikiUrl(page)})`;
        }),
        "",
      ];
    }),
  ].join("\n");
  files.set("_Sidebar.md", sidebar);
  files.set(
    "_Footer.md",
    `📖 This wiki is generated from the [User Guide](${docsBase}README.md) in the repository — changes are made there. · [Report a problem](https://github.com/${repo}/issues)\n`,
  );
  return files;
}

/** Write the wiki into `dir` (replacing its Markdown files). */
export function buildWiki(guide: Guide, dir: string): string[] {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith(".md")) {
      fs.rmSync(path.join(dir, name));
    }
  }
  const files = wikiFiles(guide);
  for (const [name, content] of files) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return [...files.keys()];
}

if (process.argv[1]?.endsWith("guide.ts")) {
  const root = path.resolve(__dirname, "..");
  const guide = loadGuide(root);
  const wikiAt = process.argv.indexOf("--wiki");
  if (wikiAt >= 0) {
    const dir = path.resolve(process.argv[wikiAt + 1] ?? "wiki");
    const names = buildWiki(guide, dir);
    console.log(`Wrote ${names.length} wiki pages to ${dir}`);
    process.exit(0);
  }
  if (process.argv.includes("--check")) {
    const problems = checkGuide(guide);
    problems.forEach((p) => console.error(`✗ ${p}`));
    console.log(
      problems.length === 0
        ? `✓ User Guide: ${guide.pages.length} pages, all links absolute and working`
        : `${problems.length} problem(s)`,
    );
    process.exit(problems.length === 0 ? 0 : 1);
  }
  const changed = buildGuide(guide);
  console.log(
    changed.length === 0
      ? "User Guide navigation is up to date."
      : `Updated: ${changed.join(", ")}`,
  );
}
