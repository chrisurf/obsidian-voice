/**
 * Translate a resolved speech profile into the content pipeline's options.
 */

import type { ProcessorConfig } from "../types/ProcessorTypes";
import type { ResolvedProfile } from "./schema";

/** Heading pauses per level (h1..h6), relative to the h1 pause. */
const HEADING_LEVEL_FACTORS = [1, 0.875, 0.75, 0.625, 0.5, 0.375];

export function processorConfigFromProfile(
  profile: ResolvedProfile,
): Partial<ProcessorConfig> {
  const { content, structure, emphasis } = profile;
  const heading = structure.headings.pause;
  return {
    removeCodeBlocks: content.codeBlocks !== "read",
    codePlaceholder: content.codePlaceholder,
    skipUrls: content.urls === "skip",
    spellOutAcronyms: content.acronyms === "spell",
    // The lexicon carries the language's abbreviations (see builtins), so the
    // SSML stage's English-only expansion stays off.
    expandAbbreviations: false,
    lexicon: profile.lexicon,
    addHeadingEmphasis: structure.headings.emphasis,
    headingBreakTimes: HEADING_LEVEL_FACTORS.map((f) =>
      Math.round(heading * f),
    ),
    paragraphBreakTime: structure.paragraphs.pause,
    listItemBreakTime: structure.lists.pause,
    sentenceBreakTime: structure.sentences.pause,
    joinLineBreaks: structure.paragraphs.lineBreaks === "join",
    listNumbering: structure.lists.numbering,
    ordinals: structure.lists.ordinals,
    listItemEnd: structure.lists.itemEnd,
    italicRateAdjust: emphasis.italicRate,
    boldVolumeBoost: emphasis.boldVolume,
    textPauses: {
      heading: heading / 1000,
      paragraph: structure.paragraphs.pause / 1000,
      listItem: structure.lists.pause / 1000,
    },
  };
}
