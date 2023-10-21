import { MarkdownView } from "obsidian";

export class MarkdownHelper {
  private app: any;

  constructor(app: any) {
    this.app = app;
  }

  getMarkdownView(): string {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    let content = "";

    if (activeView) {
      const editor = activeView.editor;
      const selectedText = editor.getSelection();
      if (selectedText) {
        content = selectedText;
      } else {
        content = editor.getValue();
      }
    } else {
      content = "No active file found.";
    }
    return content;
  }
}
