class SSMLTagger {
  constructor() {}

  /**
   * Escapes XML special characters to prevent SSML parsing errors
   * @param text - The input text to escape
   * @returns Escaped text safe for SSML
   */
  private escapeXmlCharacters(text: string): string {
    return text
      .replace(/&/g, "&amp;")   // Must be first to avoid double-escaping
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * Adds SSML tags to the provided text string.
   * @param text - The input text to be processed.
   * @returns A string with SSML tags added.
   */
  addSSMLTags(text: string): string {
    let ssmlText = "";

    // Split the text into words
    const words = text.split(" ");

    for (let i = 0; i < words.length; i++) {
      let ssmlWord = words[i];

      // Escape XML characters first to prevent SSML parsing errors
      ssmlWord = this.escapeXmlCharacters(ssmlWord);

      if (/^[A-Z]+$/.test(ssmlWord)) {
        //        ssmlWord = `<emphasis level="strong">${ssmlWord}</emphasis>`;
      } else if (/^\d+$/.test(ssmlWord)) {
        ssmlWord = `<say-as interpret-as="number">${ssmlWord}</say-as>`;
      } else if (/[.!?]/.test(ssmlWord)) {
        ssmlWord += `<break time="500ms"/>`;
      }

      ssmlText += `${ssmlWord} `;
    }

    return `<speak>${ssmlText}</speak>`;
  }
}

export default SSMLTagger;
