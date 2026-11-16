/**
 * Voice's own icon set for its playback controls.
 *
 * Obsidian's `setIcon` draws from the Lucide build bundled with the app, so the
 * same icon id looks different (or is missing) depending on the Obsidian
 * version a device runs, and its stroke width/fill follow Obsidian's and the
 * theme's CSS. The player, the mobile control bar and the status bar draw
 * these icons instead: fixed 24×24 artwork that renders identically on every
 * Obsidian version, platform and theme.
 *
 * Stroke icons are adapted from Lucide (https://lucide.dev, ISC license). The
 * transport glyphs (play, pause, skip, seek) are filled and drawn for Voice.
 */

/** One shape of an icon: an SVG path, filled or stroked. */
export interface VoiceIconShape {
  d: string;
  fill?: boolean;
}

export const VOICE_ICONS = {
  play: [
    {
      d: "M8 4.9v14.2a1.2 1.2 0 0 0 1.8 1l11.3-7.1a1.2 1.2 0 0 0 0-2L9.8 3.9A1.2 1.2 0 0 0 8 4.9z",
      fill: true,
    },
  ],
  pause: [
    {
      d: "M7 4h2.5A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20H7a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 7 4z",
      fill: true,
    },
    {
      d: "M14.5 4H17a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 17 20h-2.5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 14.5 4z",
      fill: true,
    },
  ],
  stop: [
    {
      d: "M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z",
      fill: true,
    },
  ],
  loading: [
    { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" },
    { d: "M3 3v5h5" },
  ],
  "skip-back": [
    {
      d: "M6 4.5a1.25 1.25 0 0 1 1.25 1.25v12.5a1.25 1.25 0 0 1-2.5 0V5.75A1.25 1.25 0 0 1 6 4.5z",
      fill: true,
    },
    {
      d: "M19.5 5.9v12.2a1.1 1.1 0 0 1-1.7.9l-8.9-6.1a1.1 1.1 0 0 1 0-1.8l8.9-6.1a1.1 1.1 0 0 1 1.7.9z",
      fill: true,
    },
  ],
  "skip-forward": [
    {
      d: "M18 4.5a1.25 1.25 0 0 1 1.25 1.25v12.5a1.25 1.25 0 0 1-2.5 0V5.75A1.25 1.25 0 0 1 18 4.5z",
      fill: true,
    },
    {
      d: "M4.5 5.9v12.2a1.1 1.1 0 0 0 1.7.9l8.9-6.1a1.1 1.1 0 0 0 0-1.8L6.2 5a1.1 1.1 0 0 0-1.7.9z",
      fill: true,
    },
  ],
  // Seek back / forward: an open ring with an arrow; the number of seconds is
  // drawn inside it by the button's label.
  "seek-back": [
    { d: "M12 3.5a8.5 8.5 0 1 1-8.5 8.5" },
    { d: "M14.5 1 12 3.5 14.5 6" },
  ],
  "seek-forward": [
    { d: "M12 3.5a8.5 8.5 0 1 0 8.5 8.5" },
    { d: "M9.5 1 12 3.5 9.5 6" },
  ],
  download: [
    { d: "M12 15V3" },
    { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" },
    { d: "m7 10 5 5 5-5" },
  ],
  save: [
    {
      d: "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
    },
    { d: "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" },
    { d: "M7 3v4a1 1 0 0 0 1 1h7" },
  ],
  "folder-open": [
    {
      d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
    },
  ],
  repeat: [
    { d: "m17 2 4 4-4 4" },
    { d: "M3 11v-1a4 4 0 0 1 4-4h14" },
    { d: "m7 22-4-4 4-4" },
    { d: "M21 13v1a4 4 0 0 1-4 4H3" },
  ],
  "repeat-one": [
    { d: "m17 2 4 4-4 4" },
    { d: "M3 11v-1a4 4 0 0 1 4-4h14" },
    { d: "m7 22-4-4 4-4" },
    { d: "M21 13v1a4 4 0 0 1-4 4H3" },
    { d: "M11 10h1v4" },
  ],
  minus: [{ d: "M5 12h14" }],
  plus: [{ d: "M5 12h14" }, { d: "M12 5v14" }],
  code: [{ d: "m16 18 6-6-6-6" }, { d: "m8 6-6 6 6 6" }],
  acronym: [
    { d: "m3 15 4-8 4 8" },
    { d: "M4 13h6" },
    { d: "M15 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0" },
    { d: "M21 9v6" },
  ],
  "link-off": [
    {
      d: "m18.84 12.25 1.72-1.71h-.02a5 5 0 0 0-.12-7.07 5 5 0 0 0-6.95 0l-1.72 1.71",
    },
    {
      d: "m5.17 11.75-1.71 1.71a5 5 0 0 0 .12 7.07 5 5 0 0 0 6.95 0l1.71-1.71",
    },
    { d: "M8 2v3" },
    { d: "M2 8h3" },
    { d: "M16 19v3" },
    { d: "M19 16h3" },
  ],
  embed: [
    {
      d: "m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48",
    },
  ],
  // A stack of discs (a database): audio kept for reuse.
  cache: [
    { d: "M3 5a9 3 0 1 0 18 0 9 3 0 1 0-18 0" },
    { d: "M3 5v14a9 3 0 0 0 18 0V5" },
    { d: "M3 12a9 3 0 0 0 18 0" },
  ],
  more: [
    { d: "M12 3.5a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5z", fill: true },
    {
      d: "M12 10.25a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5z",
      fill: true,
    },
    { d: "M12 17a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5z", fill: true },
  ],
  mic: [
    { d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" },
    { d: "M19 10v2a7 7 0 0 1-14 0v-2" },
    { d: "M12 19v3" },
  ],
  player: [
    { d: "M2 10v3" },
    { d: "M6 6v11" },
    { d: "M10 3v18" },
    { d: "M14 8v7" },
    { d: "M18 5v13" },
    { d: "M22 10v3" },
  ],
  close: [{ d: "M18 6 6 18" }, { d: "m6 6 12 12" }],
} satisfies Record<string, VoiceIconShape[]>;

export type VoiceIconName = keyof typeof VOICE_ICONS;

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Draw a Voice icon into `parent`, replacing an icon drawn there before. Other
 * children (e.g. the seconds label on the seek buttons) are kept, and the icon
 * is always the first child.
 */
export function setVoiceIcon(parent: HTMLElement, name: VoiceIconName): void {
  const existing = parent.querySelector(":scope > svg");
  if (existing?.getAttribute("data-icon") === name) {
    return;
  }
  // The element's own document, so icons also work in popout windows.
  const doc = parent.ownerDocument;
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "voice-icon");
  svg.setAttribute("data-icon", name);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const shape of VOICE_ICONS[name] as VoiceIconShape[]) {
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("d", shape.d);
    if (shape.fill) {
      path.setAttribute("class", "voice-icon-fill");
    }
    svg.appendChild(path);
  }
  if (existing) {
    existing.replaceWith(svg);
  } else {
    parent.prepend(svg);
  }
}
