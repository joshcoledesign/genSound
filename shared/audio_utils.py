import librosa
import numpy as np

def load_audio(audio_path):
    y, sr = librosa.load(audio_path, sr=None)
    return y, sr

def analyze_audio(y, sr, target_length):
    interval_ms = 100  # Analyze every 100ms
    interval_samples = int(sr * interval_ms / 1000)
    n_fft = 2048  # Increase FFT size for better frequency resolution

    amplitudes = []
    frequencies = []
    notes = []

    print(f"Audio Length in Samples: {len(y)}")
    print(f"Interval Samples: {interval_samples}")

    for i in range(0, len(y), interval_samples):
        segment = y[i : i + interval_samples]
        if len(segment) < interval_samples:
            segment = np.pad(segment, (0, interval_samples - len(segment)), 'constant')

        amplitude = np.sqrt(np.mean(segment**2))
        amplitudes.append(amplitude)

        fft = np.fft.fft(segment, n=n_fft)
        freqs = np.fft.fftfreq(len(fft))
        peak_freq = abs(freqs[np.argmax(np.abs(fft))] * sr)
        frequencies.append(peak_freq)

        pitch = librosa.yin(segment, fmin=librosa.note_to_hz("C1"), fmax=librosa.note_to_hz("C8"))
        pitch = pitch[pitch > 0]
        if len(pitch) > 0:
            note = librosa.hz_to_note(np.median(pitch))
        else:
            note = "C1"
        notes.append(note)

        # Debugging to ensure dynamic analysis
        if i < interval_samples * 10 or i % (interval_samples * 1000) == 0:
            print(f"Segment {i // interval_samples}: Amplitude = {amplitude}, Frequency = {peak_freq}, Note = {note}")

    # Ensure we have exactly the number of data points as target_length
    def adjust_data_length(data, target_length):
        if len(data) > target_length:
            return data[:target_length]
        elif len(data) < target_length:
            return np.pad(data, (0, target_length - len(data)), mode="edge")
        return data

    amplitudes = adjust_data_length(amplitudes, target_length)
    frequencies = adjust_data_length(frequencies, target_length)
    notes = adjust_data_length(notes, target_length)

    return amplitudes, frequencies, notes
