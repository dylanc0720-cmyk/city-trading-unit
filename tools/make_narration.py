"""Render every narrator line with Kokoro and pack them into one audio sprite.

Usage: python make_narration.py <models_dir> <out_dir> [voice] [speed]
Writes <out_dir>/narration.m4a and <out_dir>/narration.json ({id: [start, duration]}).
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from narration_script import LINES  # noqa: E402

models, out_dir = sys.argv[1], sys.argv[2]
voice = sys.argv[3] if len(sys.argv) > 3 else "bf_emma"
speed = float(sys.argv[4]) if len(sys.argv) > 4 else 0.95
only = sys.argv[5].split(",") if len(sys.argv) > 5 else None

kokoro = Kokoro(os.path.join(models, "kokoro-v1.0.onnx"), os.path.join(models, "voices-v1.0.bin"))
SR = 24000
# Generous silent padding so AAC encoder delay can't clip the start or end of a line.
# The app overlaps the pads when it chains clips together.
GAP = np.zeros(int(SR * 0.1), dtype=np.float32)
PAD = np.zeros(int(SR * 0.12), dtype=np.float32)


def trim(x, thresh=0.012):
    idx = np.where(np.abs(x) > thresh)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(SR * 0.015))
    b = min(len(x), idx[-1] + int(SR * 0.06))
    return x[a:b]


ids = [k for k in LINES if (only is None or any(k.startswith(p) for p in only))]
chunks, index, pos = [], {}, 0
for n, key in enumerate(ids):
    text = LINES[key]
    samples, sr = kokoro.create(text, voice=voice, speed=speed, lang="en-gb")
    assert sr == SR, sr
    clip = np.concatenate([PAD, trim(samples.astype(np.float32)), PAD])
    index[key] = [round(pos / SR, 4), round(len(clip) / SR, 4)]
    chunks += [clip, GAP]
    pos += len(clip) + len(GAP)
    if n % 25 == 0:
        print(f"{n + 1}/{len(ids)} {key}", flush=True)

audio = np.concatenate(chunks)
peak = float(np.max(np.abs(audio))) or 1.0
audio = audio * (0.89 / peak)
os.makedirs(out_dir, exist_ok=True)
with tempfile.TemporaryDirectory() as td:
    wav = os.path.join(td, "narration.wav")
    sf.write(wav, audio, SR)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-c:a", "aac", "-b:a", "64k",
                    os.path.join(out_dir, "narration.m4a")], check=True)
with open(os.path.join(out_dir, "narration.json"), "w") as f:
    json.dump({"voice": voice, "clips": index}, f, separators=(",", ":"))
print(f"done: {len(ids)} clips, {pos / SR:.1f}s of audio, voice {voice}")
