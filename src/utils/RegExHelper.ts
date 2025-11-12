export class RegExHelper {
  private content: string;

  constructor(input: string) {
    this.content = input;
  }

  removeHeader() {
    const text = this.content;
    const result: string = text.replace(/^---[\s\S]*?^---/m, "");
    this.content = result;
  }

  removeCode() {
    const text = this.content;
    const result: string = text.replace(/```[\s\S]*?```/gm, "");
    this.content = result;
  }

  removeLinks() {
    const text = this.content;
    let result: string = text.replace(/!/g, "");
    result = result.replace(/(?<=\[\[)[^\|\]]+(?=\|.*?\]\])/g, "");
    result = result.replace(/\([^)]*\)/gm, "");
    result = result.replace(/[\[\]]/g, "");
    this.content = result;
  }

  removeSpecialCharacters() {
    const text = this.content;
    // Remove special characters but preserve punctuation important for speech pauses
    // Keep: . , ! ? ; : - and newlines
    const result: string = text.replace(/[*_#><():|"~`'{}]/g, "");
    this.content = result;
  }

  removeEmojis() {
    const text = this.content;
    // This regex matches most emoji characters
    const result: string = text.replace(
      /[\u{1F000}-\u{1FFFF}]|\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu,
      "",
    );
    this.content = result;
  }

  normalizeWhitespace() {
    // Preserve paragraph breaks (double newlines) but clean up excessive whitespace
    let result = this.content;

    // First, normalize multiple newlines (3+ newlines) to double newlines (paragraph break)
    result = result.replace(/\n{3,}/g, "\n\n");

    // Replace multiple spaces with single space, but preserve newlines
    result = result.replace(/[^\S\n]+/g, " ");

    // Trim spaces at the start and end of each line
    result = result
      .split("\n")
      .map((line) => line.trim())
      .join("\n");

    this.content = result;
  }

  getcleanContent() {
    this.removeHeader();
    this.removeCode();
    this.removeLinks();
    this.removeSpecialCharacters();
    this.removeEmojis();
    this.normalizeWhitespace(); // Add whitespace normalization while preserving structure
    return this.content;
  }
}
