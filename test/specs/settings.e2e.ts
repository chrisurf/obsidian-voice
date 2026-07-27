/**
 * End-to-end tests for the Voice settings tab against a real, sandboxed
 * Obsidian (see wdio.conf.mts). This is the only layer that exercises
 * Obsidian's actual renderer — jest-environment-node has no DOM, so the
 * declarative getSettingDefinitions() path can't be validated in the unit
 * suite.
 *
 * The wdio.conf.mts matrix runs this on two Obsidian versions:
 *   - "earliest" (minAppVersion 1.7.2) -> the display() fallback path.
 *   - "latest"   (>= 1.13)             -> the declarative getSettingDefinitions
 *                                          path (settings become searchable).
 * Both paths must render the same settings, so these assertions hold on both.
 */

import { browser, expect } from "@wdio/globals";
import { describe, it, before } from "mocha";

const PLUGIN_ID = "voice";

/** Open Obsidian settings and select the Voice plugin's tab. */
async function openVoiceSettings(): Promise<void> {
  await browser.executeObsidian(
    // `app.setting` is an internal API, not in the public obsidian typings, so
    // it is accessed through a local structural cast.
    ({ app }, pluginId: string) => {
      const setting = (
        app as unknown as {
          setting: { open(): void; openTabById(id: string): unknown };
        }
      ).setting;
      setting.open();
      setting.openTabById(pluginId);
    },
    PLUGIN_ID,
  );
}

/** The container Obsidian renders the active settings tab into. */
function tabContent() {
  return browser.$(".vertical-tab-content");
}

describe("E2E: Voice settings tab", function () {
  before(async function () {
    await openVoiceSettings();
  });

  it("renders the core settings (declarative on 1.13+, display() on <1.13)", async function () {
    await expect(tabContent()).toExist();
    // These names are produced identically by getSettingDefinitions() and the
    // display() fallback, so this proves the tab actually mounts on whichever
    // path the running Obsidian version takes.
    await expect(tabContent().$("*=Speech provider")).toExist();
    await expect(tabContent().$("*=Rewind interval")).toExist();
    await expect(tabContent().$("*=Save automatically")).toExist();
  });

  it("shows the active provider's credential fields, and swaps them on change", async function () {
    // Default provider is AWS Polly -> its credential fields are shown.
    await expect(tabContent().$("*=AWS Access Key ID")).toExist();

    // Switch the provider through the plugin instance, then re-open the tab.
    // This drives a re-render on both the declarative and fallback paths.
    await browser.executeObsidian(async ({ app }, pluginId: string) => {
      const plugin = (
        app as unknown as {
          plugins: {
            plugins: Record<
              string,
              {
                settings: { TTS_PROVIDER: string };
                saveSettings(): Promise<void>;
              }
            >;
          };
        }
      ).plugins.plugins[pluginId];
      plugin.settings.TTS_PROVIDER = "elevenlabs";
      await plugin.saveSettings();
    }, PLUGIN_ID);
    await openVoiceSettings();

    await expect(tabContent().$("*=ElevenLabs API Key")).toExist();
    await expect(tabContent().$("*=AWS Access Key ID")).not.toExist();
  });
});
