/**
 * End-to-end tests for the Voice settings tab against a real, sandboxed
 * Obsidian (see wdio.conf.mts). This is the only layer that exercises
 * Obsidian's actual renderer — jest-environment-node has no DOM, so the
 * declarative getSettingDefinitions() path can't be validated in the unit
 * suite.
 *
 * The wdio.conf.mts matrix runs this credential-free on two public Obsidian
 * versions (an old one near minAppVersion and the current stable), both of
 * which use the display() render path today. The declarative
 * getSettingDefinitions() path (Obsidian >= 1.13) is beta-only and login-gated,
 * so it's out of scope here — but these assertions are written to hold on that
 * path too, since both paths render the same setting names.
 */

// describe/it and browser/expect are injected as globals by WDIO + mocha
// (injectGlobals: true in wdio.conf.mts) — no imports needed. These are
// declared so type-aware editors don't flag them; they have no runtime effect.
declare const browser: any;
declare const expect: any;
declare function describe(title: string, fn: () => void): void;
declare function it(title: string, fn: () => void | Promise<void>): void;

const PLUGIN_ID = "voice";

// Structural shape of the bits of Obsidian's internal API these tests touch.
// `app.setting` / plugin internals aren't in the public typings, so the
// executeObsidian callbacks cast through this. Reading the rendered text from
// `activeTab.containerEl` is far more robust than global DOM selectors: it is
// unaffected by which core tab happens to be default, by timing, or by the
// modal's markup changing between Obsidian versions.
interface ObsidianInternals {
  plugins: {
    enabledPlugins: Set<string>;
    enablePlugin(id: string): Promise<void>;
    plugins: Record<
      string,
      { settings: { TTS_PROVIDER: string }; saveSettings(): Promise<void> }
    >;
  };
  setting: {
    open(): void;
    openTabById(id: string): void;
    activeTab?: { id?: string; containerEl?: { textContent: string | null } };
  };
}

/**
 * Ensure the plugin is enabled, open its settings tab, and return the active
 * tab's id plus its rendered text. Works on both render paths — display()
 * (< 1.13) and declarative getSettingDefinitions() (>= 1.13) — because both
 * populate the same `activeTab.containerEl`.
 */
async function renderVoiceSettings(): Promise<{
  activeId?: string;
  text: string;
}> {
  return browser.executeObsidian(async ({ app }, id: string) => {
    const a = app as unknown as ObsidianInternals;
    if (!a.plugins.enabledPlugins.has(id)) {
      await a.plugins.enablePlugin(id);
    }
    a.setting.open();
    a.setting.openTabById(id);
    return {
      activeId: a.setting.activeTab?.id,
      text: a.setting.activeTab?.containerEl?.textContent ?? "",
    };
  }, PLUGIN_ID);
}

describe("E2E: Voice settings tab", function () {
  it("opens the Voice tab and renders the core settings", async function () {
    const { activeId, text } = await renderVoiceSettings();

    expect(activeId).toBe(PLUGIN_ID);
    // Names produced identically by getSettingDefinitions() and the display()
    // fallback, so these hold on whichever path the Obsidian version takes.
    expect(text).toContain("Rewind interval");
    expect(text).toContain("Save automatically");
    // Default provider is AWS Polly -> its credential fields render.
    expect(text).toContain("AWS Access Key ID");
  });

  it("swaps the credential fields when the provider changes", async function () {
    const text: string = await browser.executeObsidian(
      async ({ app }, id: string) => {
        const a = app as unknown as ObsidianInternals;
        const plugin = a.plugins.plugins[id];
        plugin.settings.TTS_PROVIDER = "elevenlabs";
        await plugin.saveSettings();
        // Switch away and back to force a fresh render of the Voice tab.
        a.setting.openTabById("about");
        a.setting.openTabById(id);
        return a.setting.activeTab?.containerEl?.textContent ?? "";
      },
      PLUGIN_ID,
    );

    expect(text).toContain("ElevenLabs API Key");
    expect(text).not.toContain("AWS Access Key ID");
  });
});
