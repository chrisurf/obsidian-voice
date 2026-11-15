/**
 * Which language a note is read in: the voice's language, unless the note's
 * frontmatter names one with `lang:` or `language:`.
 */

/** Frontmatter keys that set a note's reading language. */
export const FRONTMATTER_LANGUAGE_KEYS = ["lang", "language"];

export function readingLanguage(
  voiceLanguage: string | undefined,
  frontmatter: Record<string, unknown> | undefined,
): string {
  for (const key of FRONTMATTER_LANGUAGE_KEYS) {
    const value = frontmatter?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return voiceLanguage?.trim() || "default";
}
