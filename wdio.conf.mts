import * as path from "path";
import {
  parseObsidianVersions,
  obsidianBetaAvailable,
} from "wdio-obsidian-service";
import { env } from "process";

// wdio-obsidian-service downloads the sandboxed Obsidian builds here.
const cacheDir = path.resolve(".obsidian-cache");

// The settings tab has a dual render path, and which branch runs is decided
// purely by the Obsidian version:
//   - "earliest" resolves to the manifest's minAppVersion (1.7.2), which has no
//     getSettingDefinitions() -> the tab falls back to display().
//   - "latest" is the current *stable* release. Note: as of this writing stable
//     is 1.12.x, which ALSO uses display(). The declarative
//     getSettingDefinitions() path only activates on Obsidian >= 1.13.
//   - "latest-beta" is where >= 1.13 currently lives, so it is the only version
//     that actually exercises the declarative path today. Downloading beta
//     builds needs Obsidian Insider credentials (OBSIDIAN_EMAIL /
//     OBSIDIAN_PASSWORD, 2FA disabled); we add it only when available, so the
//     suite still runs (covering the fallback) without them. Drop this branch
//     once 1.13 reaches stable — "latest" will cover it.
// Override locally with e.g. OBSIDIAN_VERSIONS="latest-beta/latest".
//
// TODO: Obsidian 1.13 is beta-only as of 2026-07. Re-check availability soon
// (https://obsidian.md/changelog/, or when app "latest" resolves to >= 1.13.0).
// As soon as 1.13 is stable: "latest" exercises the declarative
// getSettingDefinitions() path directly — remove the latest-beta branch below
// and the now-unneeded OBSIDIAN_EMAIL/OBSIDIAN_PASSWORD secrets in
// .github/workflows/e2e.yml.
let defaultVersions = "earliest/earliest latest/latest";
if (await obsidianBetaAvailable({ cacheDir })) {
  defaultVersions += " latest-beta/latest";
}
const desktopVersions = await parseObsidianVersions(
  env.OBSIDIAN_VERSIONS ?? defaultVersions,
  { cacheDir },
);

if (env.CI) {
  // Printed so the GitHub workflow can key the .obsidian-cache on the resolved
  // versions (see .github/workflows/e2e.yml).
  console.log("obsidian-cache-key:", JSON.stringify(desktopVersions));
}

export const config: WebdriverIO.Config = {
  runner: "local",
  framework: "mocha",

  specs: ["./test/specs/**/*.e2e.ts"],

  // GitHub runners are 2-core; overridable via WDIO_MAX_INSTANCES.
  maxInstances: Number(env.WDIO_MAX_INSTANCES || 2),

  capabilities: desktopVersions.map<WebdriverIO.Capabilities>(
    ([appVersion, installerVersion]) => ({
      browserName: "obsidian",
      "wdio:obsidianOptions": {
        appVersion,
        installerVersion,
        // Load this repo (built main.js + manifest.json) as the plugin.
        plugins: ["."],
        vault: "test/vaults/simple",
      },
    }),
  ),

  services: ["obsidian"],
  // Wrapper around spec-reporter that shows the Obsidian version per test.
  reporters: ["obsidian"],

  mochaOpts: {
    ui: "bdd",
    timeout: 60 * 1000,
  },
  waitforInterval: 250,
  waitforTimeout: 5 * 1000,
  logLevel: "warn",

  cacheDir,

  // Import describe/it/expect explicitly in specs (keeps types/lint honest).
  injectGlobals: false,
};
