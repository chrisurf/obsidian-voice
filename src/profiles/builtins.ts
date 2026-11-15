/**
 * Built-in reading defaults: the base every profile builds on, plus the
 * language data Voice ships for some languages (ordinal words, abbreviations,
 * acronyms, the code placeholder). A profile file only needs the settings it
 * wants to change.
 */

import type { LexiconEntry, ResolvedProfile } from "./schema";

/** Settings that are the same in every language unless a profile changes them. */
export const BASE_PROFILE: ResolvedProfile = {
  language: "default",
  lexicon: [],
  content: {
    acronyms: "word",
    codeBlocks: "placeholder",
    codePlaceholder: "Code snippet.",
    urls: "read",
    abbreviations: "expand",
  },
  structure: {
    headings: { pause: 800, emphasis: true },
    paragraphs: { pause: 400, lineBreaks: "join" },
    lists: { numbering: "ordinal", ordinals: [], pause: 200, itemEnd: "stop" },
    sentences: { pause: 300 },
  },
  emphasis: { italicRate: "95%", boldVolume: "+2dB" },
};

export interface LanguageData {
  ordinals: string[];
  codePlaceholder: string;
  /** Expanded only while content.abbreviations is "expand". */
  abbreviations: LexiconEntry[];
  /** Pronunciations that always apply (acronyms read the local way). */
  lexicon: LexiconEntry[];
}

/** An abbreviation entry; `keepStop` keeps a sentence's full stop. */
function abbr(match: string, say: string, keepStop = false): LexiconEntry {
  return keepStop ? { match, say, keepStop } : { match, say };
}

/** Language data by primary language subtag ("de", "en"). */
export const LANGUAGE_DATA: Record<string, LanguageData> = {
  en: {
    ordinals: [
      "First",
      "Second",
      "Third",
      "Fourth",
      "Fifth",
      "Sixth",
      "Seventh",
      "Eighth",
      "Ninth",
      "Tenth",
    ],
    codePlaceholder: "Code snippet.",
    abbreviations: [
      abbr("Dr.", "Doctor"),
      abbr("Mr.", "Mister"),
      abbr("Mrs.", "Missus"),
      abbr("Ms.", "Miss"),
      abbr("Prof.", "Professor"),
      abbr("Sr.", "Senior"),
      abbr("Jr.", "Junior"),
      abbr("etc.", "et cetera", true),
      abbr("e.g.", "for example"),
      abbr("i.e.", "that is"),
      abbr("vs.", "versus"),
    ],
    lexicon: [],
  },
  de: {
    ordinals: [
      "Erstens",
      "Zweitens",
      "Drittens",
      "Viertens",
      "Fünftens",
      "Sechstens",
      "Siebtens",
      "Achtens",
      "Neuntens",
      "Zehntens",
    ],
    codePlaceholder: "Codebeispiel.",
    abbreviations: [
      abbr("z. B.", "zum Beispiel"),
      abbr("z.B.", "zum Beispiel"),
      abbr("d. h.", "das heißt"),
      abbr("d.h.", "das heißt"),
      abbr("u. a.", "unter anderem"),
      abbr("u.a.", "unter anderem"),
      abbr("usw.", "und so weiter", true),
      abbr("etc.", "et cetera", true),
      abbr("bzw.", "beziehungsweise"),
      abbr("ca.", "circa"),
      abbr("evtl.", "eventuell"),
      abbr("ggf.", "gegebenenfalls"),
      abbr("inkl.", "inklusive"),
      abbr("vgl.", "vergleiche"),
      abbr("Nr.", "Nummer"),
      abbr("Dr.", "Doktor"),
      abbr("Prof.", "Professor"),
    ],
    // German reads these letter by letter; a plain word reading ("Ki", "Eu")
    // would otherwise sound English or wrong.
    lexicon: [
      { match: "KI", say: "Ka-I" },
      { match: "EU", say: "E-U" },
      { match: "API", say: "A-P-I" },
      { match: "URL", say: "U-R-L" },
      { match: "PDF", say: "P-D-F" },
      { match: "USA", say: "U-S-A" },
      { match: "CEO", say: "C-E-O" },
      { match: "KPI", say: "K-P-I" },
      { match: "DSGVO", say: "D-S-G-V-O" },
    ],
  },
};

/** The primary language subtag: "de-DE" → "de". */
export function primaryLanguage(language: string): string {
  return language.split(/[-_]/)[0].toLowerCase();
}
