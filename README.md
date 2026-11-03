# genSound

Converts audio files into generative grid art. By default, each 10×10 pixel square in the output image represents a 100ms slice of audio, colored and shaded by the musical note, amplitude, and dominant frequency detected in that slice.

## How it works

1. The audio file is read through 100ms analysis windows. By default the windows sit end to end; `--hop` makes them overlap, and `--fit` spreads them evenly so the whole track fills the grid.
2. For each window, three values are extracted:
   - **Amplitude** (RMS loudness) → controls **saturation**
   - **Dominant frequency** (FFT peak) → controls **brightness/lightness**
   - **Musical note** (YIN pitch detection) → selects the **base hue**
3. The hue, saturation, and lightness are combined and painted onto a 250×250 pixel canvas (25×25 grid of squares).

### Note-to-color mapping

| Notes | Color  | Hex       |
|-------|--------|-----------|
| C, D  | Pink   | `#F723E9` |
| E, F, G | Cyan | `#17EDFC` |
| A, B  | Lime   | `#9DFC17` |
| No note | Black | `#000000` |

A slice has no note when it is silent (more than 40 dB quieter than the loudest slice in the file) or when pitch detection finds no pitch. Those squares are painted black.

Amplitude and frequency are first normalized within each file by rank: every slice gets its percentile (0 for the quietest or lowest, 1 for the loudest or highest), and equal values share a rank. This makes every file use the full range, so a quiet recording and a loud one look comparable. The normalized amplitude scales saturation from `0.5` to `1.0`, and the normalized frequency scales lightness from `0.3` to `0.6`.

---

## Project structure

```
genSound/
├── main.py            # Orchestrator — loads audio, maps data, generates image
├── audio_utils.py     # Audio loading and analysis (FFT, YIN pitch detection)
├── color_utils.py     # RGB ↔ HSL color space conversions
├── drawing_utils.py   # Pillow canvas creation, pixel drawing, PNG save
├── layout_utils.py    # Orders in which time fills the grid (rows, rings, Hilbert curve, ...)
├── export_playground_data.py  # Saves per-window analysis for the color playground
├── playground/        # Browser version: index.html, analyzer.js (the analysis in JavaScript); data/ is generated
├── examples/          # Script to download three openly licensed example tracks, with credits
├── audio/             # Put your own audio here (ignored by git)
├── output/            # Generated PNG artwork lands here (ignored by git)
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── LICENSE            # MIT
└── THIRD_PARTY_NOTICES.md
```

genSound does not store music in the repository. Three openly licensed example tracks (piano, orchestra and electronic) can be downloaded with `python examples/fetch_examples.py`; see [examples/README.md](examples/README.md) for credits and licenses. For anything else, use your own recordings, or tracks whose license lets you share what you make from them.

---

## Requirements

- Python 3.9+
- ffmpeg (required by librosa for MP3 decoding)

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Install ffmpeg:

- **macOS:** `brew install ffmpeg`
- **Ubuntu/Debian:** `sudo apt-get install ffmpeg`
- **Windows:** Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH

---

## Usage

### Local

```bash
python main.py -i audio/song.mp3
```

This reads `audio/song.mp3` and saves to `output/generated_art.png`, creating `output/` if needed. Every setting can be changed from the command line:

```bash
python main.py -i audio/song.mp3 -o output/song.png --size 500 --pixel-size 10 --interval 50
```

| Option | Default | Meaning |
|--------|---------|---------|
| `-i`, `--input` | required | Audio file to read |
| `-o`, `--output` | `output/generated_art.png` | PNG file to write |
| `--size` | `250` | Image width and height, in pixels |
| `--pixel-size` | `10` | Width of each square, in pixels |
| `--interval` | `100` | Length of each analysis window, in milliseconds |
| `--hop` | same as `--interval` | Milliseconds between window starts; smaller than `--interval` makes windows overlap |
| `--fit` | off | Spread windows evenly across the whole track so it fills the grid exactly (cannot be combined with `--hop`) |
| `--layout` | `rows` | Order in which time fills the grid: `rows`, `serpentine`, `spiral`, `rings` or `hilbert` |

Run `python main.py --help` to see the same list.

Each square is one window, so detail comes from the number of windows, not pixels. For a large, fine image of a whole track, combine a small `--pixel-size` with `--fit`:

```bash
python main.py -i audio/song.mp3 -o output/song-1000.png --size 1000 --pixel-size 2 --fit
```

That is 250,000 overlapping windows and takes about 20 seconds for a 3-minute track.

### Layouts

| Layout | Time runs |
|--------|-----------|
| `rows` | Left to right, top to bottom, like reading |
| `serpentine` | Like `rows`, but every other row runs right to left |
| `spiral` | Outward from the center in a square spiral |
| `rings` | Outward from the center in circular rings; the corners hold the end of the track |
| `hilbert` | Along a space-filling curve, so moments close in time stay close on the canvas and form patches |

### Color playground

`playground/index.html` is genSound in the browser. It shows the rings and Hilbert layouts side by side, each with a full-screen view, and lets you try palettes and color rules live.

**Use your own audio:** choose or drop a file (MP3, WAV, OGG, M4A; up to 15 minutes). `playground/analyzer.js` runs genSound's analysis in a Web Worker, so the file never leaves the browser. It matches the Python version: on the example tracks, note names and silence agree in every window and loudness is identical. The one difference is that the strongest frequency is measured every 10 ms rather than once per window, which keeps a 3-minute track to about 10 seconds.

**Example tracks:** the page also lists tracks exported ahead of time (250,000 windows each, about 1 MB). To export the example tracks:

```bash
python examples/fetch_examples.py
```

```bash
python export_playground_data.py examples/audio
```

```bash
python -m http.server 8765 --directory playground
```

With no arguments, `export_playground_data.py` exports every file in `audio/`.

Then open http://localhost:8765. With the "genSound today" preset, its images match `main.py --size 500 --pixel-size 1 --fit` pixel for pixel (within 1 color level of rounding). The data files are not committed; rerun the export to recreate them.

### Docker

Build the image, then render a file from `audio/`:

```bash
docker compose build
```

```bash
docker compose run --rm app python main.py -i audio/song.mp3 -o output/song.png
```

The project folder is mounted into the container, so the PNG appears in `./output/` on your host. Running the container with no command prints the options.

---

## Output

The script prints diagnostic information while running:

```
Color 1 HSL: [302.  1.  0.53]
Color 2 HSL: [184.  1.  0.54]
Color 3 HSL: [ 84.  1.  0.54]
Max Amplitude: 1.0
Max Frequency: 0.998
Square 0: Amplitude = 0.0, Frequency = 0.0, Note = N/A
...
Artwork generated and saved as 'generated_art.png'
```

The resulting PNG is a 250×250 image. Each 10×10 block corresponds to one 100ms audio segment.

---

## Dependencies

| Package    | Purpose                              |
|------------|--------------------------------------|
| librosa    | Audio loading, YIN pitch detection   |
| numpy      | FFT, array math, interpolation       |
| matplotlib | RGB → HSV color conversion           |
| Pillow     | Canvas creation and PNG export       |

---

## License

MIT; see [LICENSE](LICENSE). The Hilbert-curve layout is adapted from [gilbert](https://github.com/jakubcerveny/gilbert) by Jakub Červený (BSD 2-Clause); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
