/**
 * SSMLTagger - DEPRECATED PLACEHOLDER
 *
 * This class has been stripped of all SSML generation logic.
 * It now provides minimal SSML wrapping to maintain backward compatibility
 * while the new Markdown-to-SSML pipeline is implemented.
 *
 * See: MARKDOWN_TO_SSML_ARCHITECTURE.md for the new design
 * See: CONTENT_MANIPULATION_ANALYSIS.md for issues with old approach
 *
 * Current behavior:
 * - Escapes XML special characters (required for AWS Polly)
 * - Wraps content in <speak> tags (required SSML root element)
 * - No other processing (all removed)
 *
 * TODO: Replace with new SSMLSerializer once pipeline is complete
 */
class SSMLTagger {
  constructor() {}

  /**
   * Escapes XML special characters to prevent SSML parsing errors
   * This is the ONLY remaining manipulation - it's critical for AWS Polly
   * @param text - The input text to escape
   * @returns Escaped text safe for SSML
   */
  private escapeXmlCharacters(text: string): string {
    return text
      .replace(/&/g, "&amp;") // Must be first to avoid double-escaping
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * Wraps text in minimal SSML tags
   *
   * Previous behavior (removed):
   * - Word-by-word processing
   * - ALL CAPS detection (commented out)
   * - Number detection with <say-as>
   * - Punctuation detection with <break>
   *
   * Current behavior:
   * - XML escape only
   * - Wrap in <speak> tags
   *
   * @param text - The input text to be processed
   * @returns Minimal valid SSML string
   */
  addSSMLTags(text: string): string {
    // Escape XML characters for safety
    const escapedText = this.escapeXmlCharacters(text);

    // Return minimal valid SSML
    // New pipeline will handle all enhancement
    return `<speak>${escapedText}</speak>`;
  }
}

export default SSMLTagger;
