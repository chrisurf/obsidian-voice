/**
 * Starting texts for new speech profiles: a documented YAML file that lists
 * every setting, with the ones in use uncommented.
 */

import { BASE_PROFILE } from "./builtins";
import { FIELDS, PROFILE_FORMAT_VERSION, getPath } from "./schema";

/** Settings that only make sense per language, left out of "default". */
const LANGUAGE_ONLY = new Set([
  "content.codePlaceholder",
  "structure.lists.ordinals",
]);

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
 * A profile listing every setting. `values` are written as active settings;
 * every other setting is shown commented out with its built-in default.
 */
export function profileTemplate(
  key: string,
  values: Record<string, unknown> = {},
): string {
  const isDefault = key === "default";
  const lines = [
    "# Voice speech profile: how Voice reads text aloud.",
    isDefault
      ? "# Applies to every language that has no profile of its own."
      : `# Applies to notes read in "${key}".`,
    "# Remove the # in front of a setting to change it. Lines starting with #",
    "# are comments. JSON works too: Voice detects the format.",
    `voiceProfile: ${PROFILE_FORMAT_VERSION}`,
  ];
  if (!isDefault) {
    lines.push(`language: ${key}`);
  }

  let section = "";
  let group = "";
  for (const field of FIELDS) {
    if (isDefault && LANGUAGE_ONLY.has(field.path)) {
      continue;
    }
    const parts = field.path.split(".");
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
    if (field.path in values) {
      lines.push(
        `${indent}${name}: ${formatValue(values[field.path], field.kind)}${hint}`,
      );
    } else if (field.kind === "textList") {
      lines.push(`${indent}# ${name}: [${hint.replace(/^\s*#\s*/, "")}]`);
    } else {
      const fallback = getPath(BASE_PROFILE, field.path);
      lines.push(
        `${indent}# ${name}: ${formatValue(fallback, field.kind)}${hint}`,
      );
    }
  }

  lines.push(
    "",
    "# Pronunciation: what to say instead of a word, first match wins.",
    "lexicon:",
    isDefault ? "  # - match: GmbH" : "  # - match: KI",
    isDefault ? '  #   say: "Ge-Em-Be-Ha"' : '  #   say: "Ka-I"',
    "  #   caseSensitive: true   # optional, default true",
    "  #   wholeWord: true       # optional, default true",
    "",
  );
  return lines.join("\n");
}
