/**
 * Pure helpers for the audio save-folder feature (issue #57).
 *
 * Kept free of Obsidian APIs so the folder-resolution, default-folder and
 * favorites logic can be unit-tested in isolation; the Obsidian-facing pieces
 * (the picker modal and the save orchestration) build on top of these.
 */

import { normalizeFolderPath } from "./chapters";

/**
 * Decide which folder a non-interactive save (a tap on the save button, or a
 * silent auto-save) writes to: the configured default folder when set,
 * otherwise next to the active note.
 *
 * @param defaultFolder The user's default audio folder (may be empty).
 * @param noteFolder    The active note's folder (vault-relative; "/" = root).
 */
export function resolveSaveFolder(
  defaultFolder: string,
  noteFolder: string,
): string {
  if (defaultFolder.trim() !== "") {
    return normalizeFolderPath(defaultFolder);
  }
  return normalizeFolderPath(noteFolder);
}

/**
 * Vault path of the MP3 that a save for a note would (re)use: the note's base
 * name, in the folder where saves land (the default folder when set, otherwise
 * the note's own folder). Pure string logic so the player can look the file up
 * and replay it instead of re-synthesizing when it already exists on disk.
 *
 * @param defaultFolder The user's default audio folder (may be empty).
 * @param noteFolder    The note's folder (vault-relative; "" or "/" = root).
 * @param baseName      The note's base name (no extension).
 */
export function noteAudioPath(
  defaultFolder: string,
  noteFolder: string,
  baseName: string,
): string {
  const folder = resolveSaveFolder(defaultFolder, noteFolder);
  // resolveSaveFolder reports the vault root as "/"; an empty dir keeps the
  // path from becoming "/file.mp3".
  const dir = folder === "/" ? "" : folder;
  return dir ? `${dir}/${baseName}.mp3` : `${baseName}.mp3`;
}

/**
 * Whether a folder is the current default (path-normalized comparison).
 */
export function isDefaultFolder(defaultFolder: string, path: string): boolean {
  const target = normalizeFolderPath(path);
  return (
    defaultFolder.trim() !== "" && normalizeFolderPath(defaultFolder) === target
  );
}

/**
 * Toggle a folder as the default: returns "" when it is already the default
 * (clearing it), otherwise returns the folder (replacing any previous default,
 * since only one default exists at a time).
 */
export function toggleDefaultFolder(
  defaultFolder: string,
  path: string,
): string {
  return isDefaultFolder(defaultFolder, path) ? "" : normalizeFolderPath(path);
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

/**
 * Suggest a non-colliding base name (no extension) for a folder. If `baseName`
 * is free it's returned unchanged; otherwise " 1", " 2", … is appended until a
 * free name is found. Comparison is case-insensitive to match how file systems
 * commonly treat names.
 *
 * @param baseName  Desired base name (without extension).
 * @param takenBaseNames Base names already present in the target folder.
 */
export function suggestFreeBaseName(
  baseName: string,
  takenBaseNames: string[],
): string {
  const taken = new Set(takenBaseNames.map((n) => n.toLowerCase()));
  if (!taken.has(baseName.toLowerCase())) {
    return baseName;
  }
  let i = 1;
  while (taken.has(`${baseName} ${i}`.toLowerCase())) {
    i++;
  }
  return `${baseName} ${i}`;
}

export interface PickerFolder {
  /** Vault-relative folder path ("/" for the vault root). */
  path: string;
  /** Whether the folder is starred. */
  isFavorite: boolean;
  /** Whether the folder is the current default save location. */
  isDefault: boolean;
}

/**
 * Order folders for the picker: the default folder first (highlighted), then
 * favorites (in their saved order), then the remaining folders sorted naturally
 * by path. Used when the search box is empty so the default and starred folders
 * are always within reach.
 *
 * @param allFolders    All vault folder paths.
 * @param favorites     The starred folder paths.
 * @param defaultFolder The current default folder (may be empty).
 */
export function orderFoldersForPicker(
  allFolders: string[],
  favorites: string[],
  defaultFolder: string,
): PickerFolder[] {
  const normalizedAll = [...new Set(allFolders.map(normalizeFolderPath))];
  const def =
    defaultFolder.trim() !== "" ? normalizeFolderPath(defaultFolder) : null;
  const favSet = new Set(favorites.map(normalizeFolderPath));

  const decorate = (path: string): PickerFolder => ({
    path,
    isFavorite: favSet.has(path),
    isDefault: def === path,
  });

  const result: PickerFolder[] = [];

  // Default folder first (only if it still exists in the vault).
  if (def !== null && normalizedAll.includes(def)) {
    result.push(decorate(def));
  }

  // Then favorites (excluding the default, which is already at the top).
  for (const fav of favorites.map(normalizeFolderPath)) {
    if (
      normalizedAll.includes(fav) &&
      fav !== def &&
      !result.some((r) => r.path === fav)
    ) {
      result.push(decorate(fav));
    }
  }

  // Then the rest, sorted naturally.
  const placed = new Set(result.map((r) => r.path));
  const rest = normalizedAll
    .filter((p) => !placed.has(p))
    .sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    )
    .map(decorate);

  return [...result, ...rest];
}
