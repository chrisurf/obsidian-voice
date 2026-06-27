/**
 * Pure helpers for the custom audio-folder feature (issue #57).
 *
 * Kept free of Obsidian APIs so the folder-resolution and favorites logic can
 * be unit-tested in isolation; the Obsidian-facing pieces (the picker modal and
 * the save orchestration) build on top of these.
 */

import type { AudioSaveMode } from "../settings/VoiceSettings";
import { normalizeFolderPath } from "./chapters";

/**
 * Decide which folder a non-interactive save (a tap on the save button, or a
 * silent auto-save) should write to.
 *
 * - "note" mode always saves next to the active note.
 * - "custom" mode reuses the last folder the user picked; until they have
 *   picked one, it falls back to the note's folder so a save never fails.
 *
 * @param mode          The configured audio save mode.
 * @param lastAudioFolder The most recently used custom folder (may be empty).
 * @param activeFolder  The active note's folder (vault-relative; "/" = root).
 */
export function resolveSaveFolder(
  mode: AudioSaveMode,
  lastAudioFolder: string,
  activeFolder: string,
): string {
  if (mode === "custom" && lastAudioFolder.trim() !== "") {
    return normalizeFolderPath(lastAudioFolder);
  }
  return normalizeFolderPath(activeFolder);
}

/**
 * Whether a folder is in the favorites list (path-normalized comparison).
 */
export function isFavoriteFolder(favorites: string[], path: string): boolean {
  const target = normalizeFolderPath(path);
  return favorites.some((f) => normalizeFolderPath(f) === target);
}

/**
 * Add or remove a folder from the favorites list, returning a new array.
 * Comparison is path-normalized so "/" and "" never produce duplicates.
 */
export function toggleFavorite(favorites: string[], path: string): string[] {
  const target = normalizeFolderPath(path);
  if (isFavoriteFolder(favorites, path)) {
    return favorites.filter((f) => normalizeFolderPath(f) !== target);
  }
  return [...favorites, target];
}

export interface PickerFolder {
  /** Vault-relative folder path ("/" for the vault root). */
  path: string;
  /** Whether the folder is starred. */
  isFavorite: boolean;
}

/**
 * Order folders for the picker: favorites first (in their saved order), then
 * the remaining folders sorted naturally by path. Used when the search box is
 * empty so the user's starred folders are always within reach.
 *
 * @param allFolders All vault folder paths.
 * @param favorites  The starred folder paths.
 */
export function orderFoldersForPicker(
  allFolders: string[],
  favorites: string[],
): PickerFolder[] {
  const normalizedAll = [...new Set(allFolders.map(normalizeFolderPath))];
  const favSet = new Set(favorites.map(normalizeFolderPath));

  const favs = favorites
    .map(normalizeFolderPath)
    .filter((f) => normalizedAll.includes(f))
    .map((path) => ({ path, isFavorite: true }));

  const rest = normalizedAll
    .filter((p) => !favSet.has(p))
    .sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    )
    .map((path) => ({ path, isFavorite: false }));

  return [...favs, ...rest];
}
