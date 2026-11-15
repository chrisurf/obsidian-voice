/**
 * Combine the profile layers that apply to one language into a single,
 * complete profile.
 *
 * Layers, lowest to highest precedence:
 *   built-in defaults → built-in language data → "default" profile →
 *   language profile ("de") → regional profile ("de-DE")
 * A higher layer overrides each setting it sets. Lexicon entries are combined,
 * the most specific layer first, and the first entry that matches wins.
 */

import { BASE_PROFILE } from "./builtins";
import { pairEntries, spelledAcronymEntries } from "./lexicon";
import {
  FIELDS,
  getPath,
  parseDuration,
  parseWordList,
  setPath,
  type LexiconEntry,
  type ResolvedProfile,
} from "./schema";

/** The primary language subtag: "de-DE" → "de". */
export function primaryLanguage(language: string): string {
  return language.split(/[-_]/)[0].toLowerCase();
}

/** Profile data by key: "default", "de", "de-DE", ... */
export type ProfileLayers = Record<string, Record<string, unknown>>;

/** The profile keys that apply to a language, lowest precedence first. */
export function profileKeysFor(language: string): string[] {
  const keys = ["default"];
  const primary = primaryLanguage(language);
  if (primary) {
    keys.push(primary);
  }
  if (language && language.toLowerCase() !== primary) {
    keys.push(normalizeLanguageKey(language));
  }
  return keys;
}

/** Canonical file key for a language code: "de_de" → "de-DE". */
export function normalizeLanguageKey(language: string): string {
  const trimmed = language.trim();
  if (!trimmed || trimmed.toLowerCase() === "default") {
    return "default";
  }
  const [primary, ...rest] = trimmed.split(/[-_]/);
  return [
    primary.toLowerCase(),
    ...rest.map((part) =>
      part.length === 2 ? part.toUpperCase() : part.toLowerCase(),
    ),
  ].join("-");
}

export function resolveProfile(
  language: string,
  layers: ProfileLayers,
): ResolvedProfile {
  const resolved = JSON.parse(JSON.stringify(BASE_PROFILE)) as ResolvedProfile;
  resolved.language = language || "default";

  const applicable = profileKeysFor(language)
    .map((key) => layers[key] ?? layers[key.toLowerCase()])
    .filter((layer): layer is Record<string, unknown> => !!layer);

  // Plain settings: a more specific profile overrides each one it sets.
  // Word lists and pairs are combined below instead.
  for (const layer of applicable) {
    for (const field of FIELDS) {
      const value = getPath(layer, field.path);
      if (value === undefined || value === null || field.kind === "map") {
        continue;
      }
      if (field.path === "acronyms.spell") {
        continue;
      }
      setPath(
        resolved as unknown as Record<string, unknown>,
        field.path,
        field.kind === "duration"
          ? parseDuration(value)
          : field.kind === "list"
            ? parseWordList(value)
            : value,
      );
    }
  }

  // Acronyms to spell: every applicable profile's list. Pairs ("say",
  // abbreviations): merged, the more specific profile winning on a word.
  const spell = new Set<string>();
  for (const layer of applicable) {
    parseWordList(getPath(layer, "acronyms.spell")).forEach((a) =>
      spell.add(a),
    );
    Object.assign(
      resolved.acronyms.say,
      stringPairs(getPath(layer, "acronyms.say")),
    );
    Object.assign(
      resolved.abbreviations,
      stringPairs(getPath(layer, "abbreviations")),
    );
  }
  resolved.acronyms.spell = [...spell];

  // The order rules are tried in: a profile's own lexicon (most specific
  // profile first), then acronyms with their own pronunciation, spelled
  // acronyms, and abbreviations when they are expanded.
  const lexicon: LexiconEntry[] = [];
  for (const layer of [...applicable].reverse()) {
    if (Array.isArray(layer.lexicon)) {
      lexicon.push(...(layer.lexicon as LexiconEntry[]));
    }
  }
  lexicon.push(...pairEntries(resolved.acronyms.say));
  lexicon.push(...spelledAcronymEntries(resolved.acronyms.spell));
  if (resolved.content.abbreviations === "expand") {
    lexicon.push(...pairEntries(resolved.abbreviations));
  }
  resolved.lexicon = lexicon;
  return resolved;
}

/** The string pairs of a "map" value, ignoring anything else. */
function stringPairs(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}
