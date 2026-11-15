import { env } from "process";
import { config as desktopConfig } from "./wdio.conf.mts";

// Mobile layout matrix: the same sandboxed Obsidian builds as wdio.conf.mts,
// switched to Obsidian's mobile UI (app.emulateMobile) at phone and tablet
// viewport sizes. Obsidian styles native <button>s differently on phone and
// tablet, which is exactly what the player-layout spec guards against.
//
// The viewports cover the narrowest iPhone, a current iPhone, and iPad in both
// orientations. Override with e.g. VOICE_VIEWPORTS="390x844 1194x834".
const viewports = (
  env.VOICE_VIEWPORTS ?? "375x667 390x844 834x1194 1194x834 1366x1024"
)
  .split(/\s+/)
  .filter(Boolean)
  .map((v) => v.split("x").map(Number) as [number, number]);

const baseCapabilities =
  desktopConfig.capabilities as WebdriverIO.Capabilities[];

export const config: WebdriverIO.Config = {
  ...desktopConfig,
  specs: ["./test/specs/player-layout.e2e.ts"],
  capabilities: baseCapabilities.flatMap((cap) =>
    viewports.map<WebdriverIO.Capabilities>(([width, height]) => ({
      ...cap,
      "wdio:obsidianOptions": {
        ...cap["wdio:obsidianOptions"],
        emulateMobile: true,
      },
      "goog:chromeOptions": {
        mobileEmulation: { deviceMetrics: { width, height, pixelRatio: 2 } },
      },
    })),
  ),
};
