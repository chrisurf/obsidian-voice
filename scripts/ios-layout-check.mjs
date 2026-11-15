#!/usr/bin/env node
/**
 * Renders player layout pages in Mobile Safari on iOS Simulator devices — the
 * WebKit engine Obsidian uses on iPhone and iPad — and checks the controls.
 *
 * Each page gets a small script injected that measures every player control
 * (size, roundness, icon size, row overflow) and posts the result back to a
 * local server; a screenshot of each device is saved next to the report.
 *
 * Pages: the HTML snapshots exported by the e2e spec from a real Obsidian
 * (test/artifacts/player-layout/*.html) and/or the Obsidian-free fixture from
 * scripts/player-fixture.ts.
 *
 * Usage:
 *   node scripts/ios-layout-check.mjs [page.html ...]
 *   IOS_DEVICES="iPhone SE (3rd generation),iPad Pro 13-inch (M4)" node ...
 *
 * Requires Xcode with at least one iOS Simulator runtime. Exits non-zero when
 * any control is not round, an icon is squeezed, or a row overflows.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";

const OUT = path.resolve(
  process.env.VOICE_LAYOUT_OUT ?? "test/artifacts/player-layout/ios",
);
const DEFAULT_DEVICES = [
  "iPhone SE (3rd generation)",
  "iPhone 16 Pro Max",
  "iPad mini (A17 Pro)",
  "iPad Pro 13-inch (M4)",
];
const devices = (process.env.IOS_DEVICES?.split(",") ?? DEFAULT_DEVICES).map(
  (d) => d.trim(),
);
const pages = process.argv.slice(2);
if (pages.length === 0) {
  console.error("Pass one or more player layout pages (.html).");
  process.exit(2);
}

// Measures the controls inside every .voice-player on the page.
const PROBE = `<script>
(function () {
  function r(n) { return Math.round(n * 10) / 10; }
  function measure() {
    var players = Array.prototype.slice.call(document.querySelectorAll(".voice-player"));
    return players.map(function (root) {
      var rows = root.querySelectorAll(".voice-player-transport, .voice-player-secondary, .voice-player-toggles");
      var overflow = [];
      Array.prototype.forEach.call(rows, function (row) {
        if (row.scrollWidth > row.clientWidth + 1) overflow.push(row.className);
      });
      var controls = Array.prototype.map.call(
        root.querySelectorAll(".voice-player-transport button, .voice-player-secondary button, .voice-player-toggles button"),
        function (btn) {
          var b = btn.getBoundingClientRect();
          var svg = btn.querySelector("svg");
          var s = svg ? svg.getBoundingClientRect() : { width: 0, height: 0 };
          return { label: btn.getAttribute("aria-label") || "", cls: btn.className,
            width: r(b.width), height: r(b.height),
            radius: getComputedStyle(btn).borderTopLeftRadius,
            corner: getComputedStyle(btn).getPropertyValue("corner-shape") || "",
            iconWidth: r(s.width), iconHeight: r(s.height) };
        });
      return { paneWidth: Math.round(root.getBoundingClientRect().width), overflow: overflow, controls: controls };
    });
  }
  window.addEventListener("load", function () {
    setTimeout(function () {
      var body = JSON.stringify({ page: location.pathname, ua: navigator.userAgent,
        viewport: innerWidth + "x" + innerHeight, players: measure() });
      var x = new XMLHttpRequest();
      x.open("POST", "/report" + location.search);
      x.send(body);
    }, 500);
  });
})();
</script>`;

const reports = new Map();
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "POST" && url.pathname === "/report") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      reports.set(url.searchParams.get("run"), JSON.parse(body));
      res.end("ok");
    });
    return;
  }
  const file = pages[Number(url.pathname.slice(1).split(".")[0])];
  if (!file) {
    res.statusCode = 404;
    res.end();
    return;
  }
  const html = fs
    .readFileSync(file, "utf8")
    .replace(/<\/body>/i, `${PROBE}</body>`);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

function simctl(...args) {
  return execFileSync("xcrun", ["simctl", ...args], { encoding: "utf8" });
}

function udidOf(name) {
  const list = JSON.parse(simctl("list", "devices", "available", "-j"));
  for (const runtime of Object.values(list.devices)) {
    const hit = runtime.find((d) => d.name === name);
    if (hit) {
      return hit.udid;
    }
  }
  throw new Error(`No available simulator named "${name}"`);
}

async function waitFor(run, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (reports.has(run)) {
      return reports.get(run);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

/** Problems found in one measured page. */
function check(report) {
  const problems = [];
  for (const p of report.players) {
    for (const row of p.overflow) {
      problems.push(`${p.paneWidth}px pane: row overflows (${row})`);
    }
    for (const c of p.controls) {
      const name = `${p.paneWidth}px pane: ${c.label || c.cls}`;
      if (c.iconWidth < 12 || c.iconHeight < 12) {
        problems.push(`${name}: icon ${c.iconWidth}×${c.iconHeight}`);
      }
      const round =
        Math.abs(c.width - c.height) <= 1 &&
        (c.radius.endsWith("%") ||
          parseFloat(c.radius) >= Math.min(c.width, c.height) / 2 - 0.5);
      // corner-shape: squircle (computed "superellipse(2)") turns a 50% radius
      // into a rounded square; "round" computes to "superellipse(1)". Browsers
      // without corner-shape report "".
      if (c.corner && !/^(round|superellipse\(1\))$/.test(c.corner)) {
        problems.push(`${name}: corner-shape ${c.corner}`);
      }
      if (!c.cls.includes("voice-player-toggle") && !round) {
        problems.push(`${name}: ${c.width}×${c.height}, radius ${c.radius}`);
      }
    }
  }
  return problems;
}

fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const summary = [];
for (const device of devices) {
  const udid = udidOf(device);
  try {
    simctl("boot", udid);
  } catch {
    // Already booted.
  }
  simctl("bootstatus", udid, "-b");
  for (const [index, page] of pages.entries()) {
    const run = `${index}-${udid}`;
    simctl(
      "openurl",
      udid,
      `http://localhost:${port}/${index}.html?run=${run}`,
    );
    const report = await waitFor(run, 60000);
    const base = `${path.basename(page, ".html")}--${device.replace(/[^\w]+/g, "-")}`;
    await new Promise((r) => setTimeout(r, 1000));
    simctl("io", udid, "screenshot", path.join(OUT, `${base}.png`));
    if (!report) {
      failed++;
      summary.push(`✗ ${device} · ${path.basename(page)}: no report (timeout)`);
      continue;
    }
    fs.writeFileSync(
      path.join(OUT, `${base}.json`),
      JSON.stringify(report, null, 2),
    );
    const problems = check(report);
    const ios = /Version\/([\d.]+)/.exec(report.ua)?.[1];
    if (problems.length) {
      failed++;
      summary.push(
        `✗ ${device} (iOS ${ios}, ${report.viewport}) · ${path.basename(page)}`,
        ...problems.map((p) => `    ${p}`),
      );
    } else {
      const n = report.players.reduce((a, p) => a + p.controls.length, 0);
      summary.push(
        `✓ ${device} (iOS ${ios}, ${report.viewport}) · ${path.basename(page)}: ${n} controls OK`,
      );
    }
  }
  if (process.env.IOS_KEEP_BOOTED !== "1") {
    simctl("shutdown", udid);
  }
}
server.close();
console.log(summary.join("\n"));
console.log(`\nScreenshots and reports: ${OUT}`);
process.exit(failed ? 1 : 0);
