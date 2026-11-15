/**
 * Starting texts for speech profiles: the profiles Voice ships (English
 * default, German) and, for any other language, a documented YAML file that
 * lists every setting with examples, commented out until it is used.
 */

import { BASE_PROFILE } from "./builtins";
import { SHIPPED_PROFILES } from "./defaults";
import { replaceYamlInPlace } from "./edit";
import { FIELDS, PROFILE_FORMAT_VERSION, getPath } from "./schema";

function formatValue(value: unknown, kind: string): string {
  if (kind === "duration" && typeof value === "number") {
    return `${value}ms`;
  }
  if (typeof value === "string" && !/^[\w.%+-]+$/.test(value)) {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * The starting text for a profile. `values` (path → value) are written into
 * it, e.g. the settings carried over from before profiles existed.
 */
export function profileTemplate(
  key: string,
  values: Record<string, unknown> = {},
): string {
  let text = SHIPPED_PROFILES[key] ?? genericTemplate(key);
  for (const [path, value] of Object.entries(values)) {
    const changed = replaceYamlInPlace(text, path, value);
    if (changed === null) {
      throw new Error(`Template for "${key}" has no setting ${path}`);
    }
    text = changed;
  }
  return text;
}

/** A documented, empty profile for a language Voice ships no profile for. */
function genericTemplate(key: string): string {
  const lines = [
    "# Voice speech profile: how Voice reads text aloud.",
    `# Applies to notes read in "${key}". Settings left out come from the`,
    "# default profile. Remove the # in front of a line to use it.",
    "# JSON works too: Voice detects the format.",
    `voiceProfile: ${PROFILE_FORMAT_VERSION}`,
    `language: ${key}`,
  ];

  let section = "";
  let group = "";
  for (const field of FIELDS) {
    const parts = field.path.split(".");
    if (field.kind === "map" || field.path === "acronyms.spell") {
      continue; // written as examples below
    }
    if (parts[0] !== section) {
      section = parts[0];
      group = "";
      lines.push("", `${section}:`);
    }
    let indent = "  ";
    if (parts.length === 3) {
      if (parts[1] !== group) {
        group = parts[1];
        lines.push(`  ${group}:`);
      }
      indent = "    ";
    }
    const name = parts[parts.length - 1];
    const hint = field.options
      ? `  # ${Object.keys(field.options).join(" | ")}`
      : `  # ${field.description}`;
    const fallback = getPath(BASE_PROFILE, field.path);
    const shown =
      field.kind === "list"
        ? "First, Second, Third"
        : formatValue(fallback, field.kind);
    lines.push(`${indent}# ${name}: ${shown}${hint}`);
  }

  lines.push(
    "",
    '# Acronyms: "spell" reads them letter by letter (comma-separated);',
    '# "say" gives an acronym its own pronunciation.',
    "acronyms:",
    "  # spell: IT, API, URL",
    "  # say:",
    "  #   JSON: jay-son",
    "",
    "# Abbreviations: written form: spoken form.",
    "abbreviations:",
    "  # e.g.: for example",
    "",
    "# Pronunciation for special cases: case-insensitive, phonetic spelling.",
    "lexicon:",
    "  # - match: Obsidian",
    "  #   say: Obsidian",
    "  #   caseSensitive: false",
    "",
  );
  return lines.join("\n");
}
