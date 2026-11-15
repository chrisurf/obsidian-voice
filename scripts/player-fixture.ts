/**
 * Writes a standalone page with the Voice player's controls for layout checks
 * in browsers outside Obsidian (iOS Simulator Safari, see
 * scripts/ios-layout-check.mjs). It uses the plugin's real styles.css and icon
 * artwork, mirrors the control markup of VoicePlayerView.buildUi(), and adds a
 * deliberately hostile stand-in for Obsidian's per-platform <button> rules, so
 * the page shows whether the controls hold their shape against them.
 *
 * The authoritative check is the snapshot the e2e spec exports from a real
 * Obsidian (test/specs/player-layout.e2e.ts); this fixture needs no Obsidian.
 *
 * Usage: npx tsx scripts/player-fixture.ts [out.html] [--demo|--readme|--mobile-bar]
 *
 * --demo makes the controls interactive (scripts/player-demo.ts: the real
 * press gesture and icons), to try tap vs. hold in a browser.
 * --readme renders one player filling the page (sample chapters, selectors),
 * and --mobile-bar the mobile control bar, for the README screenshots.
 *
 * VOICE_FIXTURE_LEGACY=1 renders the controls the way 1.19.0 did (no .voice-ctl,
 * with styles from VOICE_FIXTURE_STYLES, e.g. `git show main:styles.css`), as a
 * control run proving the check catches the squeezed iPad controls.
 */

import * as fs from "fs";
import * as path from "path";
import { buildSync } from "esbuild";
import {
  VOICE_ICONS,
  type VoiceIconName,
  type VoiceIconShape,
} from "../src/ui/icons";

const root = path.resolve(__dirname, "..");
const out = path.resolve(
  process.argv.slice(2).find((a) => !a.startsWith("--")) ??
    "test/artifacts/player-layout/fixture.html",
);

function icon(name: VoiceIconName): string {
  const paths = (VOICE_ICONS[name] as VoiceIconShape[])
    .map((s) => `<path d="${s.d}"${s.fill ? ' class="voice-icon-fill"' : ""}/>`)
    .join("");
  return `<svg class="voice-icon" data-icon="${name}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}

const legacy = process.env.VOICE_FIXTURE_LEGACY === "1";
const demo = process.argv.includes("--demo");
const readme = process.argv.includes("--readme");
const mobileBar = process.argv.includes("--mobile-bar");
// VOICE_FIXTURE_LOADING=40 shows the play button generating at 40 % (0 = the
// spinning arc used before any progress is known).
const loading = process.env.VOICE_FIXTURE_LOADING;

function button(cls: string, name: VoiceIconName, extra = ""): string {
  return `<button class="${legacy ? "" : "voice-ctl "}${cls}" aria-label="${name}">${icon(name)}${extra}</button>`;
}

const SAMPLE_CHAPTERS = [
  "00 — Welcome to Voice",
  "01 — The Case for Deep Focus",
  "02 — Rituals and Routines",
  "03 — Training Your Attention",
  "04 — Deep Work — A Field Guide",
  "05 — Feature Demo — Code, Links & Acronyms",
];

function select(label: string): string {
  return `<select class="voice-player-select dropdown"><option>${label}</option></select>`;
}

function player(): string {
  const toggle = (name: VoiceIconName, caption: string, active = false) =>
    button(
      `voice-player-toggle${active ? " is-active" : ""}`,
      name,
      `<span class="voice-player-toggle-caption">${caption}</span>`,
    );
  return `
<div class="view-content voice-player">
  <div class="voice-player-header">
    <div class="voice-player-title">${readme ? "00 — Welcome to Voice" : "Projektplan — Ziele &amp; Aufgaben"}</div>
    <div class="voice-player-subtitle">${readme ? "6 chapters" : "1 chapter"}</div>
  </div>
  <div class="voice-player-seek">
    <span class="voice-player-time">${readme ? "0:21" : "0:00"}</span>
    <input class="voice-player-scrubber" type="range" min="0" max="100" value="${readme ? 32 : 0}">
    <span class="voice-player-time">${readme ? "1:05" : "0:00"}</span>
  </div>
  <div class="voice-player-transport">
    ${button("voice-player-btn voice-player-track", "skip-back")}
    ${button("voice-player-btn voice-player-skip", "seek-back", '<span class="voice-player-skip-label">15</span>')}
    ${
      loading !== undefined
        ? button(
            "voice-player-btn voice-player-play is-loading",
            "stop",
            `<span class="voice-play-ring${Number(loading) <= 0 ? " is-indeterminate" : ""}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="voice-play-ring-track" cx="50" cy="50" r="47" pathLength="100"/><circle class="voice-play-ring-value" cx="50" cy="50" r="47" pathLength="100" stroke-dasharray="${Number(loading) <= 0 ? 22 : loading} 100"/></svg></span>`,
          )
        : button(
            "voice-player-btn voice-player-play",
            readme ? "pause" : "play",
          )
    }
    ${button("voice-player-btn voice-player-skip", "seek-forward", '<span class="voice-player-skip-label">30</span>')}
    ${button("voice-player-btn voice-player-track", "skip-forward")}
  </div>
  <div class="voice-player-secondary">
    ${button("voice-player-download", "download")}
    ${button("voice-player-folder-btn is-active", "folder-open")}
    ${button("voice-player-repeat", "repeat")}
    <div class="voice-player-speed">
      ${button("voice-player-speed-btn", "minus")}
      <span class="voice-player-speed-value">${readme ? "1.1×" : "1.0×"}</span>
      ${button("voice-player-speed-btn", "plus")}
    </div>
  </div>
  <div class="voice-player-toggles">
    ${toggle("cache", "Cache", true).replace("voice-player-toggle", "voice-player-toggle voice-player-cache")}
    ${toggle("acronym", "Spell", true)}
    ${toggle("code", "Code")}
    ${toggle("link-off", "No URLs", true)}
    ${toggle("embed", "Embed")}
  </div>
  ${demo ? '<div class="voice-demo-log">Tap or hold a control …</div>' : ""}
  ${
    readme
      ? `<div class="voice-player-options">${select("AWS Polly")}${select("Daniel (German)")}</div>
  <div class="voice-player-folder">${select("Studies")}</div>`
      : ""
  }
  <div class="voice-player-chapters">
    <div class="voice-player-chapters-title">Chapters</div>
    ${(readme ? SAMPLE_CHAPTERS : ["Kapitel 1"])
      .map(
        (
          name,
          i,
        ) => `<div class="voice-player-chapter${i === 0 ? " is-current" : ""}">
      <span class="voice-player-chapter-index">${i + 1}</span>
      <span class="voice-player-chapter-name">${name.replace("&", "&amp;")}</span>
      <div class="voice-player-chapter-edit" aria-label="Track actions">${icon("more")}</div>
    </div>`,
      )
      .join("")}
  </div>
</div>`;
}

// Obsidian-like theme variables (dark) so styles.css resolves its tokens.
const theme = `
body.theme-dark {
  --interactive-accent: #8a5cf5; --interactive-accent-hsl: 258, 88%, 66%;
  --interactive-accent-hover: #9d76f7; --text-on-accent: #fff;
  --text-normal: #dadada; --text-muted: #a3a3a3; --text-faint: #666;
  --text-accent: #a68af9; --background-primary: #1e1e1e;
  --background-secondary: #262626; --background-secondary-alt: #333;
  --background-modifier-hover: rgba(255, 255, 255, 0.075);
  --background-modifier-active-hover: rgba(138, 92, 245, 0.15);
  --background-modifier-border: #363636; --radius-s: 4px; --radius-m: 8px;
  --font-ui-smaller: 12px;
  margin: 0; padding: 16px; background: #000; color: var(--text-normal);
  font: 15px -apple-system, BlinkMacSystemFont, sans-serif;
}`;

// Hostile stand-in for Obsidian's per-platform button rules: the padding,
// fixed height, background and shadow that squeezed the icons on iPad.
const hostile = `
button:not(.clickable-icon) {
  -webkit-appearance: button; padding: 4px 12px; height: 30px;
  background-color: #3f3f3f; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  border-radius: 4px; font-size: 13px;
}
.is-mobile button:not(.clickable-icon) {
  padding: 0 20px; height: 40px; border-radius: 8px; min-width: 0;
}
.is-mobile.is-tablet button:not(.clickable-icon) { padding: 0 18px; }
/* Obsidian 1.15 draws buttons as squircles: with this, border-radius: 50%
   gives a rounded square, not a circle (Chromium's corner-shape). */
button { corner-shape: squircle; }
.is-mobile svg { width: 16px; height: 16px; }`;

/** The mobile control bar, as MobileControlBar builds it (playing state). */
function mobileControlBar(): string {
  const btn = (name: VoiceIconName, extra = "") =>
    `<button class="voice-mobile-control-btn${extra}">${icon(name)}</button>`;
  return `
<div class="voice-mobile-overlay is-visible">
  <div class="voice-mobile-progress-container visible">
    <div class="voice-mobile-progress-bar" style="--voice-progress:45%"></div>
  </div>
  <div class="voice-mobile-controls">
    ${btn("player")}${btn("mic")}${btn("seek-back")}${btn("stop")}
    <div class="voice-mobile-speed-group">
      ${btn("minus")}<div class="voice-mobile-speed-display">1.1x</div>${btn("plus")}
    </div>
    ${btn("pause", " voice-mobile-primary-btn")}${btn("seek-forward")}${btn("download")}
  </div>
</div>`;
}

// Approximates Obsidian's dark dropdown for the README pages.
const readmeCss = `
body.theme-dark { --interactive-normal: #363636; --nav-item-background: transparent; padding: 0; }
.dropdown { appearance: none; height: 34px; padding: 0 30px 0 12px; border: none;
  border-radius: 6px; color: var(--text-normal); font: inherit; font-size: 14px;
  background: var(--interactive-normal) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23aaa' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 15 5 5 5-5'/%3E%3Cpath d='m7 9 5-5 5 5'/%3E%3C/svg%3E") no-repeat right 10px center; }
.voice-player { width: ${process.env.VOICE_FIXTURE_WIDTH ?? "100%"}; background: var(--background-secondary); min-height: 100vh; box-sizing: border-box; }
.voice-mobile-overlay { width: ${process.env.VOICE_FIXTURE_WIDTH ?? "100%"}; box-sizing: border-box; }
input[type=range] { appearance: none; height: 4px; border-radius: 2px; background: #4a4a4a; }
input[type=range]::-webkit-slider-thumb { appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #e6e6e6; }
.voice-mobile-overlay.is-visible { position: static; display: flex; transform: none; }
`;

/** Bundle scripts/player-demo.ts into one inline script. */
function demoScript(): string {
  const result = buildSync({
    entryPoints: [path.join(__dirname, "player-demo.ts")],
    bundle: true,
    write: false,
    format: "iife",
    target: "safari15",
  });
  return result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
}

const css = fs.readFileSync(
  process.env.VOICE_FIXTURE_STYLES ?? path.join(root, "styles.css"),
  "utf8",
);
const widths = [
  { label: "sidebar 280px", style: "width:280px" },
  { label: "sidebar 340px", style: "width:340px" },
  { label: "full width", style: "width:100%;max-width:640px" },
];
const html = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${readme || mobileBar ? "" : `<style>${hostile}</style>`}
<style>${css}</style>
<style>${theme}
.voice-snapshot { margin: 0 auto 24px; background: var(--background-secondary); border-radius: 12px; }
.voice-snapshot-label { margin: 0 auto 6px; font-size: 12px; color: #888; }
.voice-demo-log { min-height: 1.4em; font-size: 12px; text-align: center; color: var(--text-accent); }
${readme || mobileBar ? readmeCss : ""}
</style></head>
<body class="theme-dark is-mobile is-tablet is-ios">
${
  readme
    ? player()
    : mobileBar
      ? mobileControlBar()
      : widths
          .map(
            (w) =>
              `<div class="voice-snapshot-label" style="${w.style}">${w.label}</div>` +
              `<div class="voice-snapshot" style="${w.style}">${player()}</div>`,
          )
          .join("\n")
}
${demo ? `<script>${demoScript()}</script>` : ""}
</body></html>`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(out);
