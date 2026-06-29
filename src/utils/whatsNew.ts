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
 * Markdown rendered inside the "What's New" modal. Leads with the Voice player
 * (the headline feature many users have not discovered yet), then summarizes
 * everything added since 1.8.0 so long-time users catch up at a glance.
 */
export const WHATS_NEW = `## ▶️ One play button, less clutter

Playback is simpler now — the play button does everything, so the separate Regenerate button is gone. Open the Voice player (the audio-waveform ribbon icon) and use the big play button:

- **Tap** ▶️ to play, pause, or cancel a generation that is in progress.
- **Press and hold** to regenerate the current note from scratch — always with your current voice and settings. A ring fills around the button as you hold.

And new **quick toggles** sit right in the player — flip **Read code blocks** (\`</>\`), **Spell out acronyms** (\`Aa\`), and **Embed MP3 in note** (📎) with one click, no trip to settings.

## 📁 Save audio where you want

The save button (the download arrow) now has two simple gestures, and you can pick a **default folder** so every save lands in the same place.

- 👆 **Tap** to save now — next to your note, or in your default folder if you've set one.
- ✋ **Press and hold** the save button (or right-click on desktop) to open the folder picker. In the player you can also just click the new **folder button** (📂) to **save to a custom folder** in one click.
- 📌 In the picker, **pin** a folder to make it your default (only one at a time; tap the pin again to clear it). ⭐ **Star** folders for quick access, or type to create a new folder.

## 🔊 The Voice player is here

Voice now has a full **audiobook-style player** — and it lives in the right sidebar (next to Backlinks and Outline) by default, so it is always one click away. If you have not updated in a while, this is the big one.

- **Play your notes like chapters** — every MP3 in a folder shows up as a numbered chapter you can play, skip, and repeat.
- **Browse audio across your vault** — a folder picker lets you jump between any folders that contain audio, right from the player.
- **Transport controls** — play / pause, previous / next, rewind, fast-forward, a draggable progress bar, and on-the-fly speed.
- **Read this note & download** — generate speech and save an MP3 without leaving the player.
- **Bring your own provider** — pick AWS Polly, ElevenLabs, OpenAI, Google Cloud, or Azure Speech (and the voice) right in the player.

## ✨ Everything you need to know

**Player & playback**

- **Voice player shows by default** in the right sidebar, with a **folder picker** to browse audio across the vault.
- **In-player controls**: switch provider, voice, and read-code-blocks, with live loading feedback while a note is synthesized.
- **Collapsible, audiobook-style player** with chapters, transport controls, scrubber, and repeat modes (off / one / all).
- **Configurable rewind & fast-forward** intervals (1–60 seconds each).

**Bring your own provider**

Voice started out as AWS Polly only — now it supports all the major engines, so you can listen with the provider you already use:

- **ElevenLabs** — premade & multilingual voices.
- **OpenAI** — built-in voices (Alloy, Nova, …) with GPT-4o mini TTS.
- **Google Cloud Text-to-Speech** — plus extra hotkey commands.
- **Azure AI Speech** — neural voices across many languages.

**Your audio files**

- **Separate "Auto-Save" and "Embed" toggles** — download MP3s with or without embedding them into the note.
- **Skip website URLs** and **read code blocks** content toggles.

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
