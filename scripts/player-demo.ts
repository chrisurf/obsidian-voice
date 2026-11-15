/**
 * Interactive behaviour for the player fixture page (scripts/player-fixture.ts
 * with --demo): wires the plugin's real play-tap logic (src/utils/playTap.ts),
 * press gesture (src/utils/pressGesture.ts) and icon set to the fixture's
 * controls, so they can be tried in any browser — e.g. Safari on an iPad — without Obsidian. Nothing is synthesized;
 * a small log line shows which action fired.
 */

import { attachPressGesture } from "../src/utils/pressGesture";
import { setVoiceIcon } from "../src/ui/icons";
import { resolvePlayTap } from "../src/utils/playTap";

// Minimal stand-ins for the DOM helpers Obsidian adds to HTMLElement.
const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
proto.addClass = function (this: HTMLElement, ...cls: string[]) {
  this.classList.add(...cls);
};
proto.removeClass = function (this: HTMLElement, ...cls: string[]) {
  this.classList.remove(...cls);
};
proto.toggleClass = function (this: HTMLElement, cls: string, on: boolean) {
  this.classList.toggle(cls, on);
};
proto.hasClass = function (this: HTMLElement, cls: string) {
  return this.classList.contains(cls);
};
proto.setCssProps = function (
  this: HTMLElement,
  props: Record<string, string>,
) {
  for (const [k, v] of Object.entries(props)) {
    this.style.setProperty(k, v);
  }
};

function log(root: HTMLElement, text: string): void {
  const el = root.querySelector<HTMLElement>(".voice-demo-log");
  if (el) {
    el.textContent = `${new Date().toLocaleTimeString()} · ${text}`;
  }
}

function wire(root: HTMLElement): void {
  const $ = (sel: string) => root.querySelector<HTMLElement>(sel)!;
  const play = $(".voice-player-play");
  const cache = $(".voice-player-cache");
  // Simulated player state, fed through the plugin's real tap logic.
  let playing = false;
  let pausedMidTrack = false;
  let hasAudio = false;
  let cacheOn = true;
  let loading: number | null = null;

  const setPlaying = (on: boolean) => {
    playing = on;
    setVoiceIcon(play, on ? "pause" : "play");
  };
  const setCache = (on: boolean) => {
    cacheOn = on;
    cache.classList.toggle("is-active", on);
    cache.setAttribute("aria-pressed", String(on));
  };
  const synthesize = (text: string) => {
    log(root, `${text} … (paid)`);
    play.classList.add("rotating-icon");
    setVoiceIcon(play, "loading");
    loading = window.setTimeout(() => {
      loading = null;
      play.classList.remove("rotating-icon");
      hasAudio = true;
      setPlaying(true);
      log(root, "New audio ready — playing");
    }, 2500);
  };

  play.addEventListener("click", () => {
    const action = resolvePlayTap({
      synthesizing: loading !== null,
      playing,
      pausedMidTrack,
      loadedAudioIsStale: false,
      hasLoadedAudio: hasAudio,
      hasActiveNote: true,
      cacheOn,
    });
    switch (action) {
      case "cancel":
        window.clearTimeout(loading!);
        loading = null;
        play.classList.remove("rotating-icon");
        setPlaying(false);
        log(root, "Generation cancelled");
        break;
      case "pause":
        setPlaying(false);
        pausedMidTrack = true;
        log(root, "Paused");
        break;
      case "resume":
        setPlaying(true);
        log(root, "Resumed");
        break;
      case "regenerate":
        pausedMidTrack = false;
        setCache(true);
        synthesize("Cache off: generating with current voice & settings");
        break;
      case "play-cached":
        pausedMidTrack = false;
        if (hasAudio) {
          setPlaying(true);
          log(root, "Cache on: playing existing audio (free)");
        } else {
          synthesize("Cache on, but no audio yet: generating");
        }
        break;
    }
  });

  cache.addEventListener("click", () => {
    setCache(!cacheOn);
    log(
      root,
      cacheOn
        ? "Cache on: play reuses existing audio"
        : "Cache off: the next play generates new audio",
    );
  });

  attachPressGesture($(".voice-player-download"), {
    onTap: () => log(root, "Tap: save next to the note"),
    onHold: () => log(root, "Hold: open the folder picker"),
  });
  $(".voice-player-folder-btn").addEventListener("click", () =>
    log(root, "Folder: open the folder picker"),
  );

  for (const [sel, msg] of [
    [".voice-player-track:first-child", "Previous track"],
    [".voice-player-track:last-child", "Next track"],
  ]) {
    $(sel).addEventListener("click", () => log(root, msg));
  }
  root
    .querySelectorAll<HTMLElement>(".voice-player-skip")
    .forEach((btn) =>
      btn.addEventListener("click", () =>
        log(root, `${btn.getAttribute("aria-label")}: ${btn.textContent}s`),
      ),
    );

  const modes = ["repeat off", "repeat one", "repeat all"];
  let mode = 0;
  const repeat = $(".voice-player-repeat");
  repeat.addEventListener("click", () => {
    mode = (mode + 1) % 3;
    setVoiceIcon(repeat, mode === 1 ? "repeat-one" : "repeat");
    repeat.classList.toggle("is-active", mode !== 0);
    log(root, modes[mode]);
  });

  let speed = 1;
  const speedEl = $(".voice-player-speed-value");
  root
    .querySelectorAll<HTMLElement>(".voice-player-speed-btn")
    .forEach((b, i) =>
      b.addEventListener("click", () => {
        speed = Math.min(
          2,
          Math.max(0.5, Math.round((speed + (i ? 0.1 : -0.1)) * 10) / 10),
        );
        speedEl.textContent = `${speed.toFixed(1)}×`;
      }),
    );

  root
    .querySelectorAll<HTMLElement>(
      ".voice-player-toggle:not(.voice-player-cache)",
    )
    .forEach((t) =>
      t.addEventListener("click", () => {
        const on = !t.classList.contains("is-active");
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-pressed", String(on));
        log(root, `${t.textContent}: ${on ? "on" : "off"}`);
      }),
    );
}

document
  .querySelectorAll<HTMLElement>(".voice-player")
  .forEach((root) => wire(root));
