/**
 * Obsidian block IDs: a "^id" at the end of a line (or on a line of its own,
 * after a list or table) marks a block for links like [[Note#^id]]. Obsidian
 * hides them when rendering, so they must never be read aloud (issue #100).
 */

// A space (or the line start), "^", then letters, digits and dashes, ending the
// line. Requiring that keeps footnotes ("^[note]") and "2^10" untouched.
const BLOCK_ID = /(?:^|[ \t]+)\^[A-Za-z0-9-]+[ \t]*$/gm;

/** Remove block IDs from text. */
export function removeBlockIds(text: string): string {
  return text.replace(BLOCK_ID, "");
}
