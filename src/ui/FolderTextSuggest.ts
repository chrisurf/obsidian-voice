import { App, AbstractInputSuggest, TFolder } from "obsidian";

/**
 * Folder autocomplete for a plain text input (settings). Mirrors Obsidian's
 * own folder suggest: typing filters every vault folder; picking one fills
 * the input. A typed path that does not exist yet is still accepted — the
 * audio file manager creates the folder on save.
 */
export class FolderTextSuggest extends AbstractInputSuggest<string> {
  private inputEl: HTMLInputElement;
  private folders: string[];

  constructor(app: App, inputEl: HTMLInputElement) {
    super(app, inputEl);
    this.inputEl = inputEl;
    this.folders = app.vault
      .getAllLoadedFiles()
      .filter((f): f is TFolder => f instanceof TFolder)
      .map((f) => f.path)
      .sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      );
  }

  getSuggestions(inputStr: string): string[] {
    const query = inputStr.trim().toLowerCase();
    if (!query) {
      return this.folders.slice(0, 50);
    }
    return this.folders
      .filter((path) => path.toLowerCase().contains(query))
      .slice(0, 50);
  }

  renderSuggestion(path: string, el: HTMLElement): void {
    el.setText(path === "" ? "/" : path);
  }

  selectSuggestion(path: string): void {
    this.inputEl.value = path;
    this.inputEl.trigger("input");
    this.close();
  }
}
