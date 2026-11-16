/**
 * Takes the README screenshots of the settings in a real, sandboxed Obsidian
 * with an empty test vault (no personal notes), so they can be retaken for
 * every release. Run with `npm run docs:screenshots`; the images land in
 * test/artifacts/docs/, to be checked and copied to assets/.
 *
 * Not part of the regular e2e run (see wdio.docs.conf.mts).
 */

import * as fs from "fs";
import * as path from "path";

declare const browser: any;
declare function describe(title: string, fn: () => void): void;
declare function it(title: string, fn: () => void | Promise<void>): void;
declare function before(fn: () => void | Promise<void>): void;

const PLUGIN_ID = "voice";
const OUT_DIR = path.resolve("test/artifacts/docs");

interface Internals {
  plugins: {
    enabledPlugins: Set<string>;
    enablePlugin(id: string): Promise<void>;
    plugins: Record<
      string,
      {
        settings: Record<string, unknown>;
        saveSettings(): Promise<void>;
        reinitializeProvider(): void;
      }
    >;
  };
  setting: { open(): void; openTabById(id: string): void; close(): void };
}

/** Configure a provider whose settings show no secrets, then open the tab. */
async function openVoiceSettings(): Promise<void> {
  // The "What's New" note opens shortly after start-up; wait for it and close
  // it, so it isn't left behind the settings.
  const whatsNew = browser.$(".voice-whats-new-modal");
  if (await whatsNew.waitForExist({ timeout: 8000 }).catch(() => false)) {
    for (let i = 0; i < 5 && (await whatsNew.isExisting()); i++) {
      await browser.keys("Escape");
      await browser.pause(300);
    }
  }
  await browser.executeObsidian(async ({ app }, id: string) => {
    const a = app as unknown as Internals;
    if (!a.plugins.enabledPlugins.has(id)) {
      await a.plugins.enablePlugin(id);
    }
    const plugin = a.plugins.plugins[id];
    plugin.settings.TTS_PROVIDER = "openai-compatible";
    plugin.settings.OPENAI_COMPAT_BASE_URL = "http://localhost:8880/v1";
    await plugin.saveSettings();
    plugin.reinitializeProvider();
    a.setting.open();
    a.setting.openTabById(id);
  }, PLUGIN_ID);
  await browser.pause(800);
}

/**
 * Switch to the window that shows `selector`: Obsidian 1.15 opens the settings
 * (and modals started from them) in a window of their own on desktop.
 */
async function switchToWindowWith(selector: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    for (const handle of await browser.getWindowHandles()) {
      await browser.switchToWindow(handle);
      if (
        await browser.execute(
          (sel: string) => !!document.querySelector(sel),
          selector,
        )
      ) {
        return;
      }
    }
    await browser.pause(250);
  }
  throw new Error(`No window shows ${selector}`);
}

/** Scroll the settings so the "Speech profiles" heading is at the top. */
async function scrollToProfiles(): Promise<void> {
  await browser.execute(() => {
    const heading = Array.from(
      document.querySelectorAll(".setting-item-heading .setting-item-name"),
    ).find((el) => el.textContent === "Speech profiles");
    const item = heading?.closest(".setting-item") as HTMLElement | undefined;
    item?.scrollIntoView({ block: "start" });
    // Leave room below the settings header, so the heading isn't covered.
    let scroller = item?.parentElement ?? null;
    while (scroller && scroller.scrollHeight <= scroller.clientHeight) {
      scroller = scroller.parentElement;
    }
    if (scroller) scroller.scrollTop -= 90;
  });
  await browser.pause(300);
}

/** No focus ring or text cursor in the picture. */
async function blur(): Promise<void> {
  await browser.execute(() => (document.activeElement as HTMLElement)?.blur());
  await browser.pause(200);
}

async function kind(): Promise<string> {
  return browser.execute(() =>
    document.body.classList.contains("is-mobile") ? "mobile" : "desktop",
  );
}

/** Neutral sample notes with saved audio, so the player has chapters. */
const SAMPLE_CHAPTERS = [
  "00 — Welcome to Voice",
  "01 — The Case for Deep Focus",
  "02 — Rituals and Routines",
  "03 — Training Your Attention",
  "04 — Deep Work — A Field Guide",
];

/** Close the settings, add the sample notes and open the first in the player. */
async function openPlayer(): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, id: string, chapters: string[]) => {
      const a = app as unknown as Internals & {
        plugins: {
          plugins: Record<string, { activatePlayerView(): Promise<void> }>;
        };
      };
      a.setting.close();
      const vault = app.vault;
      if (!vault.getAbstractFileByPath("Studies")) {
        await vault.createFolder("Studies");
      }
      for (const name of chapters) {
        if (!vault.getAbstractFileByPath(`Studies/${name}.md`)) {
          await vault.create(
            `Studies/${name}.md`,
            `# ${name}\n\nA sample note for the Voice player.\n`,
          );
          await vault.createBinary(`Studies/${name}.mp3`, new ArrayBuffer(0));
        }
      }
      const first = vault.getAbstractFileByPath(`Studies/${chapters[0]}.md`);
      await app.workspace.getLeaf(false).openFile(first as never);
      await a.plugins.plugins[id].activatePlayerView();
    },
    PLUGIN_ID,
    SAMPLE_CHAPTERS,
  );
  await browser.pause(1200);
}

/** Show the player as it looks while a note is generated (40 % done). */
async function showGenerating(on: boolean): Promise<void> {
  await browser.executeObsidian(
    ({ app }, id: string, generating: boolean) => {
      const provider = (
        app as unknown as {
          plugins: {
            plugins: Record<
              string,
              { getSpeechProvider(): Record<string, unknown> }
            >;
          };
        }
      ).plugins.plugins[id].getSpeechProvider();
      if (generating) {
        provider.isOperationInProgress = () => true;
        provider.getProgress = () => 0.4;
      } else {
        delete provider.isOperationInProgress;
        delete provider.getProgress;
      }
    },
    PLUGIN_ID,
    on,
  );
  await browser.pause(800); // the player polls every 250 ms
}

describe("Docs screenshots (Integration)", function () {
  before(async function () {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    await openVoiceSettings();
  });

  it("captures the settings with the speech profiles section", async function () {
    await switchToWindowWith(".vertical-tab-content");
    await scrollToProfiles();
    const name = (await kind()) === "mobile" ? "mobile-settings" : "settings";
    await blur();
    await browser.saveScreenshot(path.join(OUT_DIR, `${name}.png`));
  });

  it("captures the profile editor", async function () {
    if ((await kind()) === "mobile") {
      return; // the desktop editor is the one shown in the README
    }
    await browser.execute(() => {
      const row = Array.from(document.querySelectorAll(".setting-item")).find(
        (el) =>
          el.querySelector(".setting-item-name")?.textContent ===
          "default (all languages)",
      );
      const edit = Array.from(row?.querySelectorAll("button") ?? []).find(
        (b) => b.textContent === "Edit",
      );
      (edit as HTMLButtonElement | undefined)?.click();
    });
    await switchToWindowWith(".voice-profile-editor");
    await browser.pause(400);
    await blur();
    await browser
      .$(".modal.voice-profile-editor-modal")
      .saveScreenshot(path.join(OUT_DIR, "profile-editor.png"));
  });

  it("captures the player and its play button while generating", async function () {
    await switchToWindowWith(".workspace");
    await openPlayer();
    await blur();
    const mobile = (await kind()) === "mobile";
    const player = browser.$(
      '.workspace-leaf-content[data-type="voice-player-view"]',
    );
    if (mobile) {
      await browser.saveScreenshot(
        path.join(OUT_DIR, "mobile-voice-player.png"),
      );
      return;
    }
    await player.saveScreenshot(path.join(OUT_DIR, "voice-player.png"));
    await showGenerating(true);
    // The ring reaches past the transport row, so take the whole player and
    // note where the row is; it is cropped with a margin afterwards.
    await player.saveScreenshot(
      path.join(OUT_DIR, "voice-player-generating.png"),
    );
    const rect = await browser.execute(() => {
      const pane = document
        .querySelector(
          '.workspace-leaf-content[data-type="voice-player-view"]',
        )!
        .getBoundingClientRect();
      const row = document
        .querySelector(".voice-player-transport")!
        .getBoundingClientRect();
      return {
        top: row.top - pane.top,
        bottom: row.bottom - pane.top,
        width: pane.width,
      };
    });
    fs.writeFileSync(
      path.join(OUT_DIR, "voice-player-generating.json"),
      JSON.stringify(rect),
    );
    await showGenerating(false);
  });
});
