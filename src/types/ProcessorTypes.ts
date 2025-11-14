/**
 * Type definitions for the Markdown to SSML processing pipeline
 */

import type { Root } from "mdast";
import type { VFile } from "vfile";

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
}
