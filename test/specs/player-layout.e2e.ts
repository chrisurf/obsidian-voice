/**
 * Layout checks for the Voice player's controls against a real, sandboxed
 * Obsidian (see wdio.conf.mts). Obsidian's own stylesheet styles every
 * <button> differently per platform (desktop / phone / tablet), so the player's
 * round controls can only be validated where that stylesheet is live.
 *
 * Besides asserting the geometry it writes, per capability, a screenshot and a
 * self-contained HTML snapshot of the rendered player (Obsidian's CSS + the
 * plugin CSS + the player DOM) to VOICE_LAYOUT_OUT. The snapshot lets the same
 * markup be rendered in Mobile Safari (iOS Simulator), the engine Obsidian uses
 * on iPhone and iPad (see scripts/ios-layout-check.mjs).
 */

import * as fs from "fs";
import * as path from "path";

declare const browser: any;
declare const expect: any;
declare function describe(title: string, fn: () => void): void;
declare function it(title: string, fn: () => void | Promise<void>): void;
declare function before(fn: () => void | Promise<void>): void;

const PLUGIN_ID = "voice";
const VIEW_TYPE = "voice-player-view";
const OUT_DIR = path.resolve(
  process.env.VOICE_LAYOUT_OUT ?? "test/artifacts/player-layout",
);

interface ControlMetrics {
  label: string;
  cls: string;
  width: number;
  height: number;
  radius: string;
  /** Computed "corner-shape" (Chromium): only "superellipse(1)" is round. */
  corner: string;
  iconWidth: number;
  iconHeight: number;
}

interface PlayerMetrics {
  bodyClass: string;
  paneWidth: number;
  rowsOverflow: string[];
  controls: ControlMetrics[];
}

/** Open the player in the right sidebar and wait until its controls exist. */
async function openPlayer(): Promise<void> {
  await browser.executeObsidian(
    async ({ app }, id: string, viewType: string) => {
      const a = app as unknown as {
        plugins: {
          enabledPlugins: Set<string>;
          enablePlugin(id: string): Promise<void>;
        };
      };
      if (!a.plugins.enabledPlugins.has(id)) {
        await a.plugins.enablePlugin(id);
      }
      let leaf = app.workspace.getLeavesOfType(viewType)[0];
      if (!leaf) {
        leaf = app.workspace.getRightLeaf(false)!;
        await leaf.setViewState({ type: viewType, active: true });
      }
      await app.workspace.revealLeaf(leaf);
    },
    PLUGIN_ID,
    VIEW_TYPE,
  );
  await browser.$(".voice-player .voice-player-play svg").waitForExist();
}

/** Measure every control button in the player and its icon. */
async function measurePlayer(): Promise<PlayerMetrics> {
  return browser.execute(() => {
    const root = document.querySelector(".voice-player") as HTMLElement;
    const rowsOverflow = Array.from(
      root.querySelectorAll<HTMLElement>(
        ".voice-player-transport, .voice-player-secondary, .voice-player-toggles",
      ),
    )
      .filter((row) => row.scrollWidth > row.clientWidth + 1)
      .map((row) => row.className);
    const controls = Array.from(
      root.querySelectorAll<HTMLElement>(
        ".voice-player-transport button, .voice-player-secondary button, .voice-player-toggles button",
      ),
    ).map((btn) => {
      const rect = btn.getBoundingClientRect();
      const svg = btn.querySelector("svg");
      const svgRect = svg?.getBoundingClientRect();
      return {
        label: btn.getAttribute("aria-label") ?? "",
        cls: btn.className,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        radius: getComputedStyle(btn).borderRadius,
        corner: getComputedStyle(btn).getPropertyValue("corner-shape"),
        iconWidth: svgRect ? Math.round(svgRect.width * 10) / 10 : 0,
        iconHeight: svgRect ? Math.round(svgRect.height * 10) / 10 : 0,
      };
    });
    return {
      bodyClass: document.body.className,
      paneWidth: Math.round(root.getBoundingClientRect().width),
      rowsOverflow,
      controls,
    };
  });
}

/**
 * Serialize the rendered player into a standalone page: every stylesheet
 * Obsidian has loaded (its app.css, the theme, plugin styles), the <html> and
 * <body> classes that select the platform rules, and the player markup at the
 * width it had in the pane.
 */
async function snapshotPlayer(): Promise<string> {
  return browser.execute(() => {
    const css = Array.from(document.styleSheets)
      .map((sheet) => {
        try {
          return Array.from(sheet.cssRules)
            .map((rule) => rule.cssText)
            .join("\n");
        } catch {
          return "";
        }
      })
      .join("\n");
    const root = document.querySelector(".voice-player") as HTMLElement;
    const width = Math.round(root.getBoundingClientRect().width);
    const escape = (s: string) => s.replace(/<\/style/gi, "<\\/style");
    return [
      "<!doctype html>",
      `<html class="${document.documentElement.className}">`,
      '<head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<style>${escape(css)}</style>`,
      "<style>body{overflow:auto!important}" +
        ".voice-snapshot{margin:16px auto;background:var(--background-secondary);" +
        "border-radius:12px}</style>",
      "</head>",
      `<body class="${document.body.className}">`,
      `<div class="voice-snapshot" style="width:${width}px">`,
      `<div class="workspace-leaf-content" data-type="voice-player-view">`,
      root.outerHTML,
      "</div></div></body></html>",
    ].join("\n");
  });
}

describe("Voice player layout (Integration)", function () {
  let tag = "";

  before(async function () {
    await openPlayer();
    const metrics = await measurePlayer();
    const mobile = metrics.bodyClass.includes("is-mobile");
    const kind = metrics.bodyClass.includes("is-phone")
      ? "phone"
      : metrics.bodyClass.includes("is-tablet")
        ? "tablet"
        : mobile
          ? "mobile"
          : "desktop";
    const viewport: string = await browser.execute(
      () => `${window.innerWidth}x${window.innerHeight}`,
    );
    const version: string = await browser.executeObsidian(
      ({ obsidian }) => obsidian.apiVersion,
    );
    tag = `${version}-${kind}-${viewport}`;
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  it("renders every control at its size with a visible icon", async function () {
    const metrics = await measurePlayer();
    fs.writeFileSync(
      path.join(OUT_DIR, `${tag}.json`),
      JSON.stringify(metrics, null, 2),
    );
    fs.writeFileSync(path.join(OUT_DIR, `${tag}.html`), await snapshotPlayer());
    await browser
      .$(".voice-player")
      .saveScreenshot(path.join(OUT_DIR, `${tag}.png`));

    for (const c of metrics.controls) {
      const name = `${c.label || c.cls} (${tag})`;
      expect({
        name,
        iconVisible: c.iconWidth >= 12 && c.iconHeight >= 12,
      }).toEqual({ name, iconVisible: true });
      // Every control except the reading-toggle segments is a circle.
      if (!c.cls.includes("voice-player-toggle")) {
        const round =
          Math.abs(c.width - c.height) <= 1 &&
          c.radius.startsWith("50%") &&
          // "round" computes to superellipse(1); squircle is superellipse(2).
          (c.corner === "" || /^(round|superellipse\(1\))$/.test(c.corner));
        expect({ name, round }).toEqual({ name, round: true });
      }
    }
    expect(metrics.rowsOverflow).toEqual([]);
  });
});
