class SSMLTagger {
  constructor() {}

  /**
   * Escapes XML special characters to prevent SSML parsing errors
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
   * Detects if text represents a paragraph break (double newline or single newline with significant whitespace)
   */
  private isParagraphBreak(text: string): boolean {
    return /\n\s*\n/.test(text) || /\n\s{2,}/.test(text);
  }

  /**
   * Splits text into paragraphs while preserving structure
   */
  private splitIntoParagraphs(text: string): string[] {
    // Split on double newlines or single newline followed by significant whitespace
    return text
      .split(/\n\s*\n|\n\s{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  /**
   * Splits a paragraph into sentences, preserving the sentence-ending punctuation
   */
  private splitIntoSentences(paragraph: string): string[] {
    // Match sentences ending with . ! ? optionally followed by quotes/parentheses
    const sentenceRegex = /[^.!?]+[.!?]+(?:['")])?(?:\s|$)/g;
    const sentences = paragraph.match(sentenceRegex);

    if (sentences) {
      return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
    }

    // If no sentence-ending punctuation found, return the whole paragraph as one sentence
    return paragraph.trim().length > 0 ? [paragraph.trim()] : [];
  }

  /**
   * Wraps numbers in say-as tags for proper pronunciation
   */
  private processNumbers(text: string): string {
    // Match standalone numbers (not part of words)
    return text.replace(
      /\b(\d+)\b/g,
      '<say-as interpret-as="number">$1</say-as>',
    );
  }

  /**
   * Adds appropriate break after comma for more natural pauses
   */
  private processCommas(text: string): string {
    // Add a weak break after commas for natural pausing
    return text.replace(/,(\s)/g, ',<break strength="weak"/>$1');
  }

  /**
   * Processes a single sentence with inline SSML enhancements
   */
  private processSentence(sentence: string): string {
    let processed = this.escapeXmlCharacters(sentence);

    // Apply number formatting
    processed = this.processNumbers(processed);

    // Add breaks after commas for more natural speech
    processed = this.processCommas(processed);

    return processed;
  }

  /**
   * Adds SSML tags to the provided text string with proper sentence and paragraph structure.
   * @param text - The input text to be processed.
   * @returns A string with SSML tags added for natural speech flow.
   */
  addSSMLTags(text: string): string {
    const paragraphs = this.splitIntoParagraphs(text);

    let ssmlContent = "";

    for (const paragraph of paragraphs) {
      const sentences = this.splitIntoSentences(paragraph);

      // Wrap paragraph in <p> tag
      let paragraphContent = "";

      for (const sentence of sentences) {
        const processedSentence = this.processSentence(sentence);
        // Wrap each sentence in <s> tag for proper sentence boundaries
        paragraphContent += `<s>${processedSentence}</s> `;
      }

      // Add paragraph with proper break
      ssmlContent += `<p>${paragraphContent.trim()}</p>\n`;
    }

    return `<speak>${ssmlContent.trim()}</speak>`;
  }
}

export default SSMLTagger;
