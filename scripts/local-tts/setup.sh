#!/usr/bin/env bash
# Set up the local German TTS test system (Apple Silicon, macOS).
# Creates a Python env in ~/.cache/obsidian-voice-tts, installs MLX audio and
# Whisper, and designs the two reference voices. Downloads about 6 GB of
# models into ~/.cache/huggingface on first use.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="$HOME/.cache/obsidian-voice-tts"
mkdir -p "$HOME_DIR"
if [ ! -x "$HOME_DIR/venv/bin/python" ]; then
  uv venv "$HOME_DIR/venv" --python 3.12
fi
VIRTUAL_ENV="$HOME_DIR/venv" uv pip install --python "$HOME_DIR/venv/bin/python" \
  mlx-audio mlx-whisper soundfile
command -v ffmpeg >/dev/null || echo "Note: install ffmpeg (brew install ffmpeg) for MP3 output."
cd "$HERE" && "$HOME_DIR/venv/bin/python" voices.py
echo
echo "Done. Start the server with:"
echo "  $HOME_DIR/venv/bin/python $HERE/server.py"
