import { App, Modal, Setting } from "obsidian";

/** Asks for a bookmark's name (from the notice shown after adding one). */
export class BookmarkNameModal extends Modal {
  private name: string;
  private resolve: (name: string | null) => void = () => {};
  private settled = false;

  private constructor(app: App, name: string) {
    super(app);
    this.name = name;
  }

  /** Open the modal; resolves with the new name, or null when cancelled. */
  static ask(app: App, name: string): Promise<string | null> {
    const modal = new BookmarkNameModal(app, name);
    return new Promise((resolve) => {
      modal.resolve = resolve;
      modal.open();
    });
  }

  onOpen(): void {
    this.titleEl.setText("Rename bookmark");
    let value = this.name;
    new Setting(this.contentEl).setName("Name").addText((text) => {
      text.setValue(this.name).onChange((v) => (value = v));
      text.inputEl.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter") {
          evt.preventDefault();
          this.settle(value);
        }
      });
      window.setTimeout(() => {
        text.inputEl.focus();
        text.inputEl.select();
      }, 0);
    });
    new Setting(this.contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Rename")
          .setCta()
          .onClick(() => this.settle(value)),
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => this.settle(null)),
      );
  }

  onClose(): void {
    super.onClose();
    // Closing via Esc / click-away cancels. Deferred so a button click that
    // closes the modal settles first.
    window.setTimeout(() => this.settle(null), 0);
  }

  private settle(name: string | null): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolve(name !== null && name.trim() ? name.trim() : null);
    this.close();
  }
}
