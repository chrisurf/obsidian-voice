/**
 * MarkdownToSSMLProcessor - Main pipeline orchestrator
 *
 * Coordinates the full Markdown to SSML transformation pipeline:
 * 1. Parse markdown → AST
 * 2. Clean unwanted elements
 * 3. Enhance with SSML structure
 * 4. Escape XML characters
 * 5. Serialize to SSML string
 * 6. Validate output
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import type {
  ProcessorConfig,
  ProcessingResult,
} from "../types/ProcessorTypes";
import { DEFAULT_CONFIG } from "./config/DefaultConfig";
import { cleanProcessor } from "./pipeline/CleanProcessor";
import { enhanceProcessor } from "./pipeline/EnhanceProcessor";
import { xmlEscapeProcessor } from "./pipeline/XmlEscapeProcessor";
import { serializeToSSML } from "./pipeline/SSMLSerializer";
import { validateSSML } from "./pipeline/SSMLValidator";

/**
 * Main Markdown to SSML Processor
 */
export class MarkdownToSSMLProcessor {
  private config: ProcessorConfig;

  constructor(config?: Partial<ProcessorConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Process markdown text to SSML
   */
  async process(markdown: string): Promise<ProcessingResult> {
    const warnings: string[] = [];

    try {
      // Stage 1: Parse markdown to AST
      const processor = unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkFrontmatter, ["yaml", "toml"]);

      const ast = processor.parse(markdown);

      // Stage 2: Clean unwanted elements
      const cleanOptions = {
        removeCodeBlocks: this.config.removeCodeBlocks,
        removeImages: this.config.removeImages,
        preserveLinkText: this.config.preserveLinkText,
        removeFrontmatter: this.config.removeFrontmatter,
        removeHTML: this.config.removeHTML,
      };
      cleanProcessor(cleanOptions)(ast);

      // Stage 3: Enhance with SSML structure
      const enhanceOptions = {
        addHeadingEmphasis: this.config.addHeadingEmphasis,
        headingBreakTimes: this.config.headingBreakTimes,
        paragraphBreakTime: this.config.paragraphBreakTime,
        listItemBreakTime: this.config.listItemBreakTime,
        sentenceBreakTime: this.config.sentenceBreakTime,
        headingVolumeBoost: this.config.headingVolumeBoost,
        boldVolumeBoost: this.config.boldVolumeBoost,
        italicRateAdjust: this.config.italicRateAdjust,
        expandAbbreviations: this.config.expandAbbreviations,
        spellOutAcronyms: this.config.spellOutAcronyms,
        formatNumbers: this.config.formatNumbers,
      };
      enhanceProcessor(enhanceOptions)(ast);

      // Stage 4: Escape XML characters
      xmlEscapeProcessor()(ast);

      // Stage 5: Serialize to SSML
      const ssml = serializeToSSML(ast);

      // Stage 6: Validate structure (but not length - chunking handles that)
      let validationResult = validateSSML(
        ssml,
        this.config.voiceType,
        999999, // Use very large limit - chunking will handle actual size limits
      );

      if (!this.config.strictValidation) {
        // Skip validation errors if not strict
        validationResult = { isValid: true, errors: [] };
      }

      // Note: Length warnings removed - chunking handles any size SSML

      return {
        ssml,
        isValid: validationResult.isValid,
        errors: validationResult.errors,
        warnings,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        ssml: "",
        isValid: false,
        errors: [`Processing failed: ${errorMessage}`],
        warnings,
      };
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ProcessorConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): ProcessorConfig {
    return { ...this.config };
  }
}
