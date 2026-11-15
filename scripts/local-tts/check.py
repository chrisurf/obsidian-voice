"""Read the test corpus through Voice's pipeline and the local voice, measure it.

For every note in corpus/ (or the notes given): render it with the plugin
(render.ts), synthesize it on the local server, and measure pauses and words
against the note's structure. Audio, sent text and reports are kept under
~/.cache/obsidian-voice-tts/runs/<label>/ for listening and comparing.

Usage:
  python check.py <label> [note.md ...] [--voice anna] [--profile p.yaml]
                                        [--port 8880] [--legacy]
  --legacy reads the notes without any speech profile (the old pipeline).
"""

import json
import subprocess
import sys
import urllib.request
from pathlib import Path

from common import HOME
from measure import markdown_tokens, measure, source_tokens

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent


def option(name: str, default: str | None) -> str | None:
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def render(note: Path, profile: str | None) -> str:
    cmd = ["npx", "tsx", str(HERE / "render.ts"), str(note)]
    if profile:
        cmd += ["--profile", profile]
    if "--legacy" in sys.argv:
        cmd.append("--legacy")
    return subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, check=True).stdout


def synthesize(text: str, voice: str, port: str) -> bytes:
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/v1/audio/speech",
        data=json.dumps({"input": text, "voice": voice, "response_format": "wav"}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=900) as response:
        return response.read()


def main() -> None:
    skip = {"--voice", "--profile", "--port"}
    args, i = [], 1
    while i < len(sys.argv):
        if sys.argv[i] in skip:
            i += 2
            continue
        if sys.argv[i].startswith("--"):
            i += 1
            continue
        args.append(sys.argv[i])
        i += 1
    if not args:
        sys.exit(__doc__)
    label, notes = args[0], [Path(a) for a in args[1:]] or sorted((HERE / "corpus").glob("*.md"))
    voice = option("--voice", "anna")
    profile = option("--profile", None)
    port = option("--port", "8880")
    out = HOME / "runs" / label
    out.mkdir(parents=True, exist_ok=True)

    rows = []
    for note in notes:
        text = render(note, profile)
        wav = out / f"{note.stem}.wav"
        wav.write_bytes(synthesize(text, voice, port))
        (out / f"{note.stem}.txt").write_text(text, encoding="utf-8")
        report = measure(
            wav, markdown_tokens(note.read_text(encoding="utf-8")), source_tokens(text)
        )
        (out / f"{note.stem}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
        rows.append((note.stem, report))

    print(f"\n{label}  ({out})")
    print(f"{'note':<12}{'words':>7}{'stray':>7}{'missing':>9}  pauses (mean s)")
    for stem, r in rows:
        means = "  ".join(f"{b}={v['mean']:.2f}" for b, v in r["pauses_by_boundary"].items())
        print(
            f"{stem:<12}{r['word_accuracy'] * 100:>6.0f}%{len(r['stray_pauses']):>7}"
            f"{len(r['missing_sentence_pauses']):>9}  {means}"
        )
    for stem, r in rows:
        for p in r["stray_pauses"]:
            print(f"  stray   {stem}: {p['seconds']:.2f}s between '{p['after']}' and '{p['next']}'")
        for m in r["missing_sentence_pauses"]:
            print(f"  missing {stem}: no pause after '{m['after']}' ({m['boundary']})")
        for m in r["misread"]:
            print(f"  words   {stem}: expected '{m['expected']}' heard '{m['heard']}'")


if __name__ == "__main__":
    main()
