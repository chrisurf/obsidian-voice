/**
 * Takes every screenshot of the User Guide (docs/) in a real, sandboxed
 * Obsidian with an empty test vault. All content is made up: a sample folder
 * of notes with silent MP3s, bookmarks and folders — no personal data, no
 * real keys. Run with `npm run docs:screenshots` (desktop and the mobile UI at
 * iPhone size); the images are written straight into docs/images/, so a
 * `git diff` shows what changed. Not part of the regular e2e run.
 *
 * Each picture is a crop of a full screenshot around one or more elements, so
 * it keeps the screen's full resolution.
 */

import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import type { AddressInfo } from "net";

declare const browser: any;
declare function describe(title: string, fn: () => void): void;
declare function it(title: string, fn: () => Promise<void>): void;
declare function before(fn: () => Promise<void>): void;
declare function after(fn: () => Promise<void>): void;

const ID = "voice";
const OUT = path.resolve("docs/images");
const FOLDER = "Deep Work";
const PLAYER = '.workspace-leaf-content[data-type="voice-player-view"]';

/** Neutral sample chapters: title, minutes of (silent) audio, and the text. */
const CHAPTERS: [string, number, string][] = [
  [
    "01 — Why Focus Matters",
    6.4,
    "Focus is the quiet skill behind most good work. When attention stays on one task, ideas connect, mistakes drop and the work feels lighter. This chapter looks at why switching between tasks costs more than it seems.",
  ],
  [
    "02 — Rituals and Routines",
    11.2,
    "A ritual removes the small decisions before deep work: where you sit, how long you work, what you do when the time is up. Start small. A fixed start time and a clear end are enough for the first week.",
  ],
  [
    "03 — Training Your Attention",
    8.7,
    "Attention behaves like a muscle. It grows with practice and tires without rest. Short, regular sessions of single-tasking build it faster than rare marathons.",
  ],
  [
    "04 — Rest Is Part of the Work",
    5.3,
    "Breaks are not the opposite of focus. A walk, a short nap or simply looking out of the window lets the mind sort what it has taken in.",
  ],
  [
    "05 — A Week of Deep Work",
    9.8,
    "Put it together: plan two deep-work blocks a day, protect them in your calendar, and review on Friday what worked. Adjust one thing at a time.",
  ],
];
/** A second paragraph and a short list for every sample note. */
const MORE_TEXT =
  "## Try this\n\n- Pick one task for the next 50 minutes.\n- Close everything else.\n- Write down what distracted you, and why.\n\nRead this note aloud with Voice while you walk, cook or commute — and come back to the spots that matter with a bookmark.";
const BOOKMARKS: [number, string][] = [
  [45, "The cost of switching"],
  [192, "Start with one ritual"],
  [468, "Weekly review"],
];

/** Silent MPEG-2 Layer III (24 kHz mono, 48 kbps): 144-byte, 24 ms frames. */
function silentMp3(minutes: number): Buffer {
  const frames = Math.round((minutes * 60) / 0.024);
  const out = Buffer.alloc(frames * 144);
  for (let i = 0; i < frames; i++) {
    out.set([0xff, 0xf3, 0x64, 0xc4], i * 144);
  }
  return out;
}

/** How long the stand-in server takes per request (to show generating). */
let serverDelayMs = 0;

/** A stand-in OpenAI-compatible server: silent speech, a few voices. */
function startTtsServer(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      if (req.url?.endsWith("/audio/speech")) {
        await new Promise((r) => setTimeout(r, serverDelayMs));
        const text = (JSON.parse(body || "{}").input as string) ?? "";
        res.setHeader("content-type", "audio/mpeg");
        res.end(silentMp3(Math.max(0.05, text.length / 900)));
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: [{ id: "tts-1" }, { id: "tts-1-hd" }] }));
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server)),
  );
}

// --- Browser helpers -----------------------------------------------------

const pause = (ms: number) => browser.pause(ms);

async function isMobile(): Promise<boolean> {
  return browser.execute(() => document.body.classList.contains("is-mobile"));
}

/** Run code in Obsidian with the app and the plugin. */
function obsidian<T>(
  fn: (app: any, plugin: any, ...args: any[]) => T,
  ...args: any[]
): Promise<T> {
  return browser.executeObsidian(
    ({ app }: any, source: string, id: string, rest: any[]) =>
      // eslint-disable-next-line no-new-func
      new Function(
        "app",
        "plugin",
        "args",
        `return (${source})(app, plugin, ...args);`,
      )(app, app.plugins.plugins[id], rest),
    fn.toString(),
    ID,
    args,
  );
}

/** Switch to the window that shows `selector` (settings open in their own). */
async function windowWith(selector: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    for (const handle of await browser.getWindowHandles()) {
      await browser.switchToWindow(handle);
      if (
        await browser.execute(
          (s: string) => !!document.querySelector(s),
          selector,
        )
      ) {
        return;
      }
    }
    await pause(200);
  }
  throw new Error(`No window shows ${selector}`);
}

/** No focus ring, caret or hover highlight in the picture. */
async function calm(): Promise<void> {
  await browser.execute(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await pause(250);
}

/** Hide parts of the window that would cover or clutter a picture. */
async function hide(selectors: string[]): Promise<void> {
  await browser.execute((sels: string[]) => {
    let style = document.getElementById("guide-hide");
    if (!style) {
      style = document.head.createEl("style", { attr: { id: "guide-hide" } });
    }
    style.textContent = sels.length
      ? `${sels.join(", ")} { visibility: hidden !important; }`
      : "";
  }, selectors);
  await pause(150);
}

/** A real mouse click (menus open where the pointer is). */
async function realClick(selector: string): Promise<void> {
  await browser.$(selector).click();
  await pause(500);
}

function removeNotices(): Promise<void> {
  return browser.execute(() =>
    document.querySelectorAll(".notice").forEach((n) => n.remove()),
  );
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The box around every element matching the selectors (CSS pixels). */
async function boxOf(selectors: string[], pad: number): Promise<Rect> {
  return browser.execute(
    (sels: string[], p: number) => {
      const rects = sels.flatMap((s) =>
        Array.from(document.querySelectorAll(s))
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0),
      );
      if (rects.length === 0) {
        throw new Error(`Nothing to capture: ${sels.join(", ")}`);
      }
      const x0 = Math.max(0, Math.min(...rects.map((r) => r.left)) - p);
      const y0 = Math.max(0, Math.min(...rects.map((r) => r.top)) - p);
      const x1 = Math.min(
        innerWidth,
        Math.max(...rects.map((r) => r.right)) + p,
      );
      const y1 = Math.min(
        innerHeight,
        Math.max(...rects.map((r) => r.bottom)) + p,
      );
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    },
    selectors,
    pad,
  );
}

/** Save the area (or the whole window) as docs/images/<name>.png. */
async function shot(
  name: string,
  area?: string | string[] | Rect,
  pad = 8,
): Promise<void> {
  const rect: Rect | null =
    area === undefined
      ? null
      : typeof area === "string" || Array.isArray(area)
        ? await boxOf(typeof area === "string" ? [area] : area, pad)
        : area;
  const full: string = await browser.takeScreenshot();
  const png: string = await browser.execute(
    async (b64: string, r: Rect | null) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const scale = img.naturalWidth / innerWidth;
      const box = r ?? { x: 0, y: 0, w: innerWidth, h: innerHeight };
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(box.w * scale);
      canvas.height = Math.round(box.h * scale);
      canvas
        .getContext("2d")!
        .drawImage(
          img,
          box.x * scale,
          box.y * scale,
          canvas.width,
          canvas.height,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      return canvas.toDataURL("image/png").split(",")[1];
    },
    full,
    rect,
  );
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(png, "base64"));
}

async function click(selector: string): Promise<void> {
  await browser.execute((s: string) => {
    const el = document.querySelector(s) as HTMLElement | null;
    if (!el) throw new Error(`No ${s}`);
    el.click();
  }, selector);
  await pause(400);
}

/** Click the element matching `selector` whose text is `text`. */
async function clickText(selector: string, text: string): Promise<void> {
  await browser.execute(
    (s: string, t: string) => {
      const el = Array.from(document.querySelectorAll(s)).find(
        (e) => e.textContent?.trim() === t,
      ) as HTMLElement | undefined;
      if (!el) throw new Error(`No ${s} with "${t}"`);
      el.click();
    },
    selector,
    text,
  );
  await pause(400);
}

async function escape(times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await browser.keys("Escape");
    await pause(200);
  }
}

// --- Obsidian state ------------------------------------------------------

async function setup(port: number): Promise<void> {
  // The "What's New" note opens shortly after start-up.
  await browser
    .$(".voice-whats-new-modal")
    .waitForExist({ timeout: 10000 })
    .catch(() => null);
  // The MP3s are written straight into the sandbox vault's folder (too big
  // to hand over to the page); Obsidian picks them up.
  const base: string = await obsidian((app) => app.vault.adapter.basePath);
  for (const dir of [FOLDER, "Archive"]) {
    fs.mkdirSync(path.join(base, dir), { recursive: true });
  }
  for (const [name, minutes] of CHAPTERS) {
    fs.writeFileSync(
      path.join(base, FOLDER, `${name}.mp3`),
      silentMp3(minutes),
    );
  }
  fs.writeFileSync(
    path.join(base, "Archive", `${CHAPTERS[3][0]}.mp3`),
    silentMp3(0.5),
  );
  await browser.waitUntil(
    () =>
      obsidian(
        (app, _plugin, folder, names) =>
          names.every((n: string) =>
            app.vault.getAbstractFileByPath(`${folder}/${n}.mp3`),
          ),
        FOLDER,
        CHAPTERS.map(([name]) => name),
      ),
    {
      timeout: 15000,
      timeoutMsg: "The sample MP3s didn't show up in the vault",
    },
  );
  await obsidian(
    async (app, plugin, chapters, folder, port, bookmarks, more) => {
      Object.assign(plugin.settings, {
        TTS_PROVIDER: "openai",
        OPENAI_VOICE: "alloy",
        OPENAI_COMPAT_BASE_URL: `http://127.0.0.1:${port}/v1`,
        OPENAI_COMPAT_VOICE: "alloy",
        OPENAI_COMPAT_MODEL: "tts-1",
        SPEED: 1,
        favoriteAudioFolders: [`${folder}/Audio`, "Archive"],
      });
      await plugin.saveSettings();
      plugin.reinitializeProvider();
      // Obsidian's own menus (not the system's), so they show in pictures.
      app.vault.setConfig("nativeMenus", false);
      const vault = app.vault;
      for (const dir of [
        folder,
        `${folder}/Audio`,
        "Archive",
        "Inbox",
        "Projects",
      ]) {
        if (!vault.getAbstractFileByPath(dir)) await vault.createFolder(dir);
      }
      for (const [name, , text] of chapters) {
        await vault.create(`${folder}/${name}.md`, `${text}\n\n${more}\n`);
      }
      await vault.create(
        "Inbox/Reading list.md",
        "# Reading list\n\n- Deep Work, chapter 3\n- Notes on attention\n",
      );
      const target = { kind: "file", path: `${folder}/${chapters[1][0]}.mp3` };
      for (const [seconds, title] of bookmarks) {
        const { bookmark } = await plugin.bookmarks.add(target, seconds * 1000);
        await plugin.bookmarks.rename(target, bookmark.id, title);
      }
      await plugin.bookmarks.flush(true);
    },
    CHAPTERS,
    FOLDER,
    port,
    BOOKMARKS,
    MORE_TEXT,
  );
  await pause(500);
}

async function openNote(name: string): Promise<void> {
  await obsidian(async (app, _plugin, file) => {
    const f = app.vault.getAbstractFileByPath(file);
    await app.workspace.getLeaf(false).openFile(f);
  }, name);
  await pause(600);
}

/** Drag the right sidebar's edge so the player is wider (desktop). */
async function widenSidebar(by: number): Promise<void> {
  const handle = await browser.$(
    ".mod-right-split > .workspace-leaf-resize-handle",
  );
  if (!(await handle.isExisting())) return;
  const loc = await handle.getLocation();
  const size = await handle.getSize();
  const x = Math.round(loc.x + size.width / 2);
  const y = Math.round(loc.y + size.height / 2);
  await browser
    .action("pointer")
    .move({ x, y })
    .down()
    .move({ x: x - by, y, duration: 300 })
    .up()
    .move({ x: 600, y: 500 })
    .perform();
  await pause(400);
}

async function openPlayer(): Promise<void> {
  await obsidian(async (app, plugin) => {
    await plugin.activatePlayerView();
  });
  await pause(900);
}

const view = `app.workspace.getLeavesOfType("voice-player-view")[0].view`;

/** Load a chapter, mute it, and leave it paused at `seconds`. */
async function loadChapter(
  index: number,
  seconds: number,
  play = false,
): Promise<void> {
  await obsidian(
    async (app, plugin, file, at, keepPlaying) => {
      const audio = plugin.getSpeechProvider().getAudio();
      audio.muted = true;
      app.workspace
        .getLeavesOfType("voice-player-view")[0]
        .view.playChapter(file, at);
      await new Promise((r) => setTimeout(r, 900));
      audio.currentTime = at;
      if (!keepPlaying) audio.pause();
    },
    `${FOLDER}/${CHAPTERS[index][0]}.mp3`,
    seconds,
    play,
  );
  await pause(700);
}

/** Read through the stand-in server (OpenAI-compatible). */
async function useServer(port: number): Promise<void> {
  await obsidian(async (_app, plugin, p) => {
    Object.assign(plugin.settings, {
      TTS_PROVIDER: "openai-compatible",
      OPENAI_COMPAT_BASE_URL: `http://127.0.0.1:${p}/v1`,
    });
    await plugin.saveSettings();
    plugin.reinitializeProvider();
    plugin.getSpeechProvider().getAudio().muted = true;
  }, port);
  await pause(300);
}

/** Back to OpenAI in the pickers (nothing is sent: no key is set). */
async function useOpenAi(): Promise<void> {
  await obsidian(async (_app, plugin) => {
    plugin.settings.TTS_PROVIDER = "openai";
    await plugin.saveSettings();
    plugin.reinitializeProvider();
    plugin.getSpeechProvider().getAudio().muted = true;
  });
  await pause(300);
}

// --- The screenshots -----------------------------------------------------

describe("User Guide screenshots (Integration)", function () {
  let server: http.Server;

  before(async function () {
    fs.mkdirSync(OUT, { recursive: true });
    server = await startTtsServer();
    await setup((server.address() as AddressInfo).port);
  });

  after(async function () {
    server?.close();
  });

  it("captures the desktop", async function () {
    if (await isMobile()) return;

    // What's New, as it greets you after an update.
    if (await browser.$(".voice-whats-new-modal").isExisting()) {
      await calm();
      await shot("whats-new", ".modal-container .modal", 0);
    }
    await escape(3);

    // The sandbox vault's random name isn't part of the picture.
    await hide([".workspace-sidedock-vault-profile"]);

    // The workspace: a note, the player in the sidebar, the status bar.
    await openNote(`${FOLDER}/${CHAPTERS[1][0]}.md`);
    await openPlayer();
    await widenSidebar(70);
    await loadChapter(1, 212);
    await removeNotices();
    await calm();
    await shot("workspace");
    // The status bar floats over the sidebar; it has pictures of its own.
    await hide([".workspace-sidedock-vault-profile", ".status-bar"]);
    await shot(
      "ribbon",
      [
        '.side-dock-ribbon-action[aria-label="Voice read text"]',
        '.side-dock-ribbon-action[aria-label="Open Voice player"]',
      ],
      10,
    );

    // The player and its parts.
    await shot(
      "player",
      [`${PLAYER} .voice-player-header`, `${PLAYER} .voice-player-chapters`],
      14,
    );
    await shot("player-controls", [
      `${PLAYER} .voice-player-header`,
      `${PLAYER} .voice-player-transport`,
      `${PLAYER} .voice-player-secondary`,
    ]);
    await shot("player-toggles", `${PLAYER} .voice-player-toggles`);
    await shot("player-pickers", [
      `${PLAYER} .voice-player-options`,
      `${PLAYER} .voice-player-folder`,
    ]);
    await shot("chapters", `${PLAYER} .voice-player-chapters`);

    // Generating (a slow stand-in server): the ring around play, the bar
    // with its ✕, the status bar, and the question before stopping.
    serverDelayMs = 20000;
    await useServer((server.address() as AddressInfo).port);
    await obsidian((_app, plugin) => {
      void plugin.speakText();
    });
    await pause(3500);
    await shot("player-generating", `${PLAYER} .voice-player-transport`, 14);
    await shot("player-generating-bar", `${PLAYER} .voice-player-loading`, 6);
    await hide([".workspace-sidedock-vault-profile"]);
    await shot("status-bar-generating", ".status-bar", 0);
    await hide([".workspace-sidedock-vault-profile", ".status-bar"]);
    await obsidian((_app, plugin) => {
      void plugin.confirmCancelGeneration();
    });
    await pause(600);
    await calm();
    await shot("cancel-generation", ".modal-container .modal", 0);
    await clickText(".modal button", "Stop generating");
    serverDelayMs = 0;
    await useOpenAi();
    await loadChapter(1, 212);

    // Status bar and its menus.
    await hide([".workspace-sidedock-vault-profile"]);
    await shot("status-bar", ".status-bar", 0);
    await realClick(".status-bar-speed-display");
    await shot(
      "status-bar-speed-menu",
      [".menu", ".status-bar-speed-display"],
      8,
    );
    await escape();
    await realClick(".voice-statusbar-voice-switcher");
    await shot(
      "status-bar-voice-menu",
      [".menu", ".voice-statusbar-voice-switcher"],
      8,
    );
    await escape();
    await hide([".workspace-sidedock-vault-profile", ".status-bar"]);

    // Chapters: the ⋮ bar, delete confirmation, rename in place.
    const row = (i: number) =>
      `${PLAYER} .voice-player-chapter[data-path="${FOLDER}/${CHAPTERS[i][0]}.mp3"]`;
    await click(`${row(2)} .voice-player-chapter-edit`);
    await shot("chapter-actions", `${PLAYER} .voice-player-chapters`);
    await clickText(`${PLAYER} .voice-player-chapter-action`, "Delete");
    await shot("chapter-delete", `${PLAYER} .voice-player-chapters`);
    await escape();
    await click(`${row(2)} .voice-player-chapter-edit`);
    await clickText(`${PLAYER} .voice-player-chapter-action`, "Rename");
    await pause(300);
    await shot("chapter-rename", `${PLAYER} .voice-player-chapters`);
    await escape();

    // Bookmarks: list, marks, the ⋮ of a bookmark, adding one.
    await obsidian((app, _plugin, file) => {
      app.workspace
        .getLeavesOfType("voice-player-view")[0]
        .view.showBookmarks(file);
    }, `${FOLDER}/${CHAPTERS[1][0]}.mp3`);
    await pause(600);
    await calm();
    await shot(
      "bookmarks",
      [`${PLAYER} .voice-player-header`, `${PLAYER} .voice-player-chapters`],
      14,
    );
    await shot("bookmark-marks", [
      `${PLAYER} .voice-player-header`,
      `${PLAYER} .voice-player-scrubber-wrap`,
    ]);
    await shot("bookmark-list", `${PLAYER} .voice-player-chapters`);
    await click(`${PLAYER} .voice-player-bookmark .voice-player-chapter-edit`);
    await shot("bookmark-actions", `${PLAYER} .voice-player-bookmarks`, 6);
    await escape();
    await obsidian((app) => {
      app.plugins.plugins.voice
        .getSpeechProvider()
        .getAudio().currentTime = 331;
    });
    await obsidian((app) => {
      app.commands.executeCommandById("voice:add-bookmark");
    });
    await pause(700);
    await shot("bookmark-notice", ".notice", 2);
    await removeNotices();
    await shot("bookmark-added", [
      `${PLAYER} .voice-player-header`,
      `${PLAYER} .voice-player-chapters`,
    ]);

    // Saving: the folder picker with a default (📌) and favorites (⭐).
    await obsidian(async (_app, plugin, folder) => {
      plugin.settings.defaultAudioFolder = `${folder}/Audio`;
      await plugin.saveSettings();
      plugin.refreshVoicePlayerControls();
    }, FOLDER);
    await pause(500);
    await shot("save-default-folder", `${PLAYER} .voice-player-secondary`);
    await click(`${PLAYER} .voice-player-folder-btn`);
    await pause(500);
    await calm();
    await shot(
      "folder-picker",
      [".modal-container .prompt", ".modal-container .modal"],
      0,
    );
    await escape();

    // Moving a chapter into a folder that has a file of that name.
    await click(`${row(3)} .voice-player-chapter-edit`);
    await clickText(`${PLAYER} .voice-player-chapter-action`, "Move");
    await pause(500);
    await browser.keys("Archive");
    await pause(400);
    await browser.keys("Enter");
    await pause(700);
    await calm();
    await shot("file-conflict", ".modal-container .modal", 0);
    await clickText(".modal button", "Cancel");

    // A note with its audio embedded.
    await obsidian(
      async (app, _plugin, folder, name) => {
        const file = app.vault.getAbstractFileByPath(`${folder}/${name}.md`);
        const text = await app.vault.read(file);
        await app.vault.modify(file, `![[${name}.mp3]]\n\n${text}`);
      },
      FOLDER,
      CHAPTERS[0][0],
    );
    await openNote(`${FOLDER}/${CHAPTERS[0][0]}.md`);
    await calm();
    await hide([".workspace-sidedock-vault-profile", ".status-bar"]);
    await shot("embedded-audio", ".workspace-leaf.mod-active .view-content", 0);
    await hide([".workspace-sidedock-vault-profile"]);

    // Command palette.
    await obsidian((app) => {
      app.commands.executeCommandById("command-palette:open");
    });
    await pause(400);
    await browser.keys("Voice:");
    await pause(500);
    await shot("command-palette", ".modal-container .prompt", 0);
    await escape();

    // An error: the server can't be reached.
    await obsidian(async (_app, plugin) => {
      plugin.settings.TTS_PROVIDER = "openai-compatible";
      plugin.settings.OPENAI_COMPAT_BASE_URL = "http://127.0.0.1:65531/v1";
      await plugin.saveSettings();
      plugin.reinitializeProvider();
    });
    await obsidian((_app, plugin) => {
      void plugin.speakText();
    });
    await hide([".workspace-sidedock-vault-profile"]);
    await pause(1500);
    await shot("error-notice", ".notice", 2);
    await shot("error-status-bar", ".status-bar", 0);
    await removeNotices();
  });

  it("captures the settings", async function () {
    if (await isMobile()) return;
    await obsidian(
      async (app, plugin, port) => {
        plugin.settings.TTS_PROVIDER = "openai";
        plugin.settings.OPENAI_COMPAT_BASE_URL = `http://127.0.0.1:${port}/v1`;
        await plugin.saveSettings();
        plugin.reinitializeProvider();
        app.setting.open();
        app.setting.openTabById("voice");
      },
      (server.address() as AddressInfo).port,
    );
    await windowWith(".vertical-tab-content");
    await pause(800);

    /** Scroll a heading (by its name) to the top and capture until the next one. */
    const section = async (name: string, heading: string, until?: string) => {
      const rect: Rect = await browser.execute(
        (h: string, u: string | null) => {
          const items = Array.from(
            document.querySelectorAll(".vertical-tab-content .setting-item"),
          );
          const start = items.findIndex(
            (el) => el.querySelector(".setting-item-name")?.textContent === h,
          );
          if (start < 0) {
            const names = items
              .map((el) => el.querySelector(".setting-item-name")?.textContent)
              .join(" | ");
            throw new Error(
              `No setting ${h} in: ${names.slice(0, 600)} (${location.href})`,
            );
          }
          (items[start] as HTMLElement).scrollIntoView({ block: "start" });
          let end = items.length;
          for (let i = start + 1; i < items.length; i++) {
            const isHeading = items[i].classList.contains(
              "setting-item-heading",
            );
            const nameText =
              items[i].querySelector(".setting-item-name")?.textContent;
            if ((u === null && isHeading) || nameText === u) {
              end = i;
              break;
            }
          }
          const first = items[start].getBoundingClientRect();
          const last = items[end - 1].getBoundingClientRect();
          const pane = document
            .querySelector(".vertical-tab-content")!
            .getBoundingClientRect();
          return {
            x: pane.left,
            y: first.top - 8,
            w: pane.width,
            h: Math.min(innerHeight, last.bottom + 12) - first.top + 8,
          };
        },
        heading,
        until ?? null,
      );
      await calm();
      await shot(name, rect);
    };

    const provider = async (id: string) => {
      await browser.execute((value: string) => {
        const select = Array.from(
          document.querySelectorAll(".vertical-tab-content .setting-item"),
        )
          .find(
            (el) =>
              el.querySelector(".setting-item-name")?.textContent ===
              "Speech provider",
          )
          ?.querySelector("select") as HTMLSelectElement;
        select.value = value;
        select.dispatchEvent(new Event("change"));
      }, id);
      await pause(800);
    };

    await section("settings-provider", "Speech provider", "Playback");
    await section("settings-playback", "Playback", "Saving audio");
    await section("settings-saving", "Saving audio", "Player");
    await section("settings-player", "Player");

    const providers: [string, string, string][] = [
      ["aws", "AWS", "provider-aws-polly"],
      ["elevenlabs", "ElevenLabs", "provider-elevenlabs"],
      ["openai", "OpenAI", "provider-openai"],
      ["google", "Google Cloud", "provider-google-cloud"],
      ["azure", "Azure Speech", "provider-azure-speech"],
      ["minimax", "MiniMax", "provider-minimax"],
      [
        "openai-compatible",
        "OpenAI-compatible server",
        "provider-openai-compatible",
      ],
    ];
    for (const [id, heading, file] of providers) {
      await provider(id);
      await section(file, heading);
    }

    await section("settings-profiles", "Speech profiles");
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
    await windowWith(".voice-profile-editor");
    await pause(500);
    await calm();
    await shot("profile-editor", ".modal.voice-profile-editor-modal", 0);
    await escape();

    // Hotkeys, filtered to Voice.
    await windowWith(".vertical-tab-content");
    await windowWith(".workspace");
    await obsidian((app) => {
      app.setting.openTabById("hotkeys");
    });
    await windowWith(".vertical-tab-content");
    await pause(600);
    await browser.execute(() => {
      const input = document.querySelector(
        ".vertical-tab-content input[type=search], .vertical-tab-content input",
      ) as HTMLInputElement;
      input.value = "Voice";
      input.dispatchEvent(new Event("input"));
    });
    await pause(600);
    await calm();
    await shot("hotkeys", ".vertical-tab-content", 0);
  });

  it("captures mobile", async function () {
    if (!(await isMobile())) return;
    await escape(3);
    await openNote(`${FOLDER}/${CHAPTERS[1][0]}.md`);
    await openPlayer();
    await escape(2);
    await openPlayer();
    await loadChapter(1, 212);
    await obsidian((app, _plugin, file) => {
      app.workspace
        .getLeavesOfType("voice-player-view")[0]
        .view.showBookmarks(file);
    }, `${FOLDER}/${CHAPTERS[1][0]}.mp3`);
    await removeNotices();
    await calm();
    await shot("mobile-player", ".workspace-drawer.mod-right", 0);

    // The control bar shows while a note is read and the player is closed.
    await obsidian(
      async (app, plugin, port) => {
        plugin.getSpeechProvider().getAudio().pause();
        app.workspace.detachLeavesOfType("voice-player-view");
        app.workspace.rightSplit?.collapse?.();
        Object.assign(plugin.settings, {
          TTS_PROVIDER: "openai-compatible",
          OPENAI_COMPAT_BASE_URL: `http://127.0.0.1:${port}/v1`,
        });
        await plugin.saveSettings();
        plugin.reinitializeProvider();
        plugin.getSpeechProvider().getAudio().muted = true;
      },
      (server.address() as AddressInfo).port,
    );
    await openNote(`${FOLDER}/${CHAPTERS[0][0]}.md`);
    await obsidian((_app, plugin) => {
      void plugin.speakText();
    });
    await pause(2500);
    await calm();
    await shot("mobile-control-bar", ".voice-mobile-overlay", 6);
    await shot("mobile-note", undefined);
  });
});
