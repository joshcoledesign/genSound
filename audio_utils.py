# audio_utils.py

import librosa
import numpy as np

def load_audio(audio_path):
    y, sr = librosa.load(audio_path, sr=None)
    return y, sr

def analyze_audio(y, sr, interval_ms=100):
    interval_samples = int(sr * interval_ms / 1000)
    n_fft = min(512, interval_samples)

    amplitudes = []
    frequencies = []
    notes = []

    for i in range(0, len(y), interval_samples):
        segment = y[i:i+interval_samples]

        # Calculate amplitude (RMS)
        amplitude = np.sqrt(np.mean(segment**2))
        amplitudes.append(amplitude)

        # Calculate frequency (FFT)
        fft = np.fft.fft(segment, n=n_fft)
        freqs = np.fft.fftfreq(len(fft))
        peak_freq = abs(freqs[np.argmax(np.abs(fft))] * sr)
        frequencies.append(peak_freq)

        # Identify note (pitch detection)
        pitches = librosa.yin(y=segment, sr=sr, fmin=librosa.note_to_hz('C1'), fmax=librosa.note_to_hz('C8'))
        pitches = pitches[pitches > 0]
        if len(pitches) > 0:
            note = np.median(pitches)
        else:
            note = 0
        notes.append(frequency_to_note_name(note))

    return amplitudes, frequencies, notes

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
