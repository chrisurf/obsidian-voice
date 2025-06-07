export class RegExHelper {
  private content: string;

  constructor(input: string) {
    this.content = input;
  }

  removeHeader() {
    const text = this.content;
    var result: string = text.replace(/^---[\s\S]*?^---/m, "");
    this.content = result;
  }

  removeCode() {
    const text = this.content;
    var result: string = text.replace(/```[\s\S]*?```/m, "");
    this.content = result;
  }

  removeLinks() {
    const text = this.content;
    var result: string = text.replace(/!/g, "");
    result = result.replace(/(?<=\[\[)[^\|\]]+(?=\|.*?\]\])/g, "");
    result = result.replace(/\([^)]*\)/gm, "");
    result = result.replace(/[\[\]]/g, "");
    this.content = result;
  }

  removeSpecialCharacters() {
    const text = this.content;
    var result: string = text.replace(/[*_#><():|"~`'{}]/g, "");
    this.content = result;
  }

  removeEmojis() {
    const text = this.content;
    // This regex matches most emoji characters
    var result: string = text.replace(
      /[\u{1F000}-\u{1FFFF}]|\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu,
      "",
    );
    this.content = result;
  }

  getcleanContent() {
    this.removeHeader();
    this.removeCode();
    this.removeLinks();
    this.removeSpecialCharacters();
    this.removeEmojis(); // Add the new emoji removal step
    return this.content;
  }
}
