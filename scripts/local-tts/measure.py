"""Measure how naturally a text was read: pauses per punctuation, stray pauses
inside sentences, missing pauses at sentence ends, and misread words.

It transcribes the audio with Whisper (word timestamps), finds real silences in
the signal, and maps each silence to the boundary in the source text it falls
on (",", ".", ":", paragraph, ... or none).

Usage:
  python measure.py                     # newest request logged by server.py
  python measure.py audio.wav text.txt  # any audio + the text it should say
  python measure.py audio.wav note.md   # judged by the note's structure
  python measure.py --json ...          # machine-readable report
"""

import difflib
import json
import re
import sys
from pathlib import Path

import mlx_whisper
import numpy as np
import soundfile as sf

from common import HOME, WHISPER_MODEL

FRAME_S = 0.01
SILENCE_DB = -38.0  # relative to the loudest frame
MIN_PAUSE_S = 0.12  # shorter gaps are articulation, not pauses
MERGE_GAP_S = 0.08  # silences closer than this are one pause
STRAY_PAUSE_S = 0.25  # a pause this long where the text has no punctuation is a fault
SENTENCE_END_MIN_S = 0.15  # a sentence end should pause at least this long

BOUNDARY_ORDER = ["heading", "paragraph", "item", ".", "?", "!", ":", ";", "—", ",", "cell", "abbr", "none"]
# Boundaries that should always be audible as a pause.
SENTENCE_LIKE = ("heading", "paragraph", "item", ".", "?", "!")


def silences(audio: np.ndarray, sr: int) -> list[tuple[float, float]]:
    """Silent intervals (start, end) in seconds, inside the speech only."""
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    hop = int(sr * FRAME_S)
    frames = len(audio) // hop
    rms = np.sqrt(np.mean(audio[: frames * hop].reshape(frames, hop) ** 2, axis=1) + 1e-12)
    db = 20 * np.log10(rms / rms.max())
    quiet = db < SILENCE_DB
    voiced = np.flatnonzero(~quiet)
    if voiced.size == 0:
        return []
    first, last = voiced[0], voiced[-1]
    runs, start = [], None
    for i in range(first, last + 1):
        if quiet[i] and start is None:
            start = i
        elif not quiet[i] and start is not None:
            runs.append([start * FRAME_S, i * FRAME_S])
            start = None
    # A click or breath inside a pause does not end it.
    merged: list[list[float]] = []
    for run in runs:
        if merged and run[0] - merged[-1][1] < MERGE_GAP_S:
            merged[-1][1] = run[1]
        else:
            merged.append(run)
    return [(a, b) for a, b in merged if b - a >= MIN_PAUSE_S]


# Abbreviations whose dot is not a sentence end.
ABBREVIATIONS = {
    "dr", "prof", "ca", "usw", "bzw", "vgl", "ggf", "inkl", "nr", "etc", "mr", "mrs", "ms",
    "st", "jr", "sr", "evtl", "zb", "dh", "bspw", "ua", "uvm", "abs", "kap", "tel",
}
TOKEN = re.compile(r"\d+|[^\W\d_]+(?:['’-][^\W\d_]+)*")
BOUNDARY = re.compile(r"[ \t]*([.?!:;,—–…])(?=\s|$)|[ \t]*\n")


def tokenize(text: str) -> list[str]:
    """Words and digit runs, lowercased ("15.11.2026" -> 15, 11, 2026)."""
    return [t.lower() for t in TOKEN.findall(text)]


def source_tokens(text: str) -> list[tuple[str, str]]:
    """(token, boundary after it) for the source text. A punctuation mark only
    counts when whitespace or the end follows it, so dates and times stay inside
    a sentence."""
    tokens = []
    for match in TOKEN.finditer(text):
        found = BOUNDARY.match(text, match.end())
        if not found:
            boundary = "none"
        elif found.group(1) is None:
            boundary = "paragraph"
        else:
            mark = found.group(1)
            boundary = "—" if mark in "–—" else "." if mark == "…" else mark
            word = match.group().lower()
            if mark == "." and (word in ABBREVIATIONS or len(word) == 1):
                boundary = "abbr"  # "Dr.", "z. B." - no pause expected
            if re.match(r"\s*\n\s*\n", text[found.end() :]):
                boundary = "paragraph"
        tokens.append((match.group().lower(), boundary))
    return tokens


def markdown_tokens(markdown: str) -> list[tuple[str, str]]:
    """(token, boundary) for what a Markdown note means, independent of how a
    pipeline flattened it: a soft line break without punctuation is no boundary,
    headings, list items and table rows end in their own boundary."""
    text = re.sub(r"\A---\n.*?\n---\n", "", markdown, flags=re.S)
    lines = text.split("\n")
    tokens: list[tuple[str, str]] = []
    in_code = False
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code = not in_code
            continue
        if in_code or not stripped or re.fullmatch(r"\|?[\s:|-]+\|?", stripped):
            if not stripped and tokens and tokens[-1][1] in ("none", ","):
                tokens[-1] = (tokens[-1][0], "paragraph")
            continue
        kind = "text"
        if re.match(r"#{1,6}\s", stripped):
            kind, stripped = "heading", re.sub(r"^#{1,6}\s+", "", stripped)
        elif re.match(r"([-*+]|\d+[.)])\s", stripped):
            kind, stripped = "item", re.sub(r"^([-*+]|\d+[.)])\s+", "", stripped)
        elif stripped.startswith(">"):
            stripped = stripped.lstrip("> ")
        elif stripped.startswith("|"):
            kind = "row"
        stripped = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", stripped)
        stripped = re.sub(r"[*_`]", "", stripped)
        cells = [c for c in stripped.strip("|").split("|")] if kind == "row" else [stripped]
        for c, cell in enumerate(cells):
            line_tokens = source_tokens(cell)
            if not line_tokens:
                continue
            last_word, last_boundary = line_tokens[-1]
            if kind == "row":
                last_boundary = "item" if c == len(cells) - 1 else "cell"
            elif kind in ("heading", "item"):
                last_boundary = kind if last_boundary == "none" else last_boundary
            else:
                next_line = lines[i + 1].strip() if i + 1 < len(lines) else ""
                if not next_line and last_boundary in ("none", ".", "!", "?"):
                    last_boundary = "paragraph"
            line_tokens[-1] = (last_word, last_boundary)
            tokens.extend(line_tokens)
    return tokens


def measure(
    audio_path: Path,
    source: list[tuple[str, str]],
    sent: list[tuple[str, str]] | None = None,
) -> dict:
    """Judge `audio` against `source` (what the note means). When `sent` (the
    text actually sent to the engine) is given, words the pipeline added - list
    ordinals, placeholders, expanded abbreviations - take their boundary from
    it, and word accuracy is measured against it."""
    audio, sr = sf.read(audio_path)
    result = mlx_whisper.transcribe(
        str(audio_path), path_or_hf_repo=WHISPER_MODEL, language="de", word_timestamps=True
    )
    words = [w for s in result["segments"] for w in s["words"]]
    # Whisper may split or merge tokens ("15.11." vs "15", ".11"); align
    # token by token and remember which heard word each token belongs to.
    heard: list[str] = []
    last_token_of_word: list[int] = []
    for w in words:
        heard.extend(tokenize(w["word"]))
        last_token_of_word.append(len(heard) - 1)
    expected = [t[0] for t in source]

    # Align heard tokens to source tokens; matched pairs carry the boundary.
    matcher = difflib.SequenceMatcher(a=expected, b=heard, autojunk=False)
    boundary_of_token: dict[int, str] = {}
    misread = []
    for tag, a0, a1, b0, b1 in matcher.get_opcodes():
        if tag == "equal":
            for k in range(a1 - a0):
                boundary_of_token[b0 + k] = source[a0 + k][1]
        else:
            misread.append({"expected": " ".join(expected[a0:a1]), "heard": " ".join(heard[b0:b1])})
            # Keep the boundary of the last source token of a replaced span.
            if b1 > b0 and a1 > a0:
                boundary_of_token[b1 - 1] = source[a1 - 1][1]

    # Second alignment against the sent text, for words the pipeline added.
    sent_boundary: dict[int, str] = {}
    sent_ratio = None
    if sent:
        sent_words = [t[0] for t in sent]
        sent_matcher = difflib.SequenceMatcher(a=sent_words, b=heard, autojunk=False)
        sent_ratio = sent_matcher.ratio()
        for tag, a0, a1, b0, b1 in sent_matcher.get_opcodes():
            if tag == "equal":
                for k in range(a1 - a0):
                    sent_boundary[b0 + k] = sent[a0 + k][1]

    def boundary_after(word_index: int) -> str:
        token = last_token_of_word[word_index]
        if token in boundary_of_token:
            return boundary_of_token[token]
        return sent_boundary.get(token, "none")

    pauses = []
    for start, end in silences(audio, sr):
        mid = (start + end) / 2
        before = max((i for i, w in enumerate(words) if w["end"] <= mid + 0.05), default=None)
        if before is None or before + 1 >= len(words):
            continue
        pauses.append(
            {
                "after": words[before]["word"].strip(),
                "next": words[before + 1]["word"].strip(),
                "boundary": boundary_after(before),
                "seconds": round(end - start, 2),
                "at": round(start, 2),
            }
        )

    missing = [
        {"after": words[i]["word"].strip(), "boundary": boundary_after(i)}
        for i in range(len(words) - 1)
        if boundary_after(i) in SENTENCE_LIKE
        and not any(p["at"] >= words[i]["end"] - 0.3 and p["at"] <= words[i + 1]["start"] + 0.05
                    and p["seconds"] >= SENTENCE_END_MIN_S for p in pauses)
    ]
    stray = [p for p in pauses if p["boundary"] == "none" and p["seconds"] >= STRAY_PAUSE_S]

    by_boundary: dict[str, list[float]] = {}
    for p in pauses:
        by_boundary.setdefault(p["boundary"], []).append(p["seconds"])
    summary = {
        b: {
            "count": len(v),
            "mean": round(float(np.mean(v)), 2),
            "min": round(min(v), 2),
            "max": round(max(v), 2),
        }
        for b, v in sorted(by_boundary.items(), key=lambda kv: BOUNDARY_ORDER.index(kv[0]))
    }
    return {
        "audio": str(audio_path),
        "duration": round(len(audio) / sr, 2),
        "words_expected": len(expected),
        "word_accuracy": round(sent_ratio if sent_ratio is not None else matcher.ratio(), 3),
        "pauses_by_boundary": summary,
        "stray_pauses": stray,
        "missing_sentence_pauses": missing,
        "misread": misread,
    }


def print_report(r: dict) -> None:
    print(f"{r['audio']}  ({r['duration']}s, {r['words_expected']} words)")
    print(f"Word accuracy: {r['word_accuracy'] * 100:.1f}%")
    print("Pauses by boundary (seconds):")
    for b, s in r["pauses_by_boundary"].items():
        print(f"  {b:>9}: n={s['count']:<3} mean={s['mean']:.2f}  min={s['min']:.2f}  max={s['max']:.2f}")
    print(f"Stray pauses inside sentences (>= {STRAY_PAUSE_S}s): {len(r['stray_pauses'])}")
    for p in r["stray_pauses"]:
        print(f"  {p['seconds']:.2f}s at {p['at']}s between '{p['after']}' and '{p['next']}'")
    print(f"Sentence ends without a pause: {len(r['missing_sentence_pauses'])}")
    for m in r["missing_sentence_pauses"]:
        print(f"  after '{m['after']}' ({m['boundary']})")
    if r["misread"]:
        print("Misread / changed words:")
        for m in r["misread"]:
            print(f"  expected '{m['expected']}'  heard '{m['heard']}'")


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if args:
        audio, reference = Path(args[0]), Path(args[1])
    else:
        audio = max((HOME / "requests").glob("*.wav"), key=lambda p: p.stat().st_mtime)
        reference = audio.with_suffix(".txt")
    text = reference.read_text(encoding="utf-8")
    # A Markdown note is judged by its structure, not by the flattened text.
    source = markdown_tokens(text) if reference.suffix == ".md" else source_tokens(text)
    report = measure(audio, source)
    if "--json" in sys.argv:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_report(report)


if __name__ == "__main__":
    main()
