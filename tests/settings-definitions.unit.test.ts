/**
 * Unit tests for the declarative settings contract (Obsidian 1.13+).
 *
 * These exercise the *data* and *bindings* the tab hands to Obsidian —
 * `getSettingDefinitions()`, `getControlValue()`, `setControlValue()` — without
 * touching Obsidian's internal renderer (which needs a real app; see the Layer
 * 3 WebdriverIO suite). They catch the regressions most likely to slip past a
 * type-check: a control key that drifts from `VoiceSettings`, a missing option,
 * or a side effect (skip-interval refresh, provider re-init) that stops firing.
 */

import { App } from "obsidian";
import { VoiceSettingTab } from "../src/settings/VoiceSettingTab";
import {
  DEFAULT_SETTINGS,
  MIN_SKIP_SECONDS,
  MAX_SKIP_SECONDS,
  type VoiceSettings,
} from "../src/settings/VoiceSettings";
import type { Voice } from "../src/utils/VoicePlugin";

/**
 * The control keys that must map 1:1 onto real `VoiceSettings` properties.
 * `satisfies` proves this at compile time — rename a setting and this list stops
 * compiling — while the runtime assertions below prove the *definitions* and the
 * get/set switches actually use them.
 */
const EXPECTED_CONTROL_KEYS = [
  "TTS_PROVIDER",
  "rewindSeconds",
  "forwardSeconds",
  "autoDownloadAudio",
  "playNoteSavedAudio",
  "folderSelectorFollowsNote",
] as const satisfies readonly (keyof VoiceSettings)[];

interface Controlish {
  control?: { key?: string; type?: string; options?: Record<string, string> };
  items?: Controlish[];
}

/** Depth-first collect every `control.key` across top-level defs and groups. */
function collectControls(
  items: Controlish[],
): NonNullable<Controlish["control"]>[] {
  const found: NonNullable<Controlish["control"]>[] = [];
  for (const item of items) {
    if (item.control?.key) {
      found.push(item.control);
    }
    if (Array.isArray(item.items)) {
      found.push(...collectControls(item.items));
    }
  }
  return found;
}

interface MockPlugin {
  settings: VoiceSettings;
  saveSettings: jest.Mock;
  updateSkipIntervals: jest.Mock;
  reinitializeProvider: jest.Mock;
  isMobile: () => boolean;
}

function makePlugin(): MockPlugin {
  return {
    settings: { ...DEFAULT_SETTINGS },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    updateSkipIntervals: jest.fn(),
    reinitializeProvider: jest.fn(),
    isMobile: () => false,
  };
}

function makeTab(plugin: MockPlugin): VoiceSettingTab {
  return new VoiceSettingTab(new App(), plugin as unknown as Voice);
}

describe("Unit: VoiceSettingTab declarative settings", () => {
  it("returns a non-empty definition array (so 1.13+ renders declaratively)", () => {
    const defs = makeTab(makePlugin()).getSettingDefinitions();
    expect(defs.length).toBeGreaterThan(0);
  });

  it("every declarative control key is a real VoiceSettings property", () => {
    const controls = collectControls(
      makeTab(makePlugin()).getSettingDefinitions() as Controlish[],
    );
    const keys = controls.map((c) => c.key);
    for (const key of keys) {
      expect(key as string).toBeDefined();
      expect(key! in DEFAULT_SETTINGS).toBe(true);
    }
  });

  it("exposes exactly the expected settings-backed controls", () => {
    const controls = collectControls(
      makeTab(makePlugin()).getSettingDefinitions() as Controlish[],
    );
    const keys = controls.map((c) => c.key).sort();
    expect(keys).toEqual([...EXPECTED_CONTROL_KEYS].sort());
  });

  it("offers all six providers in the dropdown", () => {
    const controls = collectControls(
      makeTab(makePlugin()).getSettingDefinitions() as Controlish[],
    );
    const provider = controls.find((c) => c.key === "TTS_PROVIDER");
    expect(provider?.type).toBe("dropdown");
    expect(Object.keys(provider?.options ?? {}).sort()).toEqual(
      ["azure", "elevenlabs", "google", "minimax", "openai", "polly"].sort(),
    );
  });

  it("bounds the skip sliders to MIN/MAX_SKIP_SECONDS", () => {
    const controls = collectControls(
      makeTab(makePlugin()).getSettingDefinitions() as Controlish[],
    );
    for (const key of ["rewindSeconds", "forwardSeconds"]) {
      const slider = controls.find((c) => c.key === key) as
        | { type?: string; min?: number; max?: number }
        | undefined;
      expect(slider?.type).toBe("slider");
      expect(slider?.min).toBe(MIN_SKIP_SECONDS);
      expect(slider?.max).toBe(MAX_SKIP_SECONDS);
    }
  });
});

describe("Unit: VoiceSettingTab control value binding", () => {
  it("getControlValue reads the live plugin settings", () => {
    const plugin = makePlugin();
    plugin.settings.rewindSeconds = 9;
    plugin.settings.TTS_PROVIDER = "openai";
    const tab = makeTab(plugin);
    expect(tab.getControlValue("rewindSeconds")).toBe(9);
    expect(tab.getControlValue("TTS_PROVIDER")).toBe("openai");
    expect(tab.getControlValue("nonexistent")).toBeUndefined();
  });

  it("every declared control key round-trips through getControlValue", () => {
    const plugin = makePlugin();
    const tab = makeTab(plugin);
    const controls = collectControls(
      tab.getSettingDefinitions() as Controlish[],
    );
    for (const { key } of controls) {
      expect(tab.getControlValue(key!)).toBe(
        plugin.settings[key as keyof VoiceSettings],
      );
    }
  });

  it("a slider change persists and refreshes the skip intervals", async () => {
    const plugin = makePlugin();
    const tab = makeTab(plugin);
    await tab.setControlValue("forwardSeconds", 12);
    expect(plugin.settings.forwardSeconds).toBe(12);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.updateSkipIntervals).toHaveBeenCalledTimes(1);
  });

  it("a provider change persists and re-initialises the provider", async () => {
    const plugin = makePlugin();
    const tab = makeTab(plugin);
    await tab.setControlValue("TTS_PROVIDER", "azure");
    expect(plugin.settings.TTS_PROVIDER).toBe("azure");
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.reinitializeProvider).toHaveBeenCalledTimes(1);
    // No provider section is mounted in a headless test, so the in-place
    // re-render is safely skipped rather than throwing.
    expect(plugin.updateSkipIntervals).not.toHaveBeenCalled();
  });

  it("a toggle change persists without provider/skip side effects", async () => {
    const plugin = makePlugin();
    const tab = makeTab(plugin);
    await tab.setControlValue("playNoteSavedAudio", false);
    expect(plugin.settings.playNoteSavedAudio).toBe(false);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(plugin.updateSkipIntervals).not.toHaveBeenCalled();
    expect(plugin.reinitializeProvider).not.toHaveBeenCalled();
  });
});
