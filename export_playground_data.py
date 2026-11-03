# export_playground_data.py
# Analyze each audio file in audio/ once and save the per-window values the color
# playground (playground/index.html) needs, so colors can change instantly.

import base64
import glob
import json
import os
import numpy as np
from audio_utils import load_audio, analyze_audio

C0 = 440.0 * pow(2, -4.75)  # same reference as audio_utils.frequency_to_note_name

SIDE = 500  # 500 x 500 grid = 250,000 windows, spread over the whole track
AUDIO_TYPES = ('.mp3', '.wav', '.flac', '.ogg', '.m4a')

def encode(values):
    return base64.b64encode(np.asarray(values, dtype=np.uint8).tobytes()).decode('ascii')

paths = sorted(p for p in glob.glob('audio/*') if p.lower().endswith(AUDIO_TYPES))
if not paths:
    raise SystemExit('No audio files found in audio/. Add some, then run this again.')

os.makedirs('playground/data', exist_ok=True)
names = []
for path in paths:
    name = os.path.splitext(os.path.basename(path))[0]
    y, sr = load_audio(path)
    amplitudes, frequencies, notes, pitches = analyze_audio(y, sr, n_windows=SIDE * SIDE, return_pitches=True)
    pitches = np.array(pitches)
    silent = (np.array(notes) == 'N/A') | (pitches <= 0)

    # Pitch as a MIDI note number in half-semitone steps (1-255); 0 marks silence
    midi = 69 + 12 * np.log2(np.where(silent, 440, pitches) / 440)
    midi_half = np.where(silent, 0, np.clip(np.round(midi * 2), 1, 255))
    # Exact note index genSound uses (semitones above C0), plus 1; 0 marks silence.
    # Stored separately so note names match genSound without double rounding
    note_index = np.array([0 if quiet else round(12 * np.log2(p / C0)) + 1 for quiet, p in zip(silent, pitches)])

    data = {
        'name': name,
        'duration_s': round(len(y) / sr, 2),
        'window_ms': 100,
        'side': SIDE,
        'loudness': encode(np.round(np.array(amplitudes) * 255)),
        'frequency': encode(np.round(np.array(frequencies) * 255)),
        'midi_half': encode(midi_half),
        'note_index': encode(note_index),
    }
    with open(f'playground/data/{name}.json', 'w', encoding='utf-8') as f:
        json.dump(data, f)
    names.append(name)
    print(f'{name}: {len(y) / sr:.1f}s, {int(silent.sum())} silent of {SIDE * SIDE} windows')

# The playground reads this list to fill its track menu
with open('playground/data/manifest.json', 'w', encoding='utf-8') as f:
    json.dump({'tracks': names}, f)
