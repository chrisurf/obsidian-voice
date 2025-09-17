import { MarkdownView, TFile, App } from "obsidian";

export class MarkdownHelper {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  async getMarkdownView(): Promise<string> {
    // First, try to get content from the active MarkdownView (current behavior)
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
      return content;
    }

    // If no MarkdownView is active, try to get the active file
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && activeFile instanceof TFile) {
      try {
        // Read the file content directly
        content = await this.app.vault.cachedRead(activeFile);
        return content;
      } catch (error) {
        console.error("Error reading active file:", error);
        return "Error reading the active file.";
      }
    }

    // If no active file is found, return the error message
    return "No active file found.";
  }
}
