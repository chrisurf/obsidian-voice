/**
 * User-facing feedback for the read-aloud flow.
 *
 * Centralizes the short, friendly messages shown as Obsidian notices so the
 * wording stays consistent across providers, and maps raw thrown errors to a
 * friendly message — internal SSML/chunking details should never reach the
 * user. Kept free of Obsidian APIs so the mapping is unit-tested; the notices
 * themselves are shown by TextSpeaker.
 */

/** Shown when the play/read action runs with no note open. */
export const NO_NOTE_MESSAGE = "No note open — open a note to read it aloud.";

/** Shown when the active note has no readable text. */
export const EMPTY_NOTE_MESSAGE = "This note has no text to read.";

/** Shown when the active note can't be read from disk. */
export const READ_ERROR_MESSAGE =
  "Couldn't read the active note. Please try again.";

/** Shown when preparing the note for synthesis fails (SSML build/chunking). */
export const PREPARE_ERROR_MESSAGE =
  "Couldn't prepare this note for speech. It may contain unusual formatting — try again or simplify the note.";

/**
 * Map a raw thrown error message to a friendly, user-facing one. Internal
 * SSML/chunking details are replaced with a single readable message; already
 * user-facing provider messages (invalid credentials, network, quota) pass
 * through unchanged so they stay actionable.
 */
export function friendlySpeechError(raw: string): string {
  if (/ssml\s+(chunking|validation)|unbalanced tag/i.test(raw)) {
    return PREPARE_ERROR_MESSAGE;
  }
  return raw;
}
