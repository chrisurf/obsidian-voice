"""Local, free OpenAI-compatible TTS server with German voices (Qwen3-TTS, MLX).

Open http://127.0.0.1:8880/ for a test page: paste or pick a note, hear it
read through Voice's own pipeline (with or without speech profiles), and
measure it.

Serves the endpoints Voice's "OpenAI-compatible" provider uses:
  GET  /v1/models          -> the speech model id
  GET  /v1/audio/voices    -> the German voices (with their language)
  POST /v1/audio/speech    -> {model, input, voice, response_format: wav|mp3}

Every request is logged to ~/.cache/obsidian-voice-tts/requests/<n>.{txt,wav}
(the exact text the plugin sent plus the audio), so measure.py can check what
was really read aloud.

Usage: python server.py [--port 8880] [--host 127.0.0.1]
  --host 0.0.0.0 makes it reachable from a phone or tablet on the same network.
"""

import io
import json
from pathlib import Path
import re
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load_model

from common import CLONE_MODEL, HOME, REFERENCE_TEXT, VOICES, VOICES_DIR

MODEL_ID = "qwen3-tts-de"
REQUESTS_DIR = HOME / "requests"
HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
last_request: dict = {}
# Qwen3-TTS stays most stable on moderate inputs; longer texts are split at
# sentence ends (never inside a sentence) and the audio is concatenated.
MAX_SEGMENT_CHARS = 400
SEED = 7

model = None
lock = threading.Lock()


def split_segments(text: str) -> list[str]:
    """Split at paragraph and sentence ends into segments of bounded length."""
    segments: list[str] = []
    for paragraph in re.split(r"\n\s*\n", text):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        current = ""
        for sentence in re.split(r"(?<=[.!?…])\s+", paragraph):
            if current and len(current) + len(sentence) + 1 > MAX_SEGMENT_CHARS:
                segments.append(current)
                current = sentence
            else:
                current = f"{current} {sentence}".strip()
        if current:
            segments.append(current)
    return segments or [text]


def synthesize(text: str, voice: str) -> tuple[np.ndarray, int]:
    ref = VOICES_DIR / f"{voice}.wav"
    parts = []
    for segment in split_segments(text):
        # A fixed seed makes the same text give the same audio, so before/after
        # measurements compare the pipeline, not sampling noise.
        mx.random.seed(SEED)
        results = model.generate(
            text=segment,
            ref_audio=str(ref),
            ref_text=REFERENCE_TEXT,
            lang_code="german",
        )
        parts.append(np.concatenate([np.array(r.audio) for r in results]))
    return np.concatenate(parts), model.sample_rate


def encode(audio: np.ndarray, sr: int, fmt: str) -> tuple[bytes, str]:
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
    wav = buf.getvalue()
    if fmt != "mp3":
        return wav, "audio/wav"
    mp3 = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", "pipe:0", "-f", "mp3", "-b:a", "128k", "pipe:1"],
        input=wav,
        capture_output=True,
        check=True,
    ).stdout
    return mp3, "audio/mpeg"


def log_request(text: str, voice: str, audio: np.ndarray, sr: int) -> str:
    REQUESTS_DIR.mkdir(parents=True, exist_ok=True)
    stem = time.strftime("%Y%m%d-%H%M%S") + f"-{voice}"
    (REQUESTS_DIR / f"{stem}.txt").write_text(text, encoding="utf-8")
    sf.write(REQUESTS_DIR / f"{stem}.wav", audio, sr)
    last_request.update(wav=REQUESTS_DIR / f"{stem}.wav", text=text)
    return stem


def render(markdown: str, legacy: bool) -> str:
    """The text Voice would send for this note (its own pipeline, via tsx)."""
    cmd = ["npx", "tsx", str(HERE / "render.ts"), "-"] + (["--legacy"] if legacy else [])
    return subprocess.run(
        cmd, cwd=REPO, input=markdown, capture_output=True, text=True, check=True
    ).stdout


def measure_last(markdown: str) -> dict:
    """Measure the last synthesized audio against the note's structure."""
    from measure import markdown_tokens, measure, source_tokens

    return measure(last_request["wav"], markdown_tokens(markdown), source_tokens(last_request["text"]))


class Handler(BaseHTTPRequestHandler):
    def _json(self, status: int, payload: object) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        return json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")

    def do_GET(self) -> None:
        path = self.path.rstrip("/")
        if path in ("", "/index.html"):
            body = (HERE / "test.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif path == "/corpus":
            self._json(
                200,
                {p.stem: p.read_text(encoding="utf-8") for p in sorted((HERE / "corpus").glob("*.md"))},
            )
        elif path.endswith("/models"):
            self._json(200, {"object": "list", "data": [{"id": MODEL_ID, "object": "model"}]})
        elif path.endswith("/audio/voices") or path.endswith("/voices"):
            self._json(
                200,
                {
                    "voices": [
                        {"id": k, "name": v["label"], "gender": v["gender"], "lang": v["lang"]}
                        for k, v in VOICES.items()
                    ]
                },
            )
        else:
            self._json(404, {"error": {"message": f"Not found: {self.path}"}})

    def do_POST(self) -> None:
        path = self.path.rstrip("/")
        if path in ("/render", "/measure"):
            try:
                body = self._read_json()
                markdown = str(body.get("markdown", ""))
                if path == "/render":
                    self._json(200, {"text": render(markdown, bool(body.get("legacy")))})
                elif not last_request:
                    self._json(400, {"error": {"message": "Nothing synthesized yet"}})
                else:
                    with lock:
                        self._json(200, measure_last(markdown))
            except subprocess.CalledProcessError as error:
                self._json(500, {"error": {"message": error.stderr or str(error)}})
            return
        if not path.endswith("/audio/speech"):
            self._json(404, {"error": {"message": f"Not found: {self.path}"}})
            return
        try:
            request = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
        except (ValueError, json.JSONDecodeError):
            self._json(400, {"error": {"message": "Body must be JSON"}})
            return
        text = str(request.get("input", "")).strip()
        voice = request.get("voice") or "anna"
        if voice not in VOICES:
            voice = "anna"
        if not text:
            self._json(400, {"error": {"message": "input is empty"}})
            return
        started = time.time()
        with lock:  # MLX generation is not thread-safe.
            audio, sr = synthesize(text, voice)
        data, mime = encode(audio, sr, str(request.get("response_format", "mp3")))
        stem = log_request(text, voice, audio, sr)
        print(
            f"{voice}: {len(text)} chars -> {len(audio) / sr:.1f}s audio "
            f"in {time.time() - started:.1f}s  [{stem}]",
            flush=True,
        )
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args: object) -> None:
        pass  # requests are logged in do_POST


def main() -> None:
    global model
    port = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 8880
    host = sys.argv[sys.argv.index("--host") + 1] if "--host" in sys.argv else "127.0.0.1"
    missing = [n for n in VOICES if not (VOICES_DIR / f"{n}.wav").exists()]
    if missing:
        sys.exit(f"Missing reference voices {missing} - run voices.py first.")
    model = load_model(CLONE_MODEL)
    print(f"Local German TTS on http://{host}:{port}/v1  (model {MODEL_ID})", flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
