/**
 * Acronym handling shared by the SSML and plain-text pipelines.
 *
 * When "Spell Out Acronyms" is ON, the SSML pipeline wraps acronyms in
 * <say-as interpret-as="characters"> so they are read letter by letter. When it
 * is OFF, we title-case acronyms (NASA → Nasa) so every TTS engine reads them
 * as a word instead of spelling them out — some engines (e.g. Google) spell
 * uppercase tokens by default, so this keeps pronunciation consistent across
 * providers, matching AWS Polly's natural reading.
 */

/** Matches acronyms: runs of 2+ consecutive uppercase letters. */
export const ACRONYM_PATTERN = /\b[A-Z]{2,}\b/g;

/** Title-case a single all-caps acronym token (NASA → Nasa). */
export function toTitleCaseAcronym(word: string): string {
  return word.charAt(0) + word.slice(1).toLowerCase();
}

/**
 * Title-case every all-caps acronym in the text. The transform preserves
 * length, so callers that rely on character offsets into the string stay valid.
 */
export function titleCaseAcronyms(text: string): string {
  return text.replace(ACRONYM_PATTERN, (match) => toTitleCaseAcronym(match));
}
