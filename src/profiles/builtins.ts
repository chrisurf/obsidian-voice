/**
 * Built-in reading defaults: language-neutral values every profile builds on
 * (pauses, list numbering, what is read). Everything language-specific —
 * acronyms, abbreviations, ordinal words, the code placeholder — lives in the
 * profile files instead (Voice ships English and German ones in
 * src/profiles/defaults/), where users can see and extend it.
 */

import type { ResolvedProfile } from "./schema";

/** Settings that apply unless a profile changes them. */
export const BASE_PROFILE: ResolvedProfile = {
  language: "default",
  lexicon: [],
  acronyms: { spell: [], say: {} },
  abbreviations: {},
  content: {
    acronyms: "word",
    codeBlocks: "placeholder",
    codePlaceholder: "Code snippet.",
    urls: "skip",
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
