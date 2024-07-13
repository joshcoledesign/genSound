import librosa
import numpy as np


def load_audio(audio_path):
    y, sr = librosa.load(audio_path, sr=None)
    return y, sr


def analyze_audio(y, sr):
    interval_ms = 100
    interval_samples = int(sr * interval_ms / 1000)
    n_fft = min(512, interval_samples)

    amplitudes = []
    frequencies = []
    notes = []

    for i in range(0, len(y), interval_samples):
        segment = y[i : i + interval_samples]

        amplitude = np.sqrt(np.mean(segment**2))
        amplitudes.append(amplitude)

        fft = np.fft.fft(segment, n=n_fft)
        freqs = np.fft.fftfreq(len(fft))
        peak_freq = abs(freqs[np.argmax(np.abs(fft))] * sr)
        frequencies.append(peak_freq)

        pitch = librosa.yin(
            segment, fmin=librosa.note_to_hz("C1"), fmax=librosa.note_to_hz("C8")
        )
        pitch = pitch[pitch > 0]
        if len(pitch) > 0:
            note = librosa.hz_to_note(np.median(pitch))
        else:
            note = "C1"
        notes.append(note)

    return amplitudes, frequencies, notes
