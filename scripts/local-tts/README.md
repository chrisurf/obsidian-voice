# Local German TTS test system

A free, local text-to-speech server for testing how naturally Voice reads, plus
tools that **measure** it. Runs on Apple Silicon Macs (MLX).

- **Voice:** Qwen3-TTS (1.7B, MLX), with two German voices — _Anna_ and
  _Jonas_ — designed once from a description and then cloned, so every request
  sounds like the same speaker. Generation is faster than real time on an M3.
- **Server:** speaks OpenAI's `/v1/audio/speech` API, so Voice uses it through
  its **OpenAI-compatible** provider.
- **Measurement:** Whisper (large-v3-turbo) transcribes the audio with word
  timestamps; silences in the signal are mapped to the note's structure.

## Set up and start

```bash
scripts/local-tts/setup.sh                      # once (~6 GB of models)
~/.cache/obsidian-voice-tts/venv/bin/python scripts/local-tts/server.py
# reachable from a phone/tablet on the same Wi-Fi:
~/.cache/obsidian-voice-tts/venv/bin/python scripts/local-tts/server.py --host 0.0.0.0
```

In Obsidian: **Settings → Voice → Speech Provider → OpenAI-compatible**,
server URL `http://127.0.0.1:8880/v1` (from another device: the Mac's IP),
no API key, then **Test Credentials** and pick the voice _Anna_ or _Jonas_.

Every request is logged to `~/.cache/obsidian-voice-tts/requests/` — the exact
text Voice sent and the audio — so a reading from Obsidian can be measured.

## Test page

With the server running, open **http://127.0.0.1:8880/** (from a phone or
tablet: the Mac's IP, with `--host 0.0.0.0`). Pick a sample note — the
`testnotiz` covers abbreviations, acronyms, numbers, dates, lists, quotes,
code, links and tables — or paste your own Markdown, then:

- **Vergleichen** reads it twice through Voice's own pipeline: _vorher_
  (without speech profiles) and _nachher_ (with the German profile), with the
  exact text that was sent shown under each player.
- **Messen** reports the pauses per punctuation, pauses mid-sentence and
  changed words of the most recent reading.

## Measure

```bash
P=~/.cache/obsidian-voice-tts/venv/bin/python
$P scripts/local-tts/measure.py                 # the last request from Obsidian
$P scripts/local-tts/measure.py audio.wav note.md
$P scripts/local-tts/check.py nachher           # the whole corpus/
$P scripts/local-tts/check.py vorher --legacy   # same, without speech profiles
```

The report lists, per note:

- **Word accuracy** — how much of the sent text Whisper heard.
- **Pauses per boundary** — mean pause after headings, paragraphs, list items,
  `.`, `:`, `,`, …
- **Stray pauses** — pauses of 0.25 s or more where the note has no
  punctuation (a pause mid-sentence).
- **Missing pauses** — sentence ends, headings or list items without a pause.
- **Changed words** — e.g. an abbreviation that was expanded, or misread.

`check.py` keeps audio, text and reports under
`~/.cache/obsidian-voice-tts/runs/<label>/` for listening and comparing. The
server uses a fixed seed, so the same text always gives the same audio and
before/after runs compare the pipeline, not sampling noise.

Files: `server.py` (API), `voices.py` (designs the voices), `measure.py`,
`check.py`, `render.ts` (the plugin's pipeline as a CLI), `corpus/` (test
notes), `common.py` (models and paths).
