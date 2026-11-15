/**
 * Print the text Voice would send to a plain-text provider (OpenAI-compatible)
 * for a Markdown note, using the plugin's own pipeline and speech profiles.
 *
 * Usage:
 *   npx tsx scripts/local-tts/render.ts note.md|- [--lang de-DE]
 *       [--profile de.yaml ...]   profile files on top of the shipped ones
 *                                 (src/profiles/defaults); the file name is the key
 *       [--legacy]                the pipeline without any speech profile
 */

import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import { MarkdownToTextProcessor } from "../../src/processors/MarkdownToTextProcessor";
import { parseProfile } from "../../src/profiles/parse";
import { resolveProfile, type ProfileLayers } from "../../src/profiles/resolve";
import { processorConfigFromProfile } from "../../src/profiles/processorConfig";
import { readingLanguage } from "../../src/profiles/language";

function options(name: string): string[] {
  const values: string[] = [];
  process.argv.forEach((arg, i) => {
    if (arg === name && process.argv[i + 1]) {
      values.push(process.argv[i + 1]);
    }
  });
  return values;
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error(
      "Usage: render.ts note.md [--lang de-DE] [--profile p.yaml] [--legacy]",
    );
    process.exit(2);
  }
  // "-" reads the note from stdin (used by the test page's /render endpoint).
  const markdown = fs.readFileSync(file === "-" ? 0 : file, "utf8");

  if (process.argv.includes("--legacy")) {
    const legacy = new MarkdownToTextProcessor(
      { removeCodeBlocks: true, skipUrls: false, spellOutAcronyms: false },
      { pauseStyle: "none" },
    );
    process.stdout.write(await legacy.process(markdown));
    return;
  }

  // The profiles Voice ships (as on a fresh install), then any given ones.
  const shippedDir = path.resolve(__dirname, "../../src/profiles/defaults");
  const profileFiles = [
    ...fs
      .readdirSync(shippedDir)
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => path.join(shippedDir, f)),
    ...options("--profile"),
  ];
  const layers: ProfileLayers = {};
  for (const profileFile of profileFiles) {
    const parsed = parseProfile(
      fs.readFileSync(profileFile, "utf8"),
      parseYaml,
    );
    if (!parsed.data) {
      console.error(`${profileFile}: ${parsed.errors.join("; ")}`);
      process.exit(1);
    }
    layers[path.basename(profileFile).replace(/\.(ya?ml|json)$/i, "")] =
      parsed.data;
  }
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1];
  const language = readingLanguage(
    options("--lang")[0] ?? "de-DE",
    frontmatter
      ? (parseYaml(frontmatter) as Record<string, unknown>)
      : undefined,
  );
  const profile = resolveProfile(language, layers);
  const processor = new MarkdownToTextProcessor(
    processorConfigFromProfile(profile),
    { pauseStyle: "none" },
  );
  process.stdout.write(await processor.process(markdown));
}

void main();
