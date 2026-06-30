import { MarkdownView, TFile, App } from "obsidian";

/**
 * Outcome of reading the note to speak: the text on success, or a reason the
 * caller can turn into friendly user feedback. Returning a result (rather than
 * a sentinel string) keeps an error message from being read aloud as content.
 */
export type NoteReadResult =
  | { ok: true; text: string }
  | { ok: false; reason: "no-note" | "read-error" };

export class MarkdownHelper {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  async getMarkdownView(): Promise<NoteReadResult> {
    // First, try the active MarkdownView: read its selection if any, else all.
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
      const selectedText = activeView.editor.getSelection();
      return {
        ok: true,
        text: selectedText ? selectedText : activeView.editor.getValue(),
      };
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
          return { ok: true, text: selectedText };
        }
      }

      try {
        // No selection (or no open editor) — read the file content directly.
        return { ok: true, text: await this.app.vault.cachedRead(activeFile) };
      } catch (error) {
        console.error("Error reading active file:", error);
        return { ok: false, reason: "read-error" };
      }
    }

    // No note is open to read.
    return { ok: false, reason: "no-note" };
  }

  getActiveFilePath(): string | null {
    const activeFile = this.app.workspace.getActiveFile();
    return activeFile?.path || null;
  }
}
