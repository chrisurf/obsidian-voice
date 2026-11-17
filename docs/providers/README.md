<!-- guide:header -->

[🏠 User Guide](https://github.com/chrisurf/obsidian-voice/blob/main/docs/README.md) · [Getting started](https://github.com/chrisurf/obsidian-voice/blob/main/docs/getting-started/README.md) · **[Providers](https://github.com/chrisurf/obsidian-voice/blob/main/docs/providers/README.md)** · [Using Voice](https://github.com/chrisurf/obsidian-voice/blob/main/docs/using-voice/README.md) · [Customizing](https://github.com/chrisurf/obsidian-voice/blob/main/docs/customizing/README.md) · [Help](https://github.com/chrisurf/obsidian-voice/blob/main/docs/help/README.md)

📍 [User Guide](https://github.com/chrisurf/obsidian-voice/blob/main/docs/README.md) › **Providers**

<!-- /guide:header -->

# Providers

Voice works with the text-to-speech provider you already use. Each provider keeps its own key and voice list; everything else — the player, speed, bookmarks, saving, shortcuts — works the same with all of them. You can switch providers at any time in **Settings → Voice → Speech provider** or right in the player.

<!-- guide:pages -->

- **[AWS Polly](https://github.com/chrisurf/obsidian-voice/blob/main/docs/providers/aws-polly.md)** — Neural voices in many languages, with a dedicated, minimal AWS key.
- **[ElevenLabs](https://github.com/chrisurf/obsidian-voice/blob/main/docs/providers/elevenlabs.md)** — Expressive, multilingual voices and models for quality or speed.
- **[OpenAI](https://github.com/chrisurf/obsidian-voice/blob/main/docs/providers/openai.md)** — Natural multilingual voices such as Alloy and Nova.
- **[Google Cloud](https://github.com/chrisurf/obsidian-voice/blob/main/docs/providers/google-cloud.md)** — Neural2 and WaveNet voices with an API key.
- **[Azure Speech](https://github.com/chrisurf/obsidian-voice/blob/main/docs/providers/azure-speech.md)** — Hundreds of neural voices, loaded from your Azure account.
- **[MiniMax](https://github.com/chrisurf/obsidian-voice/blob/main/docs/providers/minimax.md)** — Multilingual voices with strong Chinese support and a mainland-China region.
- **[OpenAI-compatible servers](https://github.com/chrisurf/obsidian-voice/blob/main/docs/providers/openai-compatible.md)** — OpenRouter, LiteLLM or a voice running on your own computer.

<!-- /guide:pages -->

## Compare the providers

|                       | Voices                               | You need                             | Pauses and emphasis |
| --------------------- | ------------------------------------ | ------------------------------------ | ------------------- |
| **AWS Polly**         | Neural voices in many languages      | AWS region, access key ID and secret | Native (SSML)       |
| **ElevenLabs**        | Expressive voices in 29 languages    | API key                              | Natural pauses      |
| **OpenAI**            | Multilingual voices (Alloy, Nova, …) | API key                              | Natural prosody     |
| **Google Cloud**      | Neural2 and WaveNet voices           | API key with Text-to-Speech enabled  | Native (SSML)       |
| **Azure Speech**      | Hundreds of neural voices            | Speech key and region                | Native (SSML)       |
| **MiniMax**           | Multilingual, strong in Chinese      | API key and Group ID, region         | Natural prosody     |
| **OpenAI-compatible** | Whatever your server offers          | Server address, optional key         | Natural prosody     |

## What it costs

Voice itself is free. Your provider charges you for the speech it generates, usually per character — check its pricing page. Voice helps you keep that low: audio is reused instead of generated again (see [Cache](https://github.com/chrisurf/obsidian-voice/blob/main/docs/using-voice/listening.md#cache-never-pay-twice-by-accident)), and saved MP3s play for free forever. A self-hosted [OpenAI-compatible server](https://github.com/chrisurf/obsidian-voice/blob/main/docs/providers/openai-compatible.md) costs nothing at all.

## Your privacy

Your note text goes straight from Obsidian to the provider you chose, with your own key. Nothing passes through the plugin author or any other service. Keys are stored in your vault's plugin settings.

<!-- guide:footer -->

---

<table><tr>
<td align="left">← Previous<br><a href="https://github.com/chrisurf/obsidian-voice/blob/main/docs/getting-started/first-reading.md"><b>Your first reading</b></a></td>
<td align="right">Next →<br><a href="https://github.com/chrisurf/obsidian-voice/blob/main/docs/providers/aws-polly.md"><b>AWS Polly</b></a></td>
</tr></table>

<!-- /guide:footer -->
