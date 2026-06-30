/**
 * Pure helpers for building a voice picker from a provider's voice list.
 *
 * Kept free of Obsidian/DOM APIs so the mapping and language-grouping logic can
 * be unit-tested. The provider services fetch the raw list; the player view
 * renders the grouped result as <optgroup>s.
 */

import type { VoiceOption } from "../settings/VoiceSettings";

/**
 * The subset of fields the Azure `/voices/list` endpoint returns that we use.
 * (The endpoint returns more; we only read these.)
 */
export interface AzureRawVoice {
  ShortName?: string;
  DisplayName?: string;
  LocalName?: string;
  Gender?: string;
  Locale?: string;
  LocaleName?: string;
  VoiceType?: string;
  Status?: string;
}

/**
 * Map Azure's raw voice list into the plugin's VoiceOption catalog: every
 * Neural voice, labelled "<name> (<gender>)" and grouped by its language's
 * display name (e.g. "English (United States)"). Non-Neural (legacy "Standard")
 * voices are dropped — Azure has retired them and they lack SSML parity.
 *
 * @param raw The parsed JSON array from `/voices/list` (unknown-typed on input).
 */
export function mapAzureVoices(raw: unknown): VoiceOption[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const voices: VoiceOption[] = [];
  for (const entry of raw as AzureRawVoice[]) {
    const id = entry?.ShortName;
    const locale = entry?.Locale;
    if (!id || !locale || entry.VoiceType !== "Neural" || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const name = entry.DisplayName || entry.LocalName || id;
    const gender = entry.Gender ? ` (${entry.Gender})` : "";
    voices.push({
      id,
      label: `${name}${gender}`,
      lang: locale,
      group: entry.LocaleName || undefined,
    });
  }
  return voices;
}

/**
 * Friendly English name for a BCP-47 locale (e.g. "de-DE" → "German (Germany)"),
 * used to group/sort voices that don't carry an explicit `group`. Falls back to
 * the raw code if Intl.DisplayNames is unavailable or can't resolve it.
 */
export function localeDisplayName(locale: string): string {
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "language" });
    return dn.of(locale) ?? locale;
  } catch {
    return locale;
  }
}

/** A language group of voices for the picker, with its display label. */
export interface VoiceGroup {
  label: string;
  voices: VoiceOption[];
}

/**
 * Group voices by language for the picker: each group uses the voice's `group`
 * (a provider-supplied language name) when present, otherwise a friendly name
 * derived from its `lang`. Groups are sorted by label and the voices within
 * each group by their own label — both case-insensitively and naturally.
 */
export function groupVoicesByLanguage(voices: VoiceOption[]): VoiceGroup[] {
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });
  const groups = new Map<string, VoiceOption[]>();
  for (const voice of voices) {
    const label =
      voice.group && voice.group.trim()
        ? voice.group
        : localeDisplayName(voice.lang);
    const bucket = groups.get(label);
    if (bucket) {
      bucket.push(voice);
    } else {
      groups.set(label, [voice]);
    }
  }
  return [...groups.entries()]
    .map(([label, vs]) => ({
      label,
      voices: vs.slice().sort((a, b) => collator.compare(a.label, b.label)),
    }))
    .sort((a, b) => collator.compare(a.label, b.label));
}
