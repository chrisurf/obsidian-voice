/**
 * Default configuration for the Markdown to SSML processor
 */

import type { ProcessorConfig } from "../../types/ProcessorTypes";

/**
 * Default configuration values optimized for natural-sounding speech
 */
export const DEFAULT_CONFIG: ProcessorConfig = {
  // Cleaning options
  removeCodeBlocks: true,
  removeImages: true,
  preserveLinkText: true,
  removeFrontmatter: true,
  removeHTML: true,

  // Enhancement options
  addHeadingEmphasis: true,
  headingBreakTimes: [800, 700, 600, 500, 400, 300], // h1 through h6
  paragraphBreakTime: 400,
  listItemBreakTime: 200,
  sentenceBreakTime: 300,

  // Prosody settings (AWS Polly compatible)
  headingVolumeBoost: "loud", // Polly accepts: silent, x-soft, soft, medium, loud, x-loud, or relative dB
  boldVolumeBoost: "+2dB", // Relative dB increase for bold text
  italicRateAdjust: "95%", // Slower rate for italic emphasis

  // Special handling
  expandAbbreviations: true, // Convert "Dr." to "Doctor", etc.
  spellOutAcronyms: true, // Spell out "NASA", "FBI", etc.
  formatNumbers: true, // Format numbers for proper pronunciation

  // Validation
  strictValidation: true, // Validate SSML before sending to Polly
  maxSSMLLength: 6000, // AWS Polly limit for SSML input
  voiceType: "neural", // Default to neural voices
};

/**
 * Configuration presets for different use cases
 */
export const PRESETS = {
  /**
   * Minimal processing - fastest but least natural
   */
  minimal: {
    ...DEFAULT_CONFIG,
    addHeadingEmphasis: false,
    expandAbbreviations: false,
    spellOutAcronyms: false,
    formatNumbers: false,
  } as ProcessorConfig,

  /**
   * Balanced - good quality with reasonable processing time
   */
  balanced: DEFAULT_CONFIG,

  /**
   * Maximum quality - all features enabled, slower processing
   */
  maximum: {
    ...DEFAULT_CONFIG,
    headingBreakTimes: [1000, 900, 800, 700, 600, 500],
    paragraphBreakTime: 500,
    listItemBreakTime: 250,
    sentenceBreakTime: 350,
  } as ProcessorConfig,

  /**
   * Fast reading - shorter pauses for experienced listeners
   */
  fast: {
    ...DEFAULT_CONFIG,
    headingBreakTimes: [600, 500, 400, 300, 200, 150],
    paragraphBreakTime: 250,
    listItemBreakTime: 100,
    sentenceBreakTime: 200,
  } as ProcessorConfig,
};
