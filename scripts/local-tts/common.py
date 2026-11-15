"""Shared paths and model ids for the local German TTS test system."""

from pathlib import Path

# Everything heavy (venv, reference voices) lives outside the repo, which may
# sit in a synced folder. Models are cached by Hugging Face in ~/.cache/huggingface.
HOME = Path.home() / ".cache" / "obsidian-voice-tts"
VOICES_DIR = HOME / "voices"

# Designs a voice from a text description (used once, by voices.py).
DESIGN_MODEL = "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-6bit"
# Clones a reference recording, so every request uses the same voice.
CLONE_MODEL = "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-6bit"
# Speech recognition with word timestamps, for measure.py.
WHISPER_MODEL = "mlx-community/whisper-large-v3-turbo"

# Reference sentence each voice is designed with; its transcript is the
# ref_text for cloning, so it must match the audio exactly.
REFERENCE_TEXT = (
    "Guten Tag und herzlich willkommen. Ich lese Ihnen heute einen Text vor, "
    "ruhig, deutlich und mit natürlichen Pausen. Lehnen Sie sich zurück und hören Sie zu."
)

VOICES = {
    "anna": {
        "label": "Anna",
        "gender": "female",
        "lang": "de-DE",
        "instruct": (
            "Eine warme, ruhige deutsche Sprecherin mittleren Alters mit klarer "
            "Aussprache, Hörbuch-Stil, Hochdeutsch ohne Akzent."
        ),
    },
    "jonas": {
        "label": "Jonas",
        "gender": "male",
        "lang": "de-DE",
        "instruct": (
            "Ein freundlicher, sonorer deutscher Sprecher um die vierzig, "
            "gelassen und deutlich, Hörbuch-Stil, Hochdeutsch ohne Akzent."
        ),
    },
}
