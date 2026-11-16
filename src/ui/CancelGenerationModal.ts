import { App, Modal, Setting } from "obsidian";

/**
 * Asks before cancelling audio that is being generated — the ✕ next to the
 * progress bar is the only way to stop it, so it is confirmed: whatever was
 * generated so far is lost.
 */
export class CancelGenerationModal extends Modal {
  private noteName: string | null;
  private resolve: (cancel: boolean) => void = () => {};
  private settled = false;

  private constructor(app: App, noteName: string | null) {
    super(app);
    this.noteName = noteName;
  }

  /** Open the modal; resolves true when the user confirms the cancel. */
  static confirm(app: App, noteName: string | null): Promise<boolean> {
    const modal = new CancelGenerationModal(app, noteName);
    return new Promise((resolve) => {
      modal.resolve = resolve;
      modal.open();
    });
  }

  onOpen(): void {
    this.titleEl.setText("Stop generating audio?");
    const what = this.noteName ? `“${this.noteName}”` : "this note";
    this.contentEl.createEl("p", {
      text: `The audio for ${what} is still being generated. If you stop now, what was generated so far is lost.`,
    });

    new Setting(this.contentEl)
      .addButton((btn) => {
        btn.setButtonText("Stop generating").onClick(() => this.settle(true));
        // Warning styling without setDestructive (requires a newer Obsidian).
        btn.buttonEl.addClass("mod-warning");
      })
      .addButton((btn) =>
        btn
          .setButtonText("Keep generating")
          .setCta()
          .onClick(() => this.settle(false)),
      );
  }

  onClose(): void {
    super.onClose();
    // Closing via Esc / click-away keeps generating. Deferred so a button
    // click that closes the modal settles first.
    window.setTimeout(() => this.settle(false), 0);
  }

  /** Resolve exactly once and close. */
  private settle(cancel: boolean): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolve(cancel);
    this.close();
  }
}
