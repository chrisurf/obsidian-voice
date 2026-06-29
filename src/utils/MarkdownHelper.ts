import { MarkdownView, TFile, App } from "obsidian";

export class MarkdownHelper {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  async getMarkdownView(): Promise<string> {
    // First, try the active MarkdownView: read its selection if any, else all.
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
      const selectedText = activeView.editor.getSelection();
      return selectedText ? selectedText : activeView.editor.getValue();
    }

    // No MarkdownView is active — this is the case when reading is triggered
    // from the Voice player pane (the player becomes the active view). Fall back
    // to the markdown view that shows the active file so a text selection there
    // is still honored; only read the whole file when there is no selection.
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && activeFile instanceof TFile) {
      const fileView = this.app.workspace
        .getLeavesOfType("markdown")
        .map((leaf) => leaf.view)
        .find(
          (view): view is MarkdownView =>
            view instanceof MarkdownView && view.file === activeFile,
        );
      if (fileView) {
        const selectedText = fileView.editor.getSelection();
        if (selectedText) {
          return selectedText;
        }
      }

      try {
        // No selection (or no open editor) — read the file content directly.
        return await this.app.vault.cachedRead(activeFile);
      } catch (error) {
        console.error("Error reading active file:", error);
        return "Error reading the active file.";
      }
    }

    // If no active file is found, return the error message
    return "No active file found.";
  }

  getActiveFilePath(): string | null {
    const activeFile = this.app.workspace.getActiveFile();
    return activeFile?.path || null;
  }
}
