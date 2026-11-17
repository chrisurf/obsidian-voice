/**
 * "What's New" changelog shown once after a fresh install or an update.
 *
 * Its purpose is discovery: many long-time users have not updated in a while
 * and do not know the Voice player exists yet, and new users should learn
 * about it right away. The pure version-comparison logic lives here, separate
 * from the Obsidian Modal, so it can be unit-tested.
 */

/**
 * Hero image shown at the top of the "What's New" modal. It mirrors the README
 * hero; it is loaded remotely (rather than bundled) because the asset is large,
 * and the modal hides it gracefully if it cannot be fetched (e.g. offline).
 */
export const HERO_IMAGE_URL =
  "https://raw.githubusercontent.com/chrisurf/obsidian-voice/main/assets/hero.png";

/**
 * "Buy me a coffee" support link and its button image, promoted near the top of
 * the "What's New" modal. Voice is free and users bring their own provider
 * credentials, so this is the one place we ask for optional support. The image
 * is loaded remotely (like the hero) and the modal hides it gracefully if it
 * cannot be fetched, e.g. when offline.
 */
export const BUY_ME_A_COFFEE_URL = "https://www.buymeacoffee.com/chrisurf";
export const BUY_ME_A_COFFEE_IMAGE_URL =
  "https://raw.githubusercontent.com/chrisurf/obsidian-voice/main/assets/buymeacoffee.png";

/**
 * Markdown rendered inside the "What's New" modal. Leads with the newest
 * changes (bookmarks, playing while generating, speech profiles, the refreshed player
 * with its Cache toggle and progress ring), then the providers added most recently, then saving audio,
 * the Voice player and everything added since 1.8.0, so both new and
 * long-time users catch up at a glance.
 */
export const WHATS_NEW = `## 🔖 New: bookmarks in your audio

Mark the spots you want to come back to. Tap 🔖 in the Voice player while you listen — or bind the command _Add a bookmark at the current position_ to a hotkey.

- 📍 **On the seek bar:** every bookmark is a small mark; tap it to jump there.
- 📑 **Below the chapter:** the 🔖 icon next to its **⋮** lists them with their position. Tap one to play from there; rename or delete it from its **⋮**.
- 🎧 **Stored in the MP3 itself** as standard chapters — they travel with the file and show up in podcast apps such as Apple Podcasts or Overcast.
- 📱 **Bookmarks on iPhone and iPad:** jumping to a bookmark now works in older long readings too — Voice repairs the file's length information once, the first time you open its bookmarks.
- ⏪ **Longer skips:** rewind and fast-forward now jump 5 seconds by default (was 3). Set your own interval in the settings.

## ⚡ New: long notes start playing while they are generated

No more waiting for a long note to be generated in full. Voice now **starts playing after the first part** and generates the rest while you listen — the ring around ▶️ keeps filling, and a tap pauses and resumes.

- 🧮 **It works out when to start:** with a fast provider right away; with a slower one (such as a model on your own computer) once enough is ready that playback never catches up. Voice measures each provider's speed after every long note and adjusts itself.
- ⏯️ **Generating never stops by accident:** pause, stop, another note or a chapter leave it running in the background. Only the red **✕** next to the progress bar stops it — after asking. Tap ▶️ early to hear what is ready right away.
- 📶 **A bar that keeps moving:** progress now advances smoothly with a light sheen, instead of jumping once per part.
- 🎛️ **A tidier status bar:** the speed is one button that opens a menu of speeds, the seek buttons use the player's circular arrows, and every control lights up on hover.
- ⚙️ Turn it off, or set the start point yourself, in **Settings → Voice → Playback → Play while generating**.
- 🕒 **Correct length for long audio:** files from servers that send each part with its own length header (common for self-hosted servers) now show their full length, and the seek bar reaches the end with the audio.
- 🏠 **Local servers out of the box:** the OpenAI-compatible provider now starts with \`http://127.0.0.1:8880/v1\`, the address many local servers use.

## 🗣️ New: speech profiles — reading that sounds natural

Voice now reads the way the language is spoken. A **speech profile** per language decides pronunciation and pacing — **American and British English, German and French** ship as editable YAML files.

- 🔤 **Acronyms read right:** "API", "IT" or "KI" are spelled instead of read as odd words ("key"), "JSON" says "jay-son" — from a simple, comma-separated list you can extend.
- 🇩🇪 **Every language its own words:** "z. B." becomes "zum Beispiel", "e.g." "for example", and numbered lists start with "Erstens", "First" or "Premièrement".
- ⏸️ **No more pauses mid-sentence:** lines wrapped inside a paragraph are read as one sentence; list items and table rows end with a natural stop.
- 📖 **Your own words:** add an acronym, abbreviation or name to a profile — per language, plus a default for all.
- 🔠 **Acronyms are spelled** by default (**Spell** in the player) — words like NASA or NATO stay words, listed in the profile.
- 🔗 **Web addresses are skipped** by default — nobody wants a URL read out letter by letter. Link labels are still read; turn **No URLs** off in the player to hear addresses again.
- ⚙️ Edit profiles in **Settings → Voice → Speech profiles** with quick controls, as YAML/JSON text, or import a file. A note can pick its language with \`lang:\` in its frontmatter.
- 🔁 **Your toggles moved in:** the player's **Spell**, **Code** and **No URLs** now live in the profile of the language you're listening in — your previous choices were carried over.

## 🆕 A cleaner player — and a Cache switch

The Voice player has a **refreshed look**: round controls with Voice's own icons that look **the same on every device** — desktop, iPhone, and iPad, on any Obsidian version.

- 🛢️ **Cache** — a new toggle at the start of the reading options. **On** (the default), ▶️ plays the audio you already have for a note, so changing the voice or a setting never makes you **pay twice by accident**. Turn it **off** and the next ▶️ generates fresh audio with your current voice and settings; Cache then switches itself back on.
- ▶️ **Play is just a tap** now — play, pause, or cancel. There's no hidden press-and-hold anymore: to regenerate a note, switch Cache off.
- ⏳ **See the progress:** while a note is generated, ▶️ turns into ⏹ and a ring around it fills up — tap to cancel.
- 🎚️ The reading toggles have short **labels** (Cache · Spell · Code · No URLs · Embed) and the speed control is one tidy **− 1.0× +** pill.

## 🔌 Bring any OpenAI-compatible server

Voice now talks to **any server that speaks OpenAI's speech API** — hosted routers like **OpenRouter**, gateways like **LiteLLM**, or a **self-hosted** engine such as **Kokoro** running on your own machine.

- 🔌 Choose **OpenAI-compatible** in **Settings → Voice**, enter the **server URL** (and an API key if it needs one), then press **Test Credentials**.
- 📋 Voice **loads the server's models and voices** for you — and you can **add your own** if the server doesn't list them.
- 🎧 Pick **MP3** or **WAV** — WAV files are saved and listed as chapters just like MP3s.
- 📱 On a phone, \`localhost\` means the phone itself — use an address the phone can reach.

## MiniMax — text-to-speech that works from China

Voice's **sixth provider** is here: **MiniMax**. It's a great fit for **Chinese-language** notes — and, crucially, it's reachable from **mainland China**, where the other engines often aren't.

- 🌏 **Choose your region** — **global** or **mainland China** — so the API works wherever your account lives.
- 🗣️ **Natural, multilingual voices** with especially strong Chinese support (Speech 02 HD/Turbo · Speech 01 HD/Turbo).
- 🔑 Set it up in **Settings → Voice → MiniMax**: pick a region and model, paste your **API key** and **Group ID**, then press **Test Credentials**.

Everything else — chapters, speed, downloads, the content toggles — works exactly like the other providers.

## 📁 Save audio where you want

The save button (the download arrow) now has two simple gestures, and you can pick a **default folder** so every save lands in the same place.

- 👆 **Tap** to save now — next to your note, or in your default folder if you've set one.
- ✋ **Press and hold** the save button (or right-click on desktop) to open the folder picker. In the player you can also just click the new **folder button** (📂) to **save to a custom folder** in one click.
- 📌 In the picker, **pin** a folder to make it your default (only one at a time; tap the pin again to clear it). ⭐ **Star** folders for quick access, or type to create a new folder.
- 🔀 Picking a folder **saves** new audio there, or **moves** an already-saved recording (a chapter) into it — no duplicates. If a file with the same name exists, you can **Replace**, **Save as new**, or **Cancel**.
- 💾 When a default folder is set, the save button shows a **floppy-disk** icon so you can tell at a glance where a tap will save.
- 🗂️ Manage a saved track from its **⋮** menu in the player: **Move** it to another folder, **Rename** it, or **Delete** it (with a quick confirmation).

## 🔊 The Voice player

Voice has a full **audiobook-style player** in the right sidebar (next to Backlinks and Outline) — always one click away.

- **Play your notes like chapters** — every MP3 in a folder becomes a numbered chapter you can play, skip, and repeat.
- **Browse audio across your vault** with the folder picker.
- **Switch provider & voice** right in the player.

Every control is one button; the save button does double duty — **tap** vs. **press & hold** (a ring fills while you hold). Toggles that light up when on: **Cache** · **Spell** · **Code** · **No URLs** · **Embed**.

## ✨ Everything at a glance

**Seven providers, your pick** — bring the engine you already use; every feature works identically on all of them: AWS Polly · ElevenLabs · OpenAI · Google Cloud · Azure Speech · MiniMax · **any OpenAI-compatible server**.

**Player & playback** — chapters, scrubber, speed (0.5×–2.0×), and repeat modes (off / one / all), plus configurable rewind & fast-forward (1–60 s). Switch provider, voice, and the content toggles without leaving the player — with live feedback while a note synthesizes.

**Your audio** — save MP3s next to the note or in a **default folder**, optionally **auto-save** and **embed** them, and **move / rename / delete** saved chapters from the player.

**Reads it your way** — a **speech profile** per language for acronyms, abbreviations and pacing (English, German and French included), plus one-tap **Spell**, **Code** and **No URLs** in the player — and **Cache**, so you never pay twice for the same note.

Open the player from the **audio-waveform ribbon icon**, the **"Open the player."** command, or the button below.`;

/**
 * Whether to show the "What's New" note for the running version. We show it
 * whenever the currently installed version differs from the last one the user
 * has already seen — this covers both a fresh install (no version seen yet)
 * and an upgrade, while never showing twice for the same version.
 */
export function shouldShowWhatsNew(
  currentVersion: string,
  lastSeenVersion: string,
): boolean {
  return currentVersion !== "" && currentVersion !== lastSeenVersion;
}
