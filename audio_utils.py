# audio_utils.py

import librosa
import numpy as np

def load_audio(audio_path):
    y, sr = librosa.load(audio_path, sr=None)
    return y, sr

def analyze_audio(y, sr, interval_ms=100, hop_ms=None, n_windows=None, silence_db=40, return_pitches=False):
    # Each analysis window is interval_ms long. Windows start every hop_ms
    # (default: interval_ms, so they don't overlap), or, when n_windows is
    # given, are spread evenly so they cover the whole track
    window = max(1, int(sr * interval_ms / 1000))
    if n_windows:
        starts = np.round(np.linspace(0, max(len(y) - window, 0), n_windows)).astype(int)
    else:
        hop = max(1, int(sr * (hop_ms or interval_ms) / 1000))
        starts = np.arange(0, len(y), hop)
    # Zero padding lets the last windows (and YIN's 2048-sample frames) run past the end
    padded = np.pad(y, (0, max(window, 2048)))

    amplitudes = np.zeros(len(starts))
    frequencies = np.zeros(len(starts))
    freqs = np.fft.rfftfreq(window, 1 / sr)
    audible = freqs >= 20

    # Process windows in chunks to keep memory bounded
    offsets = np.arange(window)
    for i in range(0, len(starts), 1024):
        block = padded[starts[i:i+1024, None] + offsets]

        # Calculate amplitude (RMS)
        amplitudes[i:i+1024] = np.sqrt(np.mean(block**2, axis=1))

        # Calculate frequency (FFT over the whole window, ignoring sub-audible bins below 20 Hz)
        spectrum = np.abs(np.fft.rfft(block, axis=1))[:, audible]
        peaks = freqs[audible][np.argmax(spectrum, axis=1)]
        peaks[spectrum.max(axis=1) == 0] = 0.0
        frequencies[i:i+1024] = peaks

    # Identify notes (pitch detection): run YIN once over the whole track,
    # then give each window the median pitch of the YIN frames centered inside it
    fmax = librosa.note_to_hz('C8')
    yin_hop = 512
    pitch_track = librosa.yin(y=padded, sr=sr, fmin=librosa.note_to_hz('C1'), fmax=fmax,
                              frame_length=2048, hop_length=yin_hop)
    frames_per_window = max(1, int(np.ceil(window / yin_hop)))
    first = np.ceil(starts / yin_hop).astype(int)
    indices = np.minimum(first[:, None] + np.arange(frames_per_window), len(pitch_track) - 1)
    pitches = np.median(pitch_track[indices], axis=1)
    # YIN reports a pitch above fmax when it finds none
    pitches[pitches > fmax] = 0
    notes = [frequency_to_note_name(pitch) for pitch in pitches]
    amplitudes = amplitudes.tolist()
    frequencies = frequencies.tolist()

    # YIN always returns a pitch, even for silence, so mark quiet slices
    # (more than silence_db below the loudest slice) as having no note
    threshold = max(amplitudes, default=0) * 10 ** (-silence_db / 20)
    notes = ['N/A' if amplitude < threshold else note for amplitude, note in zip(amplitudes, notes)]

    # Normalize per file so every recording uses the full [0, 1] range
    has_note = np.array(notes) != 'N/A'
    amplitudes = rank_normalize(amplitudes, has_note)
    frequencies = rank_normalize(frequencies, has_note)

    if return_pitches:
        # Pitch in Hz per window (0 where none was found), for tools that need more than the note name
        return amplitudes, frequencies, notes, pitches.tolist()
    return amplitudes, frequencies, notes

def rank_normalize(values, mask):
    # Map each masked value to its percentile rank in [0, 1]; tied values
    # share their average rank, and unmasked (silent) slices become 0
    values = np.asarray(values, dtype=float)
    result = np.zeros_like(values)
    if mask.sum() < 2:
        return result.tolist()
    unique, inverse, counts = np.unique(values[mask], return_inverse=True, return_counts=True)
    average_rank = np.cumsum(counts) - (counts + 1) / 2
    result[mask] = average_rank[inverse] / (mask.sum() - 1)
    return result.tolist()

def frequency_to_note_name(frequency):
    A4 = 440.0
    C0 = A4 * pow(2, -4.75)
    if frequency == 0:
        return 'N/A'
    h = round(12 * np.log2(frequency / C0))
    octave = h // 12
    n = h % 12
    note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    return note_names[n] + str(octave)
