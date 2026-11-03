# genSound — Language & Framework Recommendations

---

## Keep Python — it's the right call

librosa is the de facto standard for audio analysis in Python. There's no meaningful equivalent in other languages that gives you YIN pitch detection, FFT helpers, and note utilities in one package. Don't change languages.

---

## Upgrade Python 3.9 → 3.12

The Dockerfile and local environment use Python 3.9, which hits end-of-life in October 2025. Python 3.12 is faster (especially for numeric loops), has better error messages, and is required by some newer library versions. It's a one-line change in the Dockerfile and a drop-in upgrade.

```dockerfile
FROM python:3.12-slim
```

---

## Replace `pip` with `uv`

This project uses raw `pip install` in the Dockerfile and has no `pyproject.toml`. Converting to `uv` gives you faster installs, a lockfile (`uv.lock`) for reproducibility, and consistency with other projects. To migrate:

1. Run `uv init` in the project root
2. Run `uv add librosa pillow matplotlib "numpy<2.0.0"` to populate `pyproject.toml`
3. Update the Dockerfile:

```dockerfile
RUN pip install uv && uv sync
```

---

## Pin all dependency versions

`requirements.txt` only pins numpy (`<2.0.0`). librosa, matplotlib, and Pillow are unpinned. librosa in particular has had breaking API changes between minor versions. Migrating to `uv` solves this automatically via `uv.lock`.

---

## Add a CLI with `typer`

`argparse` works but `typer` gives you type-annotated CLI arguments that feel native to modern Python and produces clean `--help` output with minimal boilerplate. The project now has an `argparse` CLI (see the README); moving it to `typer` would be about 15 lines of code and one dependency.

```python
import typer

app = typer.Typer()

@app.command()
def run(
    input: str = typer.Option("audio/audio001.mp3", "--input", "-i"),
    output: str = typer.Option("output/generated_art.png", "--output", "-o"),
    size: int = typer.Option(250, "--size"),
    pixel_size: int = typer.Option(10, "--pixel-size"),
    interval: int = typer.Option(100, "--interval", help="Analysis window in ms"),
):
    ...
```

---

## Optional: Prefer WAV/FLAC input over MP3

librosa decodes MP3 via ffmpeg or `audioread`, which adds a runtime dependency and a decoding step. WAV and FLAC are lossless, decode faster, and produce more accurate analysis results (no lossy compression artifacts affecting pitch detection). Making WAV/FLAC the preferred input format — with MP3 as a supported but secondary option — would remove the ffmpeg requirement from the Docker image for most use cases.

---

## Nothing else needs to change

The four-module architecture (`main.py`, `audio_utils.py`, `color_utils.py`, `drawing_utils.py`) is clean and appropriately sized. Pillow for image output and librosa for audio are both the right tools. The project is a pipeline script, and that's the right shape for what it does — no framework needed.
