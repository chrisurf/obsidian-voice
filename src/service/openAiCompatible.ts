/**
 * Pure helpers for the OpenAI-compatible provider: normalising the server URL,
 * reading model and voice lists from the many server flavours that speak
 * OpenAI's `/audio/speech` API, and merging them with the entries a user added
 * by hand. Kept free of Obsidian/DOM APIs so they can be unit-tested.
 */

import type { VoiceOption } from "../settings/VoiceSettings";

/**
 * Paths (relative to the server URL) that OpenAI-compatible servers use to
 * list their voices. There is no standard, so they are probed in order:
 * Kokoro-FastAPI (`/audio/voices`), Speaches (`/audio/speech/voices`), and
 * openai-edge-tts (`/voices`).
 */
export const VOICE_LIST_PATHS = [
  "/audio/voices",
  "/audio/speech/voices",
  "/voices",
];

/** Group label for voices the user typed in by hand. */
export const CUSTOM_VOICE_GROUP = "Added by you";

/** Group label for server voices that report no language. */
export const SERVER_VOICE_GROUP = "Server voices";

/**
 * Normalise a user-entered server URL: trim it and drop trailing slashes. The
 * path is otherwise kept exactly as typed (no `/v1` is appended), because
 * servers differ — OpenRouter lives under `/api/v1`, others have no `/v1`.
 *
 * @returns The normalised URL, or null when it is empty or not http(s).
 */
export function normalizeBaseUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/\s]+/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * Split a comma- or newline-separated list the user typed into unique,
 * non-empty entries, keeping their order.
 */
export function parseListInput(raw: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const item = part.trim();
    if (item && !seen.has(item)) {
      seen.add(item);
      items.push(item);
    }
  }
  return items;
}

/** Whether a model id looks like a text-to-speech model. */
function looksLikeSpeechModel(id: string): boolean {
  return /tts|speech|voice|audio|kokoro|piper|xtts|voxtral/i.test(id);
}

interface RawModel {
  id?: unknown;
  architecture?: { output_modalities?: unknown };
  output_modalities?: unknown;
}

/**
 * Read model ids from a `/models` response (`{ data: [{ id }] }`, the OpenAI
 * shape; also `{ models: [...] }` or a bare array of ids/objects).
 *
 * Routers such as OpenRouter list every model they offer. When the response
 * says which models produce audio (`output_modalities`), only those are kept;
 * otherwise all models are returned, speech-looking ones first.
 */
export function parseModelList(json: unknown): string[] {
  const entries = listEntries(json, ["data", "models"]);
  const models: { id: string; audio: boolean | null }[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const raw = (typeof entry === "string" ? { id: entry } : entry) as RawModel;
    const id = typeof raw?.id === "string" ? raw.id.trim() : "";
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const modalities =
      raw.architecture?.output_modalities ?? raw.output_modalities;
    const audio = Array.isArray(modalities)
      ? modalities.some((m) => /audio|speech/i.test(String(m)))
      : null;
    models.push({ id, audio });
  }

  const declared = models.some((m) => m.audio !== null);
  const kept = declared ? models.filter((m) => m.audio === true) : models;
  const collator = new Intl.Collator(undefined, { numeric: true });

  return kept
    .map((m) => m.id)
    .sort((a, b) => {
      const speechFirst =
        Number(looksLikeSpeechModel(b)) - Number(looksLikeSpeechModel(a));
      return speechFirst !== 0 ? speechFirst : collator.compare(a, b);
    });
}

interface RawVoice {
  id?: unknown;
  voice_id?: unknown;
  name?: unknown;
  ShortName?: unknown;
  label?: unknown;
  display_name?: unknown;
  language?: unknown;
  lang?: unknown;
  locale?: unknown;
  Locale?: unknown;
  gender?: unknown;
}

/**
 * Read voices from a server's voice-list response. Accepts the shapes seen in
 * the wild: a bare array of ids, `{ voices: [...] }`, `{ data: [...] }`, with
 * entries as strings or objects carrying `id`/`voice_id`/`name` and optionally
 * a language and gender.
 */
export function parseVoiceList(json: unknown): VoiceOption[] {
  const entries = listEntries(json, ["voices", "data"]);
  const voices: VoiceOption[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const raw = (
      typeof entry === "string" ? { id: entry } : entry
    ) as RawVoice | null;
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const id = firstString(raw.id, raw.voice_id, raw.ShortName, raw.name);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const name = firstString(raw.label, raw.display_name, raw.name) || id;
    const gender = firstString(raw.gender);
    const lang = firstString(raw.lang, raw.language, raw.locale, raw.Locale);
    voices.push({
      id,
      label: gender ? `${name} (${gender})` : name,
      lang,
      group: lang ? undefined : SERVER_VOICE_GROUP,
    });
  }
  return voices;
}

/**
 * The voices offered in the picker: the server's voices plus the ones the user
 * added by hand (skipping duplicates of server voices). When both are empty,
 * `fallback` is used so the picker is never empty — the standard OpenAI voices
 * work with most compatible servers.
 */
export function mergeVoiceCatalog(
  serverVoices: VoiceOption[],
  customVoiceIds: string[],
  fallback: VoiceOption[],
): VoiceOption[] {
  const known = new Set(serverVoices.map((v) => v.id));
  const custom = customVoiceIds
    .filter((id) => !known.has(id))
    .map((id) => ({ id, label: id, lang: "", group: CUSTOM_VOICE_GROUP }));
  const merged = [...serverVoices, ...custom];
  return merged.length > 0 ? merged : fallback;
}

/**
 * The models offered in the settings dropdown: the server's models, the ones
 * the user added by hand, and the currently selected model (so a saved choice
 * never silently disappears), without duplicates.
 */
export function mergeModelChoices(
  serverModels: string[],
  customModels: string[],
  current: string,
): string[] {
  const all = [...serverModels, ...customModels, current].filter(
    (id) => id.trim() !== "",
  );
  return [...new Set(all)];
}

/** The array inside a list response, looking under the given keys. */
function listEntries(json: unknown, keys: string[]): unknown[] {
  if (Array.isArray(json)) {
    return json;
  }
  if (json && typeof json === "object") {
    for (const key of keys) {
      const value = (json as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
  }
  return [];
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return "";
}
