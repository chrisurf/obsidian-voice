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
 * provider (Cartesia), then the Voice player and everything added since 1.8.0,
 * so both new and long-time users catch up at a glance.
 */
export const WHATS_NEW = `## 🆕 New: Cartesia — fast, natural Sonic voices

Voice's **seventh provider** is here: **Cartesia** (the **Sonic** models). It's known for very natural, low-latency speech.

- ⚡ **Sonic 2** (multilingual) or **Sonic Turbo** (fastest) — pick in settings.
- 🗣️ Press **Test Credentials** and Voice loads your **account's full voice library** into the picker.
- 🌍 Set the **language** so Sonic pronounces your notes correctly.
- 🔑 Set it up in **Settings → Voice → Cartesia**: choose a model and language, paste your **API key**, then press **Test Credentials**.

## 🗣️ MiniMax — text-to-speech that works from China

**MiniMax** is a great fit for **Chinese-language** notes — and, crucially, it's reachable from **mainland China**, where the other engines often aren't.

- 🌏 **Choose your region** — **global** or **mainland China** — so the API works wherever your account lives.
- 🗣️ **Natural, multilingual voices** with especially strong Chinese support (Speech 02 HD/Turbo · Speech 01 HD/Turbo).
- 🔑 Set it up in **Settings → Voice → MiniMax**: pick a region and model, paste your **API key** and **Group ID**, then press **Test Credentials**.

Everything else — chapters, speed, downloads, the content toggles — works exactly like the other providers.

## ▶️ One play button, less clutter

Playback is simpler now — the play button does everything, so the separate Regenerate button is gone. Open the Voice player (the audio-waveform ribbon icon) and use the big play button:

- **Tap** ▶️ to play, pause, or cancel a generation that is in progress.
- **Press and hold** to regenerate the current note from scratch — always with your current voice and settings. A ring fills around the button as you hold.

And new **quick toggles** sit right in the player — flip **Read code blocks** (\`</>\`), **Spell out acronyms** (\`Aa\`), **Skip website URLs** (🔗), and **Embed MP3 in note** (📎) with one click. The settings tab is leaner now, because the things you change while listening live in the player.

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

Every control is one button; a few do double duty — **tap** vs. **press & hold** (a ring fills while you hold). Toggles that light up when on: \`</>\` **code** · \`Aa\` **acronyms** · 🔗 **skip URLs** · 📎 **embed**.

## ✨ Everything at a glance

**Seven providers, your pick** — bring the engine you already use; every feature works identically on all of them: AWS Polly · ElevenLabs · OpenAI · Google Cloud · Azure Speech · MiniMax · **Cartesia**.

**Player & playback** — chapters, scrubber, speed (0.5×–2.0×), and repeat modes (off / one / all), plus configurable rewind & fast-forward (1–60 s). Switch provider, voice, and the content toggles without leaving the player — with live feedback while a note synthesizes.

**Your audio** — save MP3s next to the note or in a **default folder**, optionally **auto-save** and **embed** them, and **move / rename / delete** saved chapters from the player.

**Reads it your way** — toggle **read code blocks**, **spell out acronyms**, and **skip website URLs**, all from the player.

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
