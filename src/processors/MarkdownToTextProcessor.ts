/**
 * MarkdownToTextProcessor - Markdown to plain spoken text pipeline
 *
 * Used for TTS providers that do not support SSML (e.g. ElevenLabs). It reuses
 * the same cleaning stage as the SSML pipeline (so content toggles like "skip
 * URLs" and "read code blocks" behave identically across providers), then
 * serializes the cleaned AST to plain text instead of SSML.
 *
 * 1. Parse markdown → AST
 * 2. Clean unwanted elements (code/images/frontmatter/links/URLs)
 * 3. Serialize to plain spoken text
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import type { ProcessorConfig, PauseStyle } from "../types/ProcessorTypes";
import { DEFAULT_CONFIG } from "./config/DefaultConfig";
import { cleanProcessor } from "./pipeline/CleanProcessor";
import { serializeToText } from "./pipeline/TextSerializer";
import { titleCaseAcronyms } from "./pipeline/acronyms";

export class MarkdownToTextProcessor {
  private config: ProcessorConfig;
  private pauseStyle: PauseStyle;

  constructor(
    config?: Partial<ProcessorConfig>,
    options: { pauseStyle?: PauseStyle } = {},
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    // Which pause markup to emit is provider-dependent: ElevenLabs understands
    // `<break>` tags, MiniMax uses `<#x#>`, and engines that read unknown markup
    // literally (e.g. OpenAI) get plain newline pauses. Default to "none" so an
    // unspecified provider never has literal markup read aloud (issue #85).
    this.pauseStyle = options.pauseStyle ?? "none";
  }

  /**
   * Process markdown text to plain spoken text
   */
  async process(markdown: string): Promise<string> {
    // Stage 1: Parse markdown to AST
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkFrontmatter, ["yaml", "toml"]);

    const ast = processor.parse(markdown);

    // Stage 2: Clean unwanted elements (same options as the SSML pipeline)
    const cleanOptions = {
      removeCodeBlocks: this.config.removeCodeBlocks,
      removeImages: this.config.removeImages,
      preserveLinkText: this.config.preserveLinkText,
      removeFrontmatter: this.config.removeFrontmatter,
      removeHTML: this.config.removeHTML,
      skipUrls: this.config.skipUrls,
    };
    cleanProcessor(cleanOptions)(ast);

    // Stage 3: Serialize to spoken text (with the provider's pause style)
    const text = serializeToText(ast, { pauseStyle: this.pauseStyle });

    // Stage 4: When acronyms should not be spelled out, title-case them so the
    // engine reads them as a word (consistent with the SSML pipeline). Engines
    // like Google otherwise spell uppercase tokens by default.
    return this.config.spellOutAcronyms ? text : titleCaseAcronyms(text);
  }

  updateConfig(config: Partial<ProcessorConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  getConfig(): ProcessorConfig {
    return { ...this.config };
  }
}
