# Local Neural TTS — Feasibility Harness

A standalone, single-file test page to measure whether running a small neural
text-to-speech model **fully on-device** (no server, no API key) is fast and
light enough for the Voice plugin — on desktop **and** mobile.

It deliberately lives **outside** the plugin so we can measure the model itself
without first fighting Obsidian's bundling/CSP. Once the numbers look good, we
integrate the same engine (Transformers.js + ONNX Runtime Web) as a `local`
speech provider.

## What it does

- Loads a TTS model in the browser (default: **MMS-TTS**, 1000+ languages,
  ~38 MB per language — the smallest-footprint / widest-language option).
- First run downloads the model from the Hugging Face CDN; afterwards it is
  served from the browser cache.
- Synthesizes your text, plays the resulting WAV, and reports:
  **download size, load time, synthesis time, audio length, real-time factor
  (RTF), and JS heap** (Chromium only).
- Shows the environment: platform, WebGPU availability, cross-origin-isolation,
  memory API.

> RTF = synthesis time ÷ audio length. **Lower is better; < 1 means faster than
> real time.** This is the key number for "is it usable on this device".

## How to run it

The page loads the library + model over the network on first use, so it needs
a normal `http(s)://` origin (not `file://`) — especially for WebGPU.

**Desktop (Mac/Windows/Linux):**

```bash
cd prototype/local-tts
python3 -m http.server 8000
# open http://localhost:8000 in Obsidian's browser engine (Chrome/Edge)
```

**iPhone / iPad and Android:** serve the folder from your computer as above,
then open `http://<your-computer-ip>:8000` in Safari (iOS) / Chrome (Android)
on the phone (same Wi-Fi). Or host the single `index.html` anywhere static
(GitHub Pages, etc.) and open that URL on the device.

## What to report back

For each device you test, note:

1. Device + OS (e.g. "iPhone 13, iOS 26" / "MacBook Air M2" / "Pixel 7").
2. Whether WebGPU was used or it fell back to WASM.
3. **Model download size**, **load time**, **synthesis time**, **RTF**.
4. Did it play correctly? Any crash / out-of-memory / silence?
5. Try both a short sentence and a long paragraph (the cutoff/memory behaviour
   matters most for long notes).

With those numbers we decide: (a) which model to ship (MMS = most languages but
non-commercial licence; Piper = EN+DE; Kokoro = English, licence-clean), and
(b) whether mobile is viable or desktop-only for v1.

## Notes / caveats

- **Licence:** MMS-TTS weights are CC-BY-NC (non-commercial) — fine for this
  internal measurement, but a shipping decision is still open.
- **iOS memory:** WKWebView has a hard per-process limit (~1.5 GB). Stay with
  small / quantized models there; large fp32 models may OOM-crash.
- **WebGPU:** MMS-TTS (VITS) is **not** WebGPU-compatible — it uses a
  `GatherND` op with int64 indices that ORT-Web's WebGPU backend rejects
  ("Unsupported data type: 7"). The harness therefore runs MMS on WASM in auto
  mode and auto-falls back WebGPU→WASM on error. WebGPU only helps heavier
  models (Kokoro / SpeechT5). Availability: desktop yes; Android WebView
  probable; iOS only from iOS 26+.
- **Footprint:** the ~38 MB figure for MMS is the quantized (**q8**) build;
  the default **fp32** download is ~100+ MB. Switch Precision to q8 to measure
  the small-footprint case.
- This page is a throwaway measurement tool, not shipped with the plugin.
