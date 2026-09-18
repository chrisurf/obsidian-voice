/**
 * Pure helpers for the OpenRouter provider: reading its model + per-model
 * voice catalog from the `/api/v1/models/user` endpoint and reconciling the
 * selected model/voice. Kept free of Obsidian/DOM APIs so they can be
 * unit-tested on their own.
 *
 * OpenRouter differs from a generic OpenAI-compatible server in one important
 * way: voices belong to models. Each model carries its own `supported_voices`
 * list, so picking a model changes the set of valid voices (there is no
 * server-wide voice list). These helpers capture that shape.
 */

import type { OpenRouterModel, VoiceOption } from "../settings/VoiceSettings";

/** The fixed API root for OpenRouter's `/audio/speech` and `/models` paths. */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * The models/voices endpoint: the user's subscribed models with speech output,
 * up to 500. `output_modalities=speech` narrows the huge router catalog to the
 * ~dozen TTS models relevant here.
 */
export const OPENROUTER_MODELS_PATH =
  "/models/user?limit=500&output_modalities=speech";

/** Group label for OpenRouter voices (they carry no language info). */
export const OPENROUTER_VOICE_GROUP = "OpenRouter voices";

/**
 * OpenRouter TTS models the plugin filters out of the catalog, because offering
 * them would fail in normal use:
 *
 * - PCM-only models: only accept `response_format: pcm`, never MP3. The plugin
 *   plays and saves only MP3 today.
 * - Sesame CSM: returns HTTP 400 on any real note. It silently caps input at a
 *   few hundred characters per request, far below the plugin's ~2000-char
 *   chunk size, so normal playback always errors. (An empty voice 400s too, but
 *   the request-size cap is what breaks real notes.)
 * - Orpheus 3B FT: an even tighter cap — works only for ~a dozen words.
 *
 * OpenRouter's API does not advertise these limits, so this is a curated
 * denylist (verified by probing `/audio/speech`); it grows as more broken
 * models appear. Model ids are matched exactly to avoid dropping a sibling.
 */
export const OPENROUTER_EXCLUDED_MODELS: { id: string; reason: string }[] = [
  {
    id: "google/gemini-3.1-flash-tts-preview",
    reason: "PCM-only output; the plugin plays and saves MP3",
  },
  {
    id: "sesame/csm-1b",
    reason: "rejects inputs longer than ~a few hundred characters",
  },
  {
    id: "canopylabs/orpheus-3b-0.1-ft",
    reason: "rejects inputs longer than ~a few dozen characters",
  },
];

/** Whether a model id is known to be unusable (drop it from the catalog). */
export function isOpenRouterExcluded(modelId: string): boolean {
  return OPENROUTER_EXCLUDED_MODELS.some((m) => m.id === modelId);
}

/**
 * Read OpenRouter's model catalog from `/models/user` (`{ data: [{ id, name,
 * supported_voices }] }`). `supported_voices` may be absent or null for models
 * that accept voices another way (e.g. free-form), so those models keep an
 * empty voice list and the provider falls back to the standard OpenAI voices.
 * Models without an id, duplicate ids, and excluded models are dropped.
 */
export function parseOpenRouterModels(json: unknown): OpenRouterModel[] {
  const entries = listEntries(json, ["data"]);
  const models: OpenRouterModel[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const raw = (
      typeof entry === "object" && entry !== null ? entry : {}
    ) as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id || seen.has(id) || isOpenRouterExcluded(id)) {
      continue;
    }
    seen.add(id);

    const name =
      typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id;

    const voices: VoiceOption[] = [];
    if (Array.isArray(raw.supported_voices)) {
      const seenVoices = new Set<string>();
      for (const voiceId of raw.supported_voices) {
        const vid = typeof voiceId === "string" ? voiceId.trim() : "";
        if (vid && !seenVoices.has(vid)) {
          seenVoices.add(vid);
          voices.push({
            id: vid,
            label: vid,
            lang: "",
            group: OPENROUTER_VOICE_GROUP,
          });
        }
      }
    }

    models.push({ id, name, voices });
  }

  return models;
}

/**
 * Keep the current model when OpenRouter still offers it, otherwise fall back
 * to the first listed model — so a stale choice (a model that left the
 * catalog) doesn't silently stay selected and fail on the first play.
 */
export function reconcileOpenRouterModel(
  current: string,
  catalog: OpenRouterModel[],
): string {
  const chosen = current.trim();
  if (chosen && catalog.some((m) => m.id === chosen)) {
    return chosen;
  }
  return catalog[0]?.id ?? chosen;
}

/**
 * The voices offered for a model: its own `supported_voices`, or `fallback`
 * (the standard OpenAI voices) when the model has none, so the picker is never
 * empty.
 */
export function voicesForModel(
  catalog: OpenRouterModel[],
  modelId: string,
  fallback: VoiceOption[],
): VoiceOption[] {
  const model = catalog.find((m) => m.id === modelId);
  if (model && model.voices.length > 0) {
    return model.voices;
  }
  return fallback;
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
