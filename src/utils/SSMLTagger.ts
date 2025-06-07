class SSMLTagger {
  constructor() {}

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
