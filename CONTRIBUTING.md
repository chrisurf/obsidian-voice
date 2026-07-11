# Contributing to Obsidian Voice

Thanks for your interest in improving Obsidian Voice! This guide covers how to
set up the project, the conventions we follow, and how to get a change merged.

## Prerequisites

- **Node.js 20+** and **npm** (the CI uses Node 20).
- An Obsidian vault for manual testing (the plugin runs on desktop and mobile).

## Getting started

```bash
git clone https://github.com/chrisurf/obsidian-voice.git
cd obsidian-voice
npm install
npm run dev      # esbuild watch build → main.js
```

To try your build in Obsidian, symlink or copy the repo into a test vault at
`<vault>/.obsidian/plugins/voice/` (it must contain `main.js`, `manifest.json`,
and `styles.css`), then enable the plugin and reload.

## Project layout

The architecture, conventions, and design decisions are documented in
[`CLAUDE.md`](./CLAUDE.md) — it is the single source of truth for how the
codebase is organized (provider layer, content pipeline, UI, settings, and the
pure helper/thin-glue split). Please skim it before making non-trivial changes.

## Branching

Branch from an up-to-date `main`; never commit directly to `main`. Use
`type/short-kebab-description`:

| Type        | Prefix     | Example                       |
| ----------- | ---------- | ----------------------------- |
| Feature     | `feature/` | `feature/custom-audio-folder` |
| Bug fix     | `fix/`     | `fix/player-stale-audio`      |
| Docs only   | `docs/`    | `docs/readme-providers`       |
| Chore/infra | `chore/`   | `chore/bump-deps`             |

## Commit messages — Conventional Commits

Releases are automated from commit messages on `main`, so the format matters:

```
<type>(<optional-scope>): <summary>
```

- Types: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `style`, `ci`.
- `fix` → patch, `feat` → minor, a `BREAKING CHANGE:` footer (or `!`) → major.
- Imperative mood ("add", "fix" — not "added").

## The quality gate

Run the full gate before opening or updating a PR — it mirrors CI:

```bash
npm run build && npm run lint:check && npm test && npm run format:check
```

- **Build** — `tsc` type-check + esbuild bundle.
- **Lint** — ESLint with `eslint-plugin-obsidianmd` (the same guideline ruleset
  the official plugin scanner uses). Use Obsidian-friendly APIs: `requestUrl`
  (not `fetch`), `window.setTimeout`, `el.setCssProps()` / CSS classes over
  inline styles.
- **Test** — Jest. Put testable logic in pure helpers and unit-test it; keep
  view/DOM code thin. The Jest env has no DOM — mock or guard `window` /
  `document`. Name tests `*.unit.test.ts` and include "Unit" / "Integration" in
  the `describe` so the name filters work.
- **Format** — Prettier. Run `npm run format` to auto-fix.

## Guidelines to keep in mind

- **Stay provider-agnostic.** Shared behaviour belongs in `BaseSpeechService` or
  the orchestration layer — never special-case one engine in the UI. Weigh every
  change against **all providers** and **both platforms** (desktop + mobile).
- **Update docs** — the README, and when notable, the "What's New" modal
  (`src/utils/whatsNew.ts`) — when behaviour or settings change.
- Do not hand-edit `version` / `manifest.json` / `versions.json` or the
  changelog; the release pipeline manages them.

## Pull requests

- Open PRs into `main`. Fill in the
  [PR template](./.github/pull_request_template.md), including the **Provider
  impact** and **Platform impact** boxes.
- Link issues with a closing keyword so they close on merge: `Closes #123`.
- Keep build, lint, tests, and formatting green before requesting review.

## Reporting bugs & requesting features

Use GitHub Issues. For bugs, include your OS/platform, Obsidian version, the TTS
provider, and clear reproduction steps. Please label issues accurately
(`bug`, `enhancement`, …).

Thanks for contributing! 🎧
