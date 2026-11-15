import { config as desktopConfig } from "./wdio.conf.mts";

// README screenshots (test/specs/docs-screenshots.e2e.ts): run with
// OBSIDIAN_VERSIONS="latest/latest" (npm run docs:screenshots), once as desktop
// and once in the mobile UI at iPhone size.
const [latest] = desktopConfig.capabilities as WebdriverIO.Capabilities[];

export const config: WebdriverIO.Config = {
  ...desktopConfig,
  specs: ["./test/specs/docs-screenshots.e2e.ts"],
  maxInstances: 1,
  capabilities: [
    {
      ...latest,
      "goog:chromeOptions": { args: ["--window-size=1280,1000"] },
    },
    {
      ...latest,
      "wdio:obsidianOptions": {
        ...latest["wdio:obsidianOptions"],
        emulateMobile: true,
      },
      "goog:chromeOptions": {
        mobileEmulation: {
          deviceMetrics: { width: 390, height: 844, pixelRatio: 3 },
        },
      },
    },
  ],
};
