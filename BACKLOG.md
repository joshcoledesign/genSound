# genSound — What Needs Work

A running list of known gaps, bugs, and improvements, ordered roughly by priority.

---

## High priority — usability

### 1. CLI / parameterization
Everything is hardcoded in `main.py`: the input file path, output path, grid size, pixel size, and analysis interval. To use a different audio file you have to edit source code.

**What to do:** Add `argparse` with at minimum:
- `--input` / `-i` — path to audio file
- `--output` / `-o` — output PNG path
- `--size` — grid dimension (default 250)
- `--pixel-size` — size of each square (default 10)
- `--interval` — analysis window in ms (default 100)

This is a ~20-line change to `main.py` and would make the tool genuinely usable without touching source.

**Status:** Resolved. All five options exist, and invalid values exit with a clear error.

---

### 2. No README / documentation
Nothing explains how to install, run, or interpret the output.

**Status:** A README has now been written. This item is resolved.

---

## Medium priority — correctness and robustness

### 3. Incomplete note-to-color mapping (`main.py:72–79`)
The note-selection logic uses `.startswith()` against the first character. This works for natural notes (C, D, E…) but the fallback for unrecognized notes silently defaults to color1 (pink). The more important gap: when `analyze_audio` gets a silent or noisy segment it returns `'N/A'` as the note name, which also falls through to the default without any signal that the data was missing.

**What to do:**
- Handle `'N/A'` explicitly (e.g., paint black or grey to visually represent silence)
- Optionally extend the mapping to treat sharps/flats the same as their root note (they currently do, but only by accident of `.startswith()`)

**Status:** Resolved. `'N/A'` never actually occurred: YIN always returns a pitch, even for silence (it reported C#8). `analyze_audio` now marks a slice `'N/A'` when it is more than 40 dB below the file's loudest slice or when YIN's pitch is above its C8 ceiling, and `main.py` paints those squares black. Stretching notes for short audio also no longer crashes (`np.interp` cannot interpolate note labels).

---

### 4. No amplitude/frequency normalization (`audio_utils.py`)
RMS amplitude and FFT peak frequency are returned as raw values. Their actual ranges depend entirely on the source file — a quiet recording will have tiny amplitudes that compress all saturation into the low end of the 0.5–1.0 range. Two different files won't produce visually comparable output.

**What to do:** Normalize amplitude and frequency to [0, 1] per file before returning from `analyze_audio`. Min-max normalization is the simplest fix:

```python
amplitudes = (amplitudes - np.min(amplitudes)) / (np.ptp(amplitudes) + 1e-8)
```

Apply the same to frequencies.

**Status:** Resolved, with a different method. Min-max made nearly every square dark, because a few outlier frequencies stretched the range. The frequency was also coarse: the FFT used only the first 512 samples (11.6 ms) of each slice, giving 86 Hz steps. `analyze_audio` now takes the FFT over the whole slice (ignoring bins below 20 Hz) and rank-normalizes amplitude and frequency to [0, 1] across non-silent slices, with ties sharing their average rank. A file played back 10x quieter now produces identical output.

---

### 5. Misleading fallback in note detection (`audio_utils.py:36–37`)
When YIN finds no valid pitches in a segment (silent or noisy audio), the code sets `note = 0` and passes that to `frequency_to_note_name(0)`, which returns `'N/A'`. That's fine. But the variable is named `note` even though it's `0` (not a frequency), which makes the code harder to follow and could cause subtle bugs if the logic changes.

**What to do:** Rename for clarity and add a comment. Low effort, low risk.

---

### 6. `color_utils.py` doesn't validate hue input range
`hsl_to_rgb` assumes `h` is in [0, 360). If `h` equals exactly 360 (or somehow goes out of range), all `if/elif` branches are skipped and `rgb` is never assigned, causing a `NameError` at runtime.

**What to do:** Add a clamp or `h = h % 360` at the top of `hsl_to_rgb`.

---

### 7. No error handling for bad inputs
- If the audio file doesn't exist, librosa raises an unhelpful exception.
- If the output directory doesn't exist, Pillow raises `FileNotFoundError`.
- If the audio file is too short to fill the grid, interpolation silently stretches it.

**What to do:** Add a few guard clauses at the top of `main.py` and wrap `load_audio` with a clear error message.

---

## Low priority — nice to have

### 8. No unit tests
The color conversion math in `color_utils.py` and the note detection logic in `audio_utils.py` are good candidates for simple round-trip tests. A broken `hsl_to_rgb` would silently produce wrong colors with no warning.

---

### 9. Batch processing mode
Right now only one audio file can be processed per run. A `--batch` flag or directory input could process all MP3s in a folder and write numbered PNGs to the output directory.

---

### 10. Performance: `ImageDraw` object is recreated each pixel (`drawing_utils.py:9`)
`ImageDraw.Draw(canvas)` is called inside `draw_pixel`, which means it's instantiated once per square (625 times for a 250×250 / 10px grid). It should be created once and passed in, or the drawing loop should be refactored to batch all draws.

---

### 11. Docker hardcodes a single audio file (`Dockerfile:14`)
```dockerfile
COPY /audio/audio001.mp3 /usr/src/app/audio/audio001.mp3
```
This line is redundant — the `COPY . .` on line 12 already copies the entire directory. It also breaks if you rename the file. Remove it.

**Status:** Resolved. The line is removed; audio is no longer bundled with the repository.

---

### 12. Config file for palette customization
The three base colors are hardcoded in `main.py:8–10`. A JSON or YAML config would let you swap palettes without touching code — useful if you want to experiment with different color stories for different types of audio.
