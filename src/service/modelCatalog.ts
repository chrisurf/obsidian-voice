/**
 * Pure helpers for OpenAI-compatible model catalogs (custom base URL →
 * dropdown options). No Obsidian imports, unit-tested like voiceCatalog.ts.
 */

import type { ModelOption } from "../settings/VoiceSettings";

/**
 * Trim and strip trailing slashes; "" (blank) means the official OpenAI
 * endpoint.
 */
export function normalizeBaseUrl(url: string | undefined): string {
  const trimmed = (url ?? "").trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/\/+$/, "");
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
