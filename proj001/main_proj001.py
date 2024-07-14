import sys
import os

# Add the shared directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'shared'))

import librosa
import numpy as np
from shared.color_utils import rgb_to_hsl, hsl_to_rgb
from shared.drawing_utils import create_canvas, draw_pixel, save_canvas

def load_audio(audio_path):
    y, sr = librosa.load(audio_path, sr=None)
    return y, sr

def analyze_audio(y, sr, target_length):
    interval_ms = 100  # Analyze every 100ms
    interval_samples = int(sr * interval_ms / 1000)
    n_fft = 8192  # Increase FFT size for better frequency resolution

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

    # Normalize amplitudes and frequencies
    amplitudes = np.array(amplitudes)
    frequencies = np.array(frequencies)
    amplitudes = (amplitudes - np.min(amplitudes)) / (np.max(amplitudes) - np.min(amplitudes))
    frequencies = (frequencies - np.min(frequencies)) / (np.max(frequencies) - np.min(frequencies))

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

def main():
    # Define base colors in RGB
    color1_rgb = [247, 35, 233]  # Pink
    color2_rgb = [23, 237, 252]  # Cyan
    color3_rgb = [157, 252, 23]  # Lime

    # Convert to HSL
    color1_hsl = rgb_to_hsl(color1_rgb)
    color2_hsl = rgb_to_hsl(color2_rgb)
    color3_hsl = rgb_to_hsl(color3_rgb)

    print(f"Color 1 HSL: {color1_hsl}")
    print(f"Color 2 HSL: {color2_hsl}")
    print(f"Color 3 HSL: {color3_hsl}")

    # Load the audio file
    audio_path = os.path.join("/usr/src/app/shared/audio", "audio001.mp3")
    y, sr = load_audio(audio_path)

    # Define image size
    image_width = 1920
    image_height = 1080
    canvas = create_canvas(image_width, image_height)

    # Define the size of each pixel square
    pixel_size = 5

    # Calculate the number of squares needed horizontally and vertically
    objects_per_row = image_width // pixel_size
    objects_per_column = image_height // pixel_size
    total_objects = objects_per_row * objects_per_column

    # Analyze the audio to match the number of objects
    amplitudes, frequencies, notes = analyze_audio(y, sr, total_objects)

    # Debugging information
    print(f"Audio Length: {len(y) / sr} seconds")
    print(f"Sampling Rate: {sr} Hz")
    print(f"Total Samples in Audio: {len(y)}")
    print(f"Max Amplitude: {np.max(amplitudes) if len(amplitudes) > 0 else 'N/A'}")
    print(f"Max Frequency: {np.max(frequencies) if len(frequencies) > 0 else 'N/A'}")
    print(f"Length of scaled_amplitudes: {len(amplitudes)}")
    print(f"Length of scaled_frequencies: {len(frequencies)}")
    print(f"Length of notes: {len(notes)}")
    print(f"Total objects: {total_objects}")

    # Iterate over the audio data and generate the artwork
    for i in range(total_objects):
        x = (i % objects_per_row) * pixel_size
        y = (i // objects_per_row) * pixel_size

        amplitude = amplitudes[i]
        frequency = frequencies[i]
        note = notes[i]

        # Debugging information
        if i < 10 or i % 1000 == 0:
            print(f"Square {i}: Amplitude = {amplitude}, Frequency = {frequency}, Note = {note}")

        # Choose base hue based on note range
        if note.startswith(("C", "D")):
            base_color_hsl = color1_hsl
        elif note.startswith(("E", "F", "G")):
            base_color_hsl = color2_hsl
        elif note.startswith(("A", "B")):
            base_color_hsl = color3_hsl
        else:
            base_color_hsl = color1_hsl  # Default to color1 if note is not identified

        # Modify HSL values based on amplitude and frequency
        h = base_color_hsl[0]  # Keep hue based on base color
        s = amplitude * 0.5 + 0.5  # Scale saturation to cover the range [0.5, 1]
        l = frequency * 0.3 + 0.3  # Scale lightness to cover the range [0.3, 0.6]

        # Ensure s and l are within valid range
        s = max(0, min(1, s))
        l = max(0.3, min(0.6, l))

        # Debugging HSL values
        if i < 10 or i % 1000 == 0:
            print(f"H: {h}, S: {s}, L: {l}")

        # Convert HSL to RGB
        color_rgb = hsl_to_rgb(h, s, l)

        # Draw the pixel on the canvas
        draw_pixel(canvas, x, y, color_rgb, pixel_size)

    # Save the generated artwork
    output_path = os.path.join('/usr/src/app/proj001/output', 'generated_art.png')
    save_canvas(canvas, output_path)

    print(f"Amplitudes: {amplitudes[:10]}")
    print(f"Frequencies: {frequencies[:10]}")
    print(f"Notes: {notes[:10]}")
    print("Artwork generated and saved as 'generated_art.png'")

if __name__ == "__main__":
    main()
