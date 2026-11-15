"""Design the German reference voices once (Qwen3-TTS VoiceDesign).

Writes <name>.wav per voice into ~/.cache/obsidian-voice-tts/voices; the
server clones these recordings so every request sounds like the same speaker.
Run again with --force to redesign them.
"""

import sys

import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load_model

from common import DESIGN_MODEL, REFERENCE_TEXT, VOICES, VOICES_DIR


def main() -> None:
    force = "--force" in sys.argv
    VOICES_DIR.mkdir(parents=True, exist_ok=True)
    todo = [n for n in VOICES if force or not (VOICES_DIR / f"{n}.wav").exists()]
    if not todo:
        print(f"Voices already designed in {VOICES_DIR}")
        return
    model = load_model(DESIGN_MODEL)
    for name in todo:
        results = model.generate_voice_design(
            text=REFERENCE_TEXT, language="German", instruct=VOICES[name]["instruct"]
        )
        audio = np.concatenate([np.array(r.audio) for r in results])
        sf.write(VOICES_DIR / f"{name}.wav", audio, model.sample_rate)
        print(f"Designed {name}: {len(audio) / model.sample_rate:.1f}s")


if __name__ == "__main__":
    main()
