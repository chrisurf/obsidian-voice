import { env } from "process";
import { config as desktopConfig } from "./wdio.conf.mts";

// User Guide screenshots (test/specs/user-guide.e2e.ts), written to
// docs/images/: run with `npm run docs:screenshots`, once as desktop and once
// in the mobile UI at iPhone size. GUIDE_ONLY=desktop or =mobile runs one.
const [latest] = desktopConfig.capabilities as WebdriverIO.Capabilities[];

const desktop: WebdriverIO.Capabilities = {
  ...latest,
  "goog:chromeOptions": { args: ["--window-size=1280,860"] },
};
const mobile: WebdriverIO.Capabilities = {
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
};

export const config: WebdriverIO.Config = {
  ...desktopConfig,
  specs: ["./test/specs/user-guide.e2e.ts"],
  exclude: [],
  maxInstances: 1,
  mochaOpts: { ui: "bdd", timeout: 600000 },
  capabilities:
    env.GUIDE_ONLY === "desktop"
      ? [desktop]
      : env.GUIDE_ONLY === "mobile"
        ? [mobile]
        : [desktop, mobile],
};
