<!-- guide:header -->

[🏠 User Guide](https://github.com/chrisurf/obsidian-voice/blob/main/docs/README.md) · [Getting started](https://github.com/chrisurf/obsidian-voice/blob/main/docs/getting-started/README.md) · [Providers](https://github.com/chrisurf/obsidian-voice/blob/main/docs/providers/README.md) · [Using Voice](https://github.com/chrisurf/obsidian-voice/blob/main/docs/using-voice/README.md) · [Customizing](https://github.com/chrisurf/obsidian-voice/blob/main/docs/customizing/README.md) · **[Help](https://github.com/chrisurf/obsidian-voice/blob/main/docs/help/README.md)**

📍 [User Guide](https://github.com/chrisurf/obsidian-voice/blob/main/docs/README.md) › [Help](https://github.com/chrisurf/obsidian-voice/blob/main/docs/help/README.md) › **FAQ**

<!-- /guide:header -->

# FAQ

## Is Voice free?

Yes. Voice is free and open source. Your text-to-speech provider charges for the speech it generates, usually per character. A self-hosted [OpenAI-compatible server](https://github.com/chrisurf/obsidian-voice/blob/main/docs/providers/openai-compatible.md) costs nothing.

## How do I keep costs low?

- Leave **Cache** on: a note's audio is reused instead of generated again ([Cache](https://github.com/chrisurf/obsidian-voice/blob/main/docs/using-voice/listening.md#cache-never-pay-twice-by-accident)).
- **Save** readings you want to hear again — saved MP3s play for free.
- Read only a selection when you need just part of a note.

## Where do my notes go?

Only to the provider you chose, directly from Obsidian, with your own key. The plugin has no server of its own and collects no data.

## Where are my keys stored?

In the plugin's settings file inside your vault (`.obsidian/plugins/voice/data.json`). If you sync your vault, they sync too — keep that in mind when you share a vault.

## Can I listen offline?

Saved MP3s play offline. Generating new audio needs a connection to your provider — or a [server on your own computer](https://github.com/chrisurf/obsidian-voice/blob/main/docs/providers/openai-compatible.md).

## Does Voice work on my phone?

Yes, on iPhone, iPad and Android, with a full-screen player and a control bar. See [On iPhone, iPad and Android](https://github.com/chrisurf/obsidian-voice/blob/main/docs/using-voice/mobile.md).

## Which file formats are supported?

MP3 (recommended) and WAV. WAV is only used for OpenAI-compatible servers that can't produce MP3; WAV files are larger and can't hold bookmarks.

## Can I use the audio elsewhere?

Yes — saved files are ordinary MP3s. They play in any audio app, and their [bookmarks](https://github.com/chrisurf/obsidian-voice/blob/main/docs/using-voice/bookmarks.md) show up as chapters in podcast apps.

## Which languages are supported?

Every language your provider has voices for. How acronyms, abbreviations and lists are read is set per language in [speech profiles](https://github.com/chrisurf/obsidian-voice/blob/main/docs/customizing/speech-profiles.md); English (US and UK), German and French come ready to use.

## How can I support Voice?

If Voice makes your day easier, you can [buy the author a coffee](https://buymeacoffee.com/chrisurf). Ideas and bug reports are welcome as [GitHub issues](https://github.com/chrisurf/obsidian-voice/issues).

<!-- guide:footer -->

---

<table><tr>
<td align="left">← Previous<br><a href="https://github.com/chrisurf/obsidian-voice/blob/main/docs/help/troubleshooting.md"><b>Troubleshooting</b></a></td>
<td></td>
</tr></table>

<!-- /guide:footer -->
