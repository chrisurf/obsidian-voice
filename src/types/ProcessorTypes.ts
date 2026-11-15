/**
 * Type definitions for the Markdown to SSML processing pipeline
 */

import type { Root } from "mdast";
import type { VFile } from "vfile";
import type {
  LexiconEntry,
  ListItemEnd,
  ListNumbering,
} from "../profiles/schema";

/**
 * How structural pauses are emitted for text (non-SSML) providers:
 * - "none": rely on newline/punctuation boundaries only (no markup) — the safe
 *   default for engines that read unknown markup literally (e.g. OpenAI).
 * - "break-tags": ElevenLabs-style `<break time="x.xs"/>` tags.
 * - "minimax": MiniMax native `<#x#>` pause markers (x = seconds).
 */
export type PauseStyle = "none" | "break-tags" | "minimax";

/**
 * Configuration options for the Markdown to SSML processor
 */
export interface ProcessorConfig {
  // Cleaning options
  removeCodeBlocks: boolean;
  removeImages: boolean;
  preserveLinkText: boolean;
  removeFrontmatter: boolean;
  removeHTML: boolean;
  skipUrls: boolean;

  // Enhancement options
  addHeadingEmphasis: boolean;
  headingBreakTimes: number[]; // ms for h1-h6
  paragraphBreakTime: number; // ms
  listItemBreakTime: number; // ms
  sentenceBreakTime: number; // ms

  // Prosody settings
  headingVolumeBoost: string; // "loud", "+2dB", etc.
  boldVolumeBoost: string;
  italicRateAdjust: string; // "95%", "90%", etc.

  // Special handling
  expandAbbreviations: boolean;
  spellOutAcronyms: boolean;
  formatNumbers: boolean;

  // Reading profile (src/profiles): language-specific wording and structure
  codePlaceholder: string; // said in place of a code block
  lexicon: LexiconEntry[]; // pronunciation replacements, first match wins
  listNumbering: ListNumbering; // how numbered list items are announced
  ordinals: string[]; // words for "ordinal" numbering, in order
  joinLineBreaks: boolean; // read wrapped lines of a paragraph as one
  listItemEnd: ListItemEnd; // punctuation closing list items / table rows
  // Pause lengths (seconds) for text providers' pause markers; the serializer
  // keeps its own conservative defaults when unset.
  textPauses?: { heading?: number; paragraph?: number; listItem?: number };

  // Validation
  strictValidation: boolean;
  maxSSMLLength: number;
  voiceType: "neural" | "standard" | "long-form";
}

/**
 * Result of processing markdown to SSML
 */
export interface ProcessingResult {
  ssml: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Result of SSML validation
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * A processor function that transforms the AST
 */
export type ProcessorFunction = (tree: Root, file: VFile) => void;

/**
 * A processor plugin that returns a transformer
 */
export type ProcessorPlugin = (
  config: Partial<ProcessorConfig>,
) => ProcessorFunction;

/**
 * Common abbreviations and their expansions
 */
export interface AbbreviationMap {
  [key: string]: string;
}

/**
 * Options for the CleanProcessor
 */
export interface CleanProcessorOptions {
  removeCodeBlocks: boolean;
  removeImages: boolean;
  preserveLinkText: boolean;
  removeFrontmatter: boolean;
  removeHTML: boolean;
  skipUrls: boolean;
  /** Said in place of a code block (default "Code snippet."). */
  codePlaceholder?: string;
}

/**
 * Options for the EnhanceProcessor
 */
export interface EnhanceProcessorOptions {
  addHeadingEmphasis: boolean;
  headingBreakTimes: number[];
  paragraphBreakTime: number;
  listItemBreakTime: number;
  sentenceBreakTime: number;
  headingVolumeBoost: string;
  boldVolumeBoost: string;
  italicRateAdjust: string;
  expandAbbreviations: boolean;
  spellOutAcronyms: boolean;
  formatNumbers: boolean;
  /** How numbered list items are announced (default "ordinal"). */
  listNumbering?: ListNumbering;
  /** Ordinal words for list items (default English). */
  ordinals?: string[];
}
