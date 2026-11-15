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

import { BASE_PROFILE, LANGUAGE_DATA, primaryLanguage } from "./builtins";
import {
  FIELDS,
  getPath,
  parseDuration,
  setPath,
  type LexiconEntry,
  type ResolvedProfile,
} from "./schema";

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

  const data = LANGUAGE_DATA[primaryLanguage(language)];
  if (data) {
    resolved.structure.lists.ordinals = [...data.ordinals];
    resolved.content.codePlaceholder = data.codePlaceholder;
  }

  const applicable = profileKeysFor(language)
    .map((key) => layers[key] ?? layers[key.toLowerCase()])
    .filter((layer): layer is Record<string, unknown> => !!layer);

  for (const layer of applicable) {
    for (const field of FIELDS) {
      const value = getPath(layer, field.path);
      if (value === undefined || value === null) {
        continue;
      }
      setPath(
        resolved as unknown as Record<string, unknown>,
        field.path,
        field.kind === "duration" ? parseDuration(value) : value,
      );
    }
  }

  // Lexicon: most specific profile first, then the built-in entries.
  const lexicon: LexiconEntry[] = [];
  for (const layer of [...applicable].reverse()) {
    if (Array.isArray(layer.lexicon)) {
      lexicon.push(...(layer.lexicon as LexiconEntry[]));
    }
  }
  if (data) {
    lexicon.push(...data.lexicon);
    if (resolved.content.abbreviations === "expand") {
      lexicon.push(...data.abbreviations);
    }
  }
  resolved.lexicon = lexicon;
  return resolved;
}
