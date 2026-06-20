/**
 * Chapter helpers for the Voice player.
 *
 * "Chapters" are the MP3 files that live in the same folder as the active
 * note (e.g. the per-note audio the plugin exports). This module keeps the
 * pure, testable logic separate from the Obsidian view.
 */

export interface ChapterFile {
  /** Vault-relative path to the MP3 file. */
  path: string;
  /** Display name (file name without the .mp3 extension). */
  name: string;
}

export interface Mp3Folder {
  /** Vault-relative folder path ("/" for the vault root). */
  path: string;
  /** Display name (the folder's own name, "/" for the vault root). */
  name: string;
}

/**
 * Normalize a folder path so the vault root is consistently "/".
 * Obsidian reports the root folder's path as "/" but a derived empty string
 * can also occur, so we collapse both to "/".
 */
export function normalizeFolderPath(path: string): string {
  return path === "" ? "/" : path;
}

/**
 * Display name for a folder: its own name without parent folders (e.g.
 * "Projects/Audiobooks/Part 1" → "Part 1"). The vault root renders as "/".
 */
export function folderDisplayName(path: string): string {
  const normalized = normalizeFolderPath(path);
  if (normalized === "/") {
    return "/";
  }
  return normalized.split("/").pop() ?? normalized;
}

/**
 * Build the list of folders that contain at least one MP3, derived from a flat
 * list of MP3 paths. Folders are de-duplicated and sorted naturally by their
 * display name (case-insensitively), so the player's folder picker only ever
 * offers directories that actually hold audio.
 */
export function listMp3Folders(mp3Paths: string[]): Mp3Folder[] {
  const folderPaths = new Set<string>();
  for (const path of mp3Paths) {
    const slash = path.lastIndexOf("/");
    const folder = slash === -1 ? "/" : path.slice(0, slash);
    folderPaths.add(normalizeFolderPath(folder));
  }
  return [...folderPaths]
    .map((path) => ({ path, name: folderDisplayName(path) }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
}

/**
 * Display name for a chapter: the file name without folders or the .mp3
 * extension (e.g. "notes/Chapter 2.mp3" → "Chapter 2").
 */
export function chapterName(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.mp3$/i, "");
}

/**
 * Build an ordered chapter list from MP3 paths. Sorted naturally (so
 * "Chapter 2" comes before "Chapter 10") and case-insensitively.
 */
export function listChapters(mp3Paths: string[]): ChapterFile[] {
  return [...mp3Paths]
    .sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    )
    .map((path) => ({ path, name: chapterName(path) }));
}
