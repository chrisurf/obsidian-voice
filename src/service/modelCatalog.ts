/**
 * Pure helpers for OpenAI-compatible model catalogs (custom base URL →
 * dropdown options). No Obsidian imports, unit-tested like voiceCatalog.ts.
 */

import type { ModelOption } from "../settings/VoiceSettings";

const OFFICIAL_BASE_URL = "https://api.openai.com/v1";

/**
 * Trim and strip trailing slashes; "" means the official OpenAI endpoint.
 * Typing the official URL out is treated the same as leaving it blank, so
 * official-endpoint behaviour (curated models, required key) is never lost.
 */
export function normalizeBaseUrl(url: string | undefined): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed) {
    return "";
  }
  const stripped = trimmed.replace(/\/+$/, "");
  return stripped === OFFICIAL_BASE_URL ? "" : stripped;
}

/**
 * Pick the model to use once a server's catalog is known: the current model
 * when the server offers it, otherwise the catalog's first model.
 */
export function reconcileModel(
  current: string,
  catalog: ModelOption[],
): string {
  if (catalog.some((model) => model.id === current)) {
    return current;
  }
  return catalog[0]?.id ?? current;
}

/**
 * Map an OpenAI `GET /models` body (`{ data: [{ id }] }`) into sorted,
 * deduplicated ModelOption[]; [] for anything malformed.
 */
export function mapOpenAiModels(raw: unknown): ModelOption[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }

  const data = (raw as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    return [];
  }

  const seen = new Set<string>();
  const models: ModelOption[] = [];

  for (const entry of data) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const id = (entry as { id?: unknown }).id;
    if (typeof id !== "string") {
      continue;
    }
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    models.push({ id: trimmed, label: trimmed });
  }

  models.sort((a, b) => a.id.localeCompare(b.id));
  return models;
}
