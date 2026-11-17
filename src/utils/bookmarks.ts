/**
 * Bookmarks in an audio file — pure helpers, so they can be unit-tested.
 *
 * A bookmark is a named position in one MP3. They are stored in the file
 * itself as ID3v2 chapters (see id3Chapters.ts), so other players (Apple
 * Podcasts, Overcast, …) show them as chapters. The plugin calls them
 * bookmarks: "chapters" are already the files in the player's list.
 */

export interface Bookmark {
  /** Identifies the bookmark while the plugin runs (not stored in the file). */
  id: string;
  /** Position in milliseconds from the start of the audio. */
  startMs: number;
  title: string;
}

/**
 * A new bookmark this close to an existing one is the same bookmark (a double
 * tap), so it is not added twice.
 */
export const SAME_BOOKMARK_MS = 1000;

/** ID3 tables of contents hold at most 255 entries. */
export const MAX_BOOKMARKS = 255;

/** Bookmarks in playing order. */
export function sortBookmarks(list: readonly Bookmark[]): Bookmark[] {
  return [...list].sort((a, b) => a.startMs - b.startMs);
}

/**
 * The name of a new bookmark: "Bookmark N", numbered after the bookmarks the
 * file already has, skipping a name that is taken.
 */
export function defaultBookmarkTitle(list: readonly Bookmark[]): string {
  const taken = new Set(list.map((b) => b.title));
  let n = list.length + 1;
  while (taken.has(`Bookmark ${n}`)) {
    n++;
  }
  return `Bookmark ${n}`;
}

export interface AddResult {
  list: Bookmark[];
  /** The new bookmark, or the existing one at (nearly) the same position. */
  bookmark: Bookmark;
  added: boolean;
}

/**
 * Add a bookmark at `startMs`. A bookmark already within SAME_BOOKMARK_MS is
 * returned instead of adding a second one; so is the last one when the file
 * is full.
 */
export function addBookmark(
  list: readonly Bookmark[],
  startMs: number,
  id: string,
): AddResult {
  const ms = Math.max(0, Math.round(startMs));
  const near = list.find((b) => Math.abs(b.startMs - ms) < SAME_BOOKMARK_MS);
  if (near) {
    return { list: sortBookmarks(list), bookmark: near, added: false };
  }
  if (list.length >= MAX_BOOKMARKS) {
    throw new Error(`An MP3 holds at most ${MAX_BOOKMARKS} bookmarks.`);
  }
  const bookmark = { id, startMs: ms, title: defaultBookmarkTitle(list) };
  return { list: sortBookmarks([...list, bookmark]), bookmark, added: true };
}

/** Rename a bookmark; an empty name keeps the old one. */
export function renameBookmark(
  list: readonly Bookmark[],
  id: string,
  title: string,
): Bookmark[] {
  const name = title.trim();
  return list.map((b) => (b.id === id && name ? { ...b, title: name } : b));
}

export function removeBookmark(
  list: readonly Bookmark[],
  id: string,
): Bookmark[] {
  return list.filter((b) => b.id !== id);
}

/**
 * Where each bookmark sits on a timeline of `durationSeconds`, as a share
 * (0..1). Bookmarks past the end (the audio is still being generated) are
 * left out.
 */
export function bookmarkPositions(
  list: readonly Bookmark[],
  durationSeconds: number,
): { bookmark: Bookmark; share: number }[] {
  if (!(durationSeconds > 0)) {
    return [];
  }
  const total = durationSeconds * 1000;
  return sortBookmarks(list)
    .filter((b) => b.startMs <= total)
    .map((bookmark) => ({ bookmark, share: bookmark.startMs / total }));
}

/** Format seconds as m:ss (or h:mm:ss for long audio). */
export function formatClock(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = `${s}`.padStart(2, "0");
  if (h > 0) {
    return `${h}:${`${m}`.padStart(2, "0")}:${ss}`;
  }
  return `${m}:${ss}`;
}
