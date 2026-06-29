# CLAUDE.md

Guidance for Claude Code (and any AI assistant / contributor) working in this
repository. This file is **self-contained** — architecture, conventions, and
workflow all live here. Keep it up to date as the codebase evolves.

---

## 1. What this is

**Obsidian Voice** — a text-to-speech plugin for Obsidian that reads notes
aloud with an audiobook-style player. It supports **five providers** (AWS Polly,
ElevenLabs, OpenAI, Google Cloud, Azure Speech) and runs on **desktop and
mobile** (iOS / Android). Users bring their own provider credentials; nothing is
proxied through a third party.

### Tech stack

- **TypeScript** (strict) — primary language.
- **Obsidian API** (`obsidian` 1.13.x) — plugin framework.
- **esbuild** — bundler (`esbuild.config.mjs`, outputs `main.js`).
- **ESLint** + `eslint-plugin-obsidianmd` — linting and Obsidian-specific rules.
- **Prettier** — formatting.
- **Jest** (`jest-environment-node`) + `ts-jest` — tests.
- **unified / remark** — Markdown → AST for the content pipeline.
- **@aws-sdk/client-polly** — AWS Polly client (other providers use `requestUrl`).
- **semantic-release** — automated versioning/changelog from commit messages.

---

## 2. Architecture

### Entry point & orchestration

- `src/main.ts` re-exports the plugin class — the manifest's entry.
- `src/utils/VoicePlugin.ts` (`class Voice extends Plugin`) is the heart: it
  loads settings, builds the active provider via the factory, and wires the
  collaborators below. It owns lifecycle, commands, the ribbon icon, the player
  view registration, and the "What's New" modal.

The `Voice` instance wires together:

| Collaborator       | File                          | Responsibility                                          |
| ------------------ | ----------------------------- | ------------------------------------------------------- |
| Speech provider    | `service/*`                   | Synthesis + playback for the selected engine.           |
| `TextSpeaker`      | `utils/TextSpeaker.ts`        | Orchestrates "read the active note" (pipeline → speak). |
| `MarkdownHelper`   | `utils/MarkdownHelper.ts`     | Reads the active note / selection from Obsidian.        |
| `IconEventHandler` | `utils/IconEventHandler.ts`   | Status-bar controls, ribbon state, save orchestration.  |
| `MobileControlBar` | `utils/MobileControlBar.ts`   | Touch control bar (mobile only).                        |
| `VoicePlayerView`  | `ui/VoicePlayerView.ts`       | The audiobook-style player pane.                        |
| `HotkeySettings`   | `settings/HotkeySettings.ts`  | Registers the ~16 hotkey commands.                      |
| `VoiceSettingTab`  | `settings/VoiceSettingTab.ts` | The settings UI.                                        |

### Provider layer (`src/service/`)

All providers implement one interface so the rest of the plugin is
**provider-agnostic**:

- `SpeechProvider.ts` — the interface (synthesis, playback, voice, caching,
  credential validation, operation lifecycle, progress/error callbacks).
- `BaseSpeechService.ts` — the abstract base holding **all shared logic**
  (playback, the `<audio>` element, rewind/forward, speed, per-note audio
  caching keyed by file path, operation/request lifecycle). Subclasses only
  implement what actually differs: `speak()`, `validateCredentials()`,
  `updateCredentials()`, `getVoiceOptions()`, and `inputFormat`.
- Concrete services: `AwsPollyService`, `AzureSpeechService`, `GoogleTtsService`,
  `ElevenLabsService`, `OpenAiSpeechService`.
- `SpeechProviderFactory.ts` — `createSpeechProvider(settings)` builds the
  provider chosen in settings and applies rewind/forward prefs.
- `textChunker.ts` — splits long text for the text-input providers.
- `voiceCatalog.ts` — **pure** helpers (unit-tested) to map a provider's fetched
  voice list into `VoiceOption[]` and group it by language for the picker.
  Azure uses it: "Test Credentials" fetches `/voices/list`, the result is cached
  in `settings.azureVoiceCatalog`, and `getVoiceOptions()` returns it (the
  hardcoded `AZURE_VOICES` is the fallback). The player renders the catalog as
  `<optgroup>`s grouped by language.

`inputFormat` selects which content pipeline feeds the provider:

- **`"ssml"`** → AWS Polly, Azure Speech, Google Cloud.
- **`"text"`** → ElevenLabs, OpenAI.

### Content pipeline (`src/processors/`)

Markdown is parsed with remark and transformed before synthesis. Two
orchestrators pick the path by `inputFormat`:

- `MarkdownToSSMLProcessor.ts` — for SSML providers. Stages live in
  `pipeline/`: **Clean** (`CleanProcessor`) → **Enhance** (`EnhanceProcessor`,
  adds prosody/breaks for headings/emphasis) → **XML escape**
  (`XmlEscapeProcessor`) → **Serialize** (`SSMLSerializer`) → **Validate**
  (`SSMLValidator`) → **Chunk** (`SSMLChunker`, keeps chunks within provider
  limits). `acronyms.ts` handles spell-out.
- `MarkdownToTextProcessor.ts` — for text providers; produces plain spoken text
  via `TextSerializer`.
- `config/DefaultConfig.ts` — default pipeline options; `types/ProcessorTypes.ts`
  and `types/SSMLNodes.ts` hold the shared types/AST node shapes.

`TextSpeaker.speakText()` is the funnel: read note → run the right pipeline →
`provider.speak(content, speed, filePath)`.

### UI layer (`src/ui/` + status bar / mobile)

- `VoicePlayerView.ts` — the player pane (right sidebar on desktop, full-screen
  on mobile). Transport (the play button taps to play / pause / cancel and is
  **held to regenerate**), scrubber, speed, provider/voice pickers, a download
  button (tap saves, hold opens the picker), a **folder button** ("save to a
  custom folder"), code/acronym/skip-URL/embed toggles, repeat modes, and a **chapter
  list** built from the MP3s in a folder (each chapter has a **⋮** action bar:
  move / rename / delete).
- `FolderPickerModal.ts` — quick folder picker (fuzzy search, a per-folder
  default-folder **pin**, starred favorites, "create folder") used by the
  custom-save-location feature.
- `FileConflictModal.ts` — Replace / Save-as-new / Cancel prompt shown when a
  picked folder already holds a file of the same name.
- `WhatsNewModal.ts` — renders `utils/whatsNew.ts` once per install/update.
- The **status bar** controls are created in `utils/IconEventHandler.ts`; the
  **mobile** control bar is `utils/MobileControlBar.ts`.

### Saving audio (`src/utils/`)

- `AudioFileManager.ts` — writes the MP3 (into the note's folder or a custom
  target, creating it if missing) and inserts the `![[file.mp3]]` embed.
  `saveOrMove()` handles the picker flow: **save** fresh audio or **move** an
  already-saved file (via `fileManager.renameFile`, keeping embeds), prompting
  on same-name conflicts.
- `audioFolders.ts` — **pure** helpers: `resolveSaveFolder` (default folder, else
  next to note), default-folder + favorites toggles, picker ordering (default
  first, then favorites). Fully unit-tested.
- `chapters.ts` — **pure** helpers for the player's folder/chapter lists.
- `pressGesture.ts` — reusable tap-vs-hold pointer gesture with a fill-ring
  while holding (e.g. save buttons: tap = save, hold = folder picker; the player
  play button: tap = play/pause/cancel, hold = regenerate). Shared by the
  status bar, mobile, and player buttons.

### Settings (`src/settings/`)

- `VoiceSettings.ts` — the `VoiceSettings` interface, `DEFAULT_SETTINGS`, and the
  curated voice/model/region catalogs per provider.
- `VoiceSettingTab.ts` — the settings UI, grouped under headings
  (Playback / Saving audio / Player) plus provider-specific credentials. Kept
  deliberately lean: voice, tempo, and the content toggles (read code blocks,
  spell out acronyms, skip URLs, embed) live in the player, not here.
- `HotkeySettings.ts` — command registration.

### Directory map

```
src/
├── main.ts                     # entry (re-exports Voice)
├── service/                    # provider layer (interface, base, 5 engines, factory)
├── processors/                 # Markdown → SSML/text pipeline (orchestrators + pipeline/)
├── ui/                         # player view, folder picker, what's-new modal
├── settings/                   # settings model, settings tab, hotkeys
├── utils/                      # plugin class, orchestration, save logic, pure helpers
└── types/                      # processor + SSML AST types
tests/                          # Jest unit + integration tests, mocks, helpers
```

---

## 3. Best practices (patterns to keep)

- **Stay provider-agnostic.** New shared behaviour goes in `BaseSpeechService`
  or the orchestration layer — never special-case one engine in the UI. Any
  change should be considered against **all five providers** and **both
  platforms** (desktop + mobile).
- **Pure logic in small helpers, Obsidian glue thin.** Put testable logic in
  helpers like `utils/audioFolders.ts` / `utils/chapters.ts` and unit-test it;
  keep view/DOM code thin around it.
- **The Jest env is `jest-environment-node`** — there is no DOM. `window`,
  `document`, `Blob.arrayBuffer`, etc. are only real at plugin runtime; mock or
  guard them in tests (see `tests/mocks/obsidian.ts`).
- **Use Obsidian-friendly APIs the linter enforces:** `window.setTimeout`
  (not bare `setTimeout`), `el.setCssProps({...})` / CSS classes (not inline
  styles), `requestUrl` for HTTP (not `fetch`).
- **Sentence case** for setting names and headings (Obsidian style guide).
- **Audio is cached per note path** in `BaseSpeechService`; re-synthesis is only
  needed when note content changes. Embeds resolve by file name, so MP3s work
  from any folder.
- **Renaming a setting's display name needs no migration** (the stored key is
  what matters); changing a **stored key** does.
- New user-facing behaviour should be reflected in the **README** and, when
  notable, the **What's New** modal (`utils/whatsNew.ts`).

---

## 4. Development workflow

### Branch naming

Always branch from an up-to-date `main`. **Never commit directly to `main`.**
Use `type/short-kebab-description`:

| Type        | Prefix     | Example                       |
| ----------- | ---------- | ----------------------------- |
| Feature     | `feature/` | `feature/custom-audio-folder` |
| Bug fix     | `fix/`     | `fix/player-stale-audio`      |
| Docs only   | `docs/`    | `docs/readme-providers`       |
| Chore/infra | `chore/`   | `chore/bump-deps`             |

Lowercase, hyphen-separated, short and descriptive. One branch per logical
change.

### Commit messages — Conventional Commits

**semantic-release** parses commit messages on `main` to version and publish, so
format matters:

```
<type>(<optional-scope>): <summary>
```

- Types: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`.
- Scope encouraged, e.g. `feat(audio):`, `fix(player):`.
- Version bumps: `fix` → patch, `feat` → minor, a `BREAKING CHANGE:` footer →
  major.
- Imperative mood ("add", "fix" — not "added").

### Pull requests & issue tracking

- Open PRs into `main`. The template at
  `.github/pull_request_template.md` is applied automatically — fill it in.
- **Link issues with a closing keyword** so they close on merge: `Closes #123`
  (one line per issue when a PR resolves several).
- Tick the **Provider impact** and **Platform impact** boxes honestly.
- Use issue labels per their meaning (`bug`, `enhancement`, …).
- Keep build, lint, tests, and formatting green before requesting review.

### Commands

| Task              | Command                                               |
| ----------------- | ----------------------------------------------------- |
| Build (typecheck) | `npm run build` (tsc + esbuild)                       |
| Lint              | `npm run lint:check` (or `npm run lint` to autofix)   |
| Format            | `npm run format:check` (or `npm run format` to write) |
| Test (all)        | `npm test`                                            |
| Test (unit only)  | `npm run test:unit`                                   |
| Dev watch build   | `npm run dev`                                         |

Run the full gate before pushing — it mirrors the `feature` CI workflow:

```
npm run build && npm run lint:check && npm test && npm run format:check
```

### Testing conventions

- Tests live in `tests/`, named `*.unit.test.ts` (and `integration.test.ts`).
- `describe` blocks include **"Unit"** or **"Integration"** so the
  `test:unit` / `test:integration` name filters work.
- Obsidian is mocked in `tests/mocks/obsidian.ts`; extend it when a test needs a
  new API surface. Favor unit tests on pure helpers over DOM-heavy view tests.

### Releases

`main` is release-only via semantic-release (triggered by merged Conventional
Commits). Do not hand-edit `version`/`manifest.json`/`versions.json` or the
changelog — the pipeline manages them.
