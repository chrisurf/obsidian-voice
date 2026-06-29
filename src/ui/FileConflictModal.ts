import { App, Modal, Setting } from "obsidian";

/** The user's decision when a target file name already exists. */
export type ConflictChoice =
  | { action: "replace" }
  | { action: "rename"; baseName: string }
  | { action: "cancel" };

/**
 * Asks what to do when saving/moving an MP3 into a folder that already contains
 * a file with the same name: Replace, Save under a new name, or Cancel.
 */
export class FileConflictModal extends Modal {
  private fileName: string;
  private folderLabel: string;
  private suggested: string;
  private resolve: (choice: ConflictChoice) => void = () => {};
  private settled = false;

  private constructor(
    app: App,
    fileName: string,
    folderLabel: string,
    suggested: string,
  ) {
    super(app);
    this.fileName = fileName;
    this.folderLabel = folderLabel;
    this.suggested = suggested;
  }

  /**
   * Open the modal and resolve with the chosen action.
   * @param suggested A free base name (no extension) to pre-fill the rename box.
   */
  static open(
    app: App,
    fileName: string,
    folderLabel: string,
    suggested: string,
  ): Promise<ConflictChoice> {
    const modal = new FileConflictModal(app, fileName, folderLabel, suggested);
    return new Promise((resolve) => {
      modal.resolve = resolve;
      modal.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    this.titleEl.setText("File already exists");
    contentEl.createEl("p", {
      text: `“${this.fileName}” already exists in ${this.folderLabel}. Replace it, or save under a new name?`,
    });

    let newBaseName = this.suggested;
    const nameSetting = new Setting(contentEl)
      .setName("New name")
      .addText((text) => {
        text.setValue(this.suggested).onChange((value) => {
          newBaseName = value;
        });
        text.inputEl.addEventListener("keydown", (evt) => {
          if (evt.key === "Enter") {
            evt.preventDefault();
            this.settle({ action: "rename", baseName: newBaseName.trim() });
          }
        });
      });
    nameSetting.controlEl.createSpan({
      cls: "voice-conflict-ext",
      text: ".mp3",
    });

    new Setting(contentEl)
      .addButton((btn) => {
        btn
          .setButtonText("Replace")
          .onClick(() => this.settle({ action: "replace" }));
        // Warning styling without setDestructive (requires a newer Obsidian).
        btn.buttonEl.addClass("mod-warning");
      })
      .addButton((btn) =>
        btn
          .setButtonText("Save as new")
          .setCta()
          .onClick(() =>
            this.settle({ action: "rename", baseName: newBaseName.trim() }),
          ),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Cancel")
          .onClick(() => this.settle({ action: "cancel" })),
      );
  }

  onClose(): void {
    super.onClose();
    // Closing via Esc / click-away counts as a cancel. Deferred so a button
    // click that closes the modal settles first.
    window.setTimeout(() => this.settle({ action: "cancel" }), 0);
  }

  /** Resolve exactly once and close. */
  private settle(choice: ConflictChoice): void {
    if (this.settled) {
      return;
    }
    // A rename with an empty name is treated as a cancel to avoid bad paths.
    if (choice.action === "rename" && choice.baseName === "") {
      return;
    }
    this.settled = true;
    this.resolve(choice);
    this.close();
  }
}
