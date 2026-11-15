/**
 * Speech profile format, version 1.
 *
 * A speech profile tells Voice how to read text in one language: how words are
 * pronounced (lexicon), what is read at all (content) and how the structure of
 * a note sounds (pauses, list numbering, emphasis). Profiles are YAML or JSON
 * files; one per language ("de", "de-DE") plus an optional "default" that
 * applies to every language without its own file.
 *
 * FIELDS is the single description of every supported setting: its path, kind,
 * allowed values, default and label. Validation and defaults are derived from
 * it, and a settings UI can render any field from its kind alone (enum →
 * dropdown, boolean → toggle, duration → slider, ...). Fields a version of the
 * plugin does not know are kept in the file but not applied.
 */

/** The format version this plugin reads and writes. */
export const PROFILE_FORMAT_VERSION = 1;

/** One pronunciation rule: replace `match` with what should be said. */
export interface LexiconEntry {
  /** Text as written, e.g. "KI" or "z. B.". */
  match: string;
  /** What to say instead, e.g. "Ka I" or "zum Beispiel". */
  say: string;
  /** Match upper/lower case exactly (default true). */
  caseSensitive?: boolean;
  /** Only match whole words (default true). */
  wholeWord?: boolean;
  /** Phonetic spelling (IPA); kept for providers that support it later. */
  ipa?: string;
  /**
   * For abbreviations ending in a full stop ("usw."): keep a full stop after
   * the spoken words when the abbreviation ends the sentence.
   */
  keepStop?: boolean;
}

export type AcronymMode = "word" | "spell";
export type CodeBlockMode = "placeholder" | "read";
export type UrlMode = "read" | "skip";
export type AbbreviationMode = "expand" | "keep";
export type LineBreakMode = "join" | "pause";
export type ListNumbering = "ordinal" | "number" | "none";
export type ListItemEnd = "stop" | "comma" | "none";

/** A profile with every setting resolved (built-in defaults filled in). */
export interface ResolvedProfile {
  language: string;
  lexicon: LexiconEntry[];
  content: {
    acronyms: AcronymMode;
    codeBlocks: CodeBlockMode;
    codePlaceholder: string;
    urls: UrlMode;
    abbreviations: AbbreviationMode;
  };
  structure: {
    headings: { pause: number; emphasis: boolean };
    paragraphs: { pause: number; lineBreaks: LineBreakMode };
    lists: {
      numbering: ListNumbering;
      ordinals: string[];
      pause: number;
      itemEnd: ListItemEnd;
    };
    sentences: { pause: number };
  };
  emphasis: { italicRate: string; boldVolume: string };
}

/** The kinds of value a field can hold; each maps to one kind of control. */
export type FieldKind =
  | "enum" // dropdown
  | "boolean" // toggle
  | "duration" // slider, milliseconds
  | "text" // text field
  | "textList"; // multi-line text, one entry per line

export interface FieldDefinition {
  /** Dotted path in the profile, e.g. "content.acronyms". */
  path: string;
  kind: FieldKind;
  label: string;
  description: string;
  /** Allowed values for "enum", with a label each. */
  options?: Record<string, string>;
  /** Range for "duration", in milliseconds. */
  min?: number;
  max?: number;
}

export const FIELDS: FieldDefinition[] = [
  {
    path: "content.acronyms",
    kind: "enum",
    label: "Acronyms",
    description: "Read acronyms like NASA as a word, or spell them out.",
    options: { word: "Read as a word", spell: "Spell out" },
  },
  {
    path: "content.codeBlocks",
    kind: "enum",
    label: "Code blocks",
    description: "Read fenced code aloud, or say a short placeholder.",
    options: { placeholder: "Placeholder", read: "Read aloud" },
  },
  {
    path: "content.codePlaceholder",
    kind: "text",
    label: "Code placeholder",
    description: "What is said in place of a code block.",
  },
  {
    path: "content.urls",
    kind: "enum",
    label: "Website URLs",
    description: "Read web addresses, or skip them (link labels are kept).",
    options: { read: "Read", skip: "Skip" },
  },
  {
    path: "content.abbreviations",
    kind: "enum",
    label: "Abbreviations",
    description: "Expand common abbreviations (Dr., z. B.) to full words.",
    options: { expand: "Expand", keep: "Keep" },
  },
  {
    path: "structure.headings.pause",
    kind: "duration",
    label: "Pause after headings",
    description: "Silence after a top-level heading; lower levels are shorter.",
    min: 0,
    max: 3000,
  },
  {
    path: "structure.headings.emphasis",
    kind: "boolean",
    label: "Emphasize headings",
    description: "Read headings a little louder (SSML providers).",
  },
  {
    path: "structure.paragraphs.pause",
    kind: "duration",
    label: "Pause between paragraphs",
    description: "Silence between paragraphs.",
    min: 0,
    max: 3000,
  },
  {
    path: "structure.paragraphs.lineBreaks",
    kind: "enum",
    label: "Line breaks inside a paragraph",
    description:
      "Join wrapped lines into one sentence, or pause at every line break.",
    options: { join: "Join", pause: "Pause" },
  },
  {
    path: "structure.lists.numbering",
    kind: "enum",
    label: "Numbered lists",
    description: "Announce items as words (First, ...), digits, or not at all.",
    options: { ordinal: "Ordinal words", number: "Numbers", none: "Nothing" },
  },
  {
    path: "structure.lists.ordinals",
    kind: "textList",
    label: "Ordinal words",
    description: "Words for numbered list items, in order (one per line).",
  },
  {
    path: "structure.lists.pause",
    kind: "duration",
    label: "Pause between list items",
    description: "Silence between list items.",
    min: 0,
    max: 2000,
  },
  {
    path: "structure.lists.itemEnd",
    kind: "enum",
    label: "End of a list item",
    description:
      "Close items without punctuation with a full stop, a comma, or nothing.",
    options: { stop: "Full stop", comma: "Comma", none: "Nothing" },
  },
  {
    path: "structure.sentences.pause",
    kind: "duration",
    label: "Pause between sentences",
    description: "Silence between sentences (SSML providers).",
    min: 0,
    max: 2000,
  },
  {
    path: "emphasis.italicRate",
    kind: "text",
    label: "Italic speed",
    description: "Speaking rate for italic text (SSML providers), e.g. 95%.",
  },
  {
    path: "emphasis.boldVolume",
    kind: "text",
    label: "Bold volume",
    description: "Volume change for bold text (SSML providers), e.g. +2dB.",
  },
];

/** Top-level keys the format defines (anything else is kept, not applied). */
export const TOP_LEVEL_KEYS = [
  "voiceProfile",
  "language",
  "lexicon",
  "content",
  "structure",
  "emphasis",
];

/** Read a dotted path from a nested object. */
export function getPath(obj: unknown, path: string): unknown {
  let current: unknown = obj;
  for (const key of path.split(".")) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Write a dotted path into a nested object, creating parents as needed. */
export function setPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const keys = path.split(".");
  let current = obj;
  for (const key of keys.slice(0, -1)) {
    const next = current[key];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

/**
 * Parse a duration ("400ms", "0.4s" or a number of milliseconds) to
 * milliseconds, or null when it isn't one.
 */
export function parseDuration(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value !== "string") {
    return null;
  }
  const match = /^\s*(\d+(?:\.\d+)?)\s*(ms|s)?\s*$/i.exec(value);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  return Math.round(match[2]?.toLowerCase() === "s" ? amount * 1000 : amount);
}
