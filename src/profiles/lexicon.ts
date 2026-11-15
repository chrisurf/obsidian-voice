/**
 * Apply a pronunciation lexicon to text: replace each matching word with what
 * should be said. Entries are tried in order and the first match wins; text an
 * entry has already replaced is never matched again, so rules don't cascade.
 */

import type { LexiconEntry } from "./schema";

interface Segment {
  text: string;
  /** Already replaced by an entry; not matched again. */
  done: boolean;
}

const WORD_CHAR = "[\\p{L}\\p{N}_]";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The entry as a pattern. Group 1 is the character before the match (kept),
 * group 2 the match itself. No lookbehind, which older iOS Safari lacks.
 */
function entryPattern(entry: LexiconEntry): RegExp {
  const body = escapeRegExp(entry.match);
  const wholeWord = entry.wholeWord !== false;
  // Only guard a side that starts/ends with a word character: "z. B." must
  // match before "Äpfel", but "KI" must not match inside "KIOSK".
  const before =
    wholeWord && /^[\p{L}\p{N}_]/u.test(entry.match)
      ? `(^|[^\\p{L}\\p{N}_])`
      : "()";
  const after =
    wholeWord && /[\p{L}\p{N}_]$/u.test(entry.match) ? `(?!${WORD_CHAR})` : "";
  const flags = entry.caseSensitive === false ? "giu" : "gu";
  return new RegExp(`${before}(${body})${after}`, flags);
}

/** True when a sentence ends after `rest` begins (end of text or a new sentence). */
function endsSentence(rest: string): boolean {
  return (
    /^\s*$/.test(rest) || /^\s*\n/.test(rest) || /^\s+[\p{Lu}]/u.test(rest)
  );
}

export function applyLexicon(text: string, entries: LexiconEntry[]): string {
  if (!text || entries.length === 0) {
    return text;
  }
  let segments: Segment[] = [{ text, done: false }];
  for (const entry of entries) {
    if (!entry.match) {
      continue;
    }
    const pattern = entryPattern(entry);
    const next: Segment[] = [];
    segments.forEach((segment, index) => {
      if (segment.done) {
        next.push(segment);
        return;
      }
      let last = 0;
      for (const match of segment.text.matchAll(pattern)) {
        const start = (match.index ?? 0) + match[1].length;
        if (start > last) {
          next.push({ text: segment.text.slice(last, start), done: false });
        }
        const end = start + match[2].length;
        const rest =
          segment.text.slice(end) +
          segments
            .slice(index + 1)
            .map((s) => s.text)
            .join("");
        const stop =
          entry.keepStop && entry.match.endsWith(".") && endsSentence(rest);
        next.push({ text: stop ? `${entry.say}.` : entry.say, done: true });
        last = end;
      }
      if (last < segment.text.length) {
        next.push({ text: segment.text.slice(last), done: false });
      }
    });
    segments = next;
  }
  return segments.map((s) => s.text).join("");
}
