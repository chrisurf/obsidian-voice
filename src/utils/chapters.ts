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
