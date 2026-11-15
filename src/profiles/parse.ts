/**
 * Read a speech profile from text: detect JSON or YAML, check the format
 * version, migrate older versions, and validate every field against FIELDS.
 *
 * Errors make a profile unusable (it is not saved or applied); warnings are
 * informational — e.g. a field this plugin version does not know, which is kept
 * in the file but not applied.
 */

import {
  FIELDS,
  PROFILE_FORMAT_VERSION,
  TOP_LEVEL_KEYS,
  getPath,
  parseDuration,
  type FieldDefinition,
} from "./schema";

export type ProfileFormat = "json" | "yaml";

export interface ParsedProfile {
  /** The profile data (migrated to the current version), or null on errors. */
  data: Record<string, unknown> | null;
  format: ProfileFormat;
  errors: string[];
  warnings: string[];
}

/** Turns YAML text into a value; Obsidian's parseYaml in the plugin. */
export type YamlParser = (text: string) => unknown;

/**
 * Migrations from each older version to the next; run in order. Version 1 is
 * the first, so there is nothing to migrate yet.
 */
const MIGRATIONS: Record<
  number,
  (data: Record<string, unknown>) => Record<string, unknown>
> = {};

/** JSON when the text starts like a JSON object, otherwise YAML. */
export function detectFormat(text: string): ProfileFormat {
  return text.trimStart().startsWith("{") ? "json" : "yaml";
}

export function parseProfile(
  text: string,
  parseYaml: YamlParser,
): ParsedProfile {
  const format = detectFormat(text);
  const result: ParsedProfile = {
    data: null,
    format,
    errors: [],
    warnings: [],
  };

  if (!text.trim()) {
    result.errors.push("The profile is empty.");
    return result;
  }

  let raw: unknown;
  try {
    raw = format === "json" ? JSON.parse(text) : parseYaml(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    result.errors.push(
      `Not valid ${format === "json" ? "JSON" : "YAML"}: ${reason}`,
    );
    return result;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    result.errors.push("A profile must be a set of key: value settings.");
    return result;
  }
  let data = raw as Record<string, unknown>;

  const version = data.voiceProfile;
  if (version === undefined) {
    result.errors.push(
      `Missing the format version. Add "voiceProfile: ${PROFILE_FORMAT_VERSION}" at the top.`,
    );
    return result;
  }
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    result.errors.push(
      `"voiceProfile" must be a whole number such as ${PROFILE_FORMAT_VERSION}.`,
    );
    return result;
  }
  if (version > PROFILE_FORMAT_VERSION) {
    result.errors.push(
      `This profile uses format ${version}, made for a newer version of Voice (this one reads up to ${PROFILE_FORMAT_VERSION}). Update the plugin to use it.`,
    );
    return result;
  }
  for (let v = version; v < PROFILE_FORMAT_VERSION; v++) {
    data = MIGRATIONS[v](data);
  }

  for (const field of FIELDS) {
    const value = getPath(data, field.path);
    if (value !== undefined && value !== null) {
      const problem = checkField(field, value);
      if (problem) {
        result.errors.push(`${field.path}: ${problem}`);
      }
    }
  }
  result.errors.push(...checkLexicon(data.lexicon));
  if (data.language !== undefined && typeof data.language !== "string") {
    result.errors.push(
      '"language" must be a language code such as de or de-DE.',
    );
  }
  result.warnings.push(...unknownFields(data));

  if (result.errors.length === 0) {
    result.data = data;
  }
  return result;
}

/** Why a field's value is not valid, or null when it is. */
function checkField(field: FieldDefinition, value: unknown): string | null {
  switch (field.kind) {
    case "enum": {
      const allowed = Object.keys(field.options ?? {});
      return typeof value === "string" && allowed.includes(value)
        ? null
        : `use one of ${allowed.join(", ")}`;
    }
    case "boolean":
      return typeof value === "boolean" ? null : "use true or false";
    case "duration": {
      const ms = parseDuration(value);
      if (ms === null) {
        return "use a duration such as 400ms or 0.4s";
      }
      if (
        (field.min !== undefined && ms < field.min) ||
        (field.max !== undefined && ms > field.max)
      ) {
        return `use a duration between ${field.min}ms and ${field.max}ms`;
      }
      return null;
    }
    case "text":
      return typeof value === "string" ? null : "use text";
    case "textList":
      return Array.isArray(value) && value.every((v) => typeof v === "string")
        ? null
        : "use a list of words";
  }
}

function checkLexicon(lexicon: unknown): string[] {
  if (lexicon === undefined || lexicon === null) {
    return [];
  }
  if (!Array.isArray(lexicon)) {
    return ['"lexicon" must be a list of entries with "match" and "say".'];
  }
  const errors: string[] = [];
  lexicon.forEach((entry, i) => {
    const where = `lexicon entry ${i + 1}`;
    if (!entry || typeof entry !== "object") {
      errors.push(`${where}: must have "match" and "say".`);
      return;
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.match !== "string" || !e.match.trim()) {
      errors.push(`${where}: "match" must be the text to replace.`);
    }
    if (typeof e.say !== "string") {
      errors.push(`${where}: "say" must be the text to say instead.`);
    }
    for (const flag of ["caseSensitive", "wholeWord", "keepStop"]) {
      if (e[flag] !== undefined && typeof e[flag] !== "boolean") {
        errors.push(`${where}: "${flag}" must be true or false.`);
      }
    }
  });
  return errors;
}

/** Paths in the data that this version of the format does not define. */
function unknownFields(data: Record<string, unknown>): string[] {
  const known = new Set(FIELDS.map((f) => f.path));
  const prefixes = new Set(
    FIELDS.flatMap((f) =>
      f.path
        .split(".")
        .slice(0, -1)
        .map((_, i, parts) => parts.slice(0, i + 1).join(".")),
    ),
  );
  const warnings: string[] = [];
  const walk = (value: unknown, path: string) => {
    if (known.has(path) || (prefixes.has(path) && value === null)) {
      return; // a known setting, or a section whose settings are all commented out
    }
    if (prefixes.has(path) && value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        walk(child, `${path}.${key}`);
      }
      return;
    }
    warnings.push(
      `"${path}" is not supported by this version of Voice; it is kept but not applied.`,
    );
  };
  for (const [key, value] of Object.entries(data)) {
    if (TOP_LEVEL_KEYS.includes(key) && !prefixes.has(key)) {
      continue; // voiceProfile, language, lexicon
    }
    walk(value, key);
  }
  return warnings;
}
