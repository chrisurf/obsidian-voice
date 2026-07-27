import * as path from "path";
import { parseObsidianVersions } from "wdio-obsidian-service";
import { env } from "process";

// wdio-obsidian-service downloads the sandboxed Obsidian builds here.
const cacheDir = path.resolve(".obsidian-cache");

// Which Obsidian versions to test. Two hard constraints shape this list, and
// both are the reason every pair below uses the SAME value for app and
// installer (e.g. "1.12.7/1.12.7"):
//
//   1. No login. Obsidian only serves the app JS bundle to logged-in Insiders
//      accounts UNLESS it can be extracted from a matching installer — i.e.
//      when appVersion === installerVersion. A mismatch (e.g. the tempting
//      "earliest/earliest" = app 1.7.2 from installer 1.4.13) forces a
//      login-gated bundle download and fails CI with "Insiders account
//      required". Keeping app === installer keeps the whole suite credential-free.
//
//   2. The declarative getSettingDefinitions() path only exists on Obsidian
//      >= 1.13, which is still beta-only (and therefore login-gated) as of
//      2026-07. So without credentials only the display() fallback (<= 1.12) is
//      reachable today — which is exactly the path every current user hits.
//
//   - "1.8.4/1.8.4": an old public release near the manifest's minAppVersion
//     (1.7.2), guarding the supported floor against API-compat regressions.
//   - "latest/latest": the current public stable.
//
// Override locally with e.g. OBSIDIAN_VERSIONS="latest/latest".
//
// TODO: Obsidian 1.13 (which introduced the declarative getSettingDefinitions
// path) is beta-only as of 2026-07 and needs an Insiders login to download, so
// it is deliberately absent from this no-login matrix. Once 1.13 is public
// stable, "latest/latest" starts exercising the declarative path automatically
// (its installer bundles the 1.13 app, so still no login) — re-check here then,
// and optionally drop the old 1.8.4 pin.
const defaultVersions = "1.8.4/1.8.4 latest/latest";
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
