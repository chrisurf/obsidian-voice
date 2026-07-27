import { App, Modal, MarkdownRenderer, Component, Setting } from "obsidian";
import {
  WHATS_NEW,
  HERO_IMAGE_URL,
  BUY_ME_A_COFFEE_URL,
  BUY_ME_A_COFFEE_IMAGE_URL,
} from "../utils/whatsNew";

/**
 * Modal that introduces the latest functionality after an install or update.
 * Renders the curated {@link WHATS_NEW} markdown and offers a button to open
 * the Voice player straight away, so the feature is immediately discoverable.
 */
export class WhatsNewModal extends Modal {
  private readonly component: Component;
  private readonly version: string;
  private readonly onOpenPlayer: () => void;

  constructor(
    app: App,
    version: string,
    component: Component,
    onOpenPlayer: () => void,
  ) {
    super(app);
    this.version = version;
    this.component = component;
    this.onOpenPlayer = onOpenPlayer;
  }

  onOpen(): void {
    const { contentEl, titleEl, modalEl } = this;
    modalEl.addClass("voice-whats-new-modal");
    titleEl.setText(`What's new in Voice ${this.version}`);

    // Hero banner (mirrors the README). Loaded remotely; hidden gracefully if
    // it cannot be fetched, e.g. when the user is offline.
    const hero = contentEl.createEl("img", {
      cls: "voice-whats-new-hero",
      attr: { alt: "Obsidian Voice", src: HERO_IMAGE_URL },
    });
    hero.addEventListener("error", () => hero.hide());

    // "Buy me a coffee" — promoted right at the top so supporters can chip in.
    // Loaded remotely like the hero; the whole row hides if it can't be fetched.
    const support = contentEl.createDiv({ cls: "voice-whats-new-support" });
    const coffeeLink = support.createEl("a", {
      cls: "voice-bmc-link",
      attr: {
        href: BUY_ME_A_COFFEE_URL,
        target: "_blank",
        rel: "noopener",
      },
    });
    const coffeeImg = coffeeLink.createEl("img", {
      cls: "voice-bmc-button",
      attr: { alt: "Buy me a coffee", src: BUY_ME_A_COFFEE_IMAGE_URL },
    });
    coffeeImg.addEventListener("error", () => support.hide());

    const body = contentEl.createDiv({ cls: "voice-whats-new-body" });
    // MarkdownRenderer.render is the current rendering API; the component ties
    // the rendered children's lifecycle to the plugin so they are cleaned up.
    void MarkdownRenderer.render(this.app, WHATS_NEW, body, "", this.component);

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Open Voice player")
          .setCta()
          .onClick(() => {
            this.onOpenPlayer();
            this.close();
          }),
      )
      .addButton((btn) =>
        btn.setButtonText("Close").onClick(() => this.close()),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
