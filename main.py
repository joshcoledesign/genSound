import os
import numpy as np
from color_utils import rgb_to_hsl, hsl_to_rgb
from audio_utils import load_audio, analyze_audio
from drawing_utils import create_canvas, draw_pixel, save_canvas

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
audio_path = "audio/audio001.mp3"
y, sr = load_audio(audio_path)

# Analyze the audio
amplitudes, frequencies, notes = analyze_audio(y, sr)

# Debugging information
print(f"Max Amplitude: {max(amplitudes) if amplitudes else 'N/A'}")
print(f"Max Frequency: {max(frequencies) if frequencies else 'N/A'}")

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


# Ensure we have exactly the number of data points as total_objects
# Truncate or interpolate data to match total_objects
def adjust_data_length(data, target_length):
    if len(data) > target_length:
        return data[:target_length]
    elif len(data) < target_length:
        return np.pad(data, (0, target_length - len(data)), mode="edge")
    return data


scaled_amplitudes = adjust_data_length(amplitudes, total_objects)
scaled_frequencies = adjust_data_length(frequencies, total_objects)
notes = adjust_data_length(notes, total_objects)

# Debug lengths
print(f"Length of scaled_amplitudes: {len(scaled_amplitudes)}")
print(f"Length of scaled_frequencies: {len(scaled_frequencies)}")
print(f"Length of notes: {len(notes)}")
print(f"Total objects: {total_objects}")

# Iterate over the audio data and generate the artwork
for i in range(total_objects):
    x = (i % objects_per_row) * pixel_size
    y = (i // objects_per_row) * pixel_size

    amplitude = scaled_amplitudes[i]
    frequency = scaled_frequencies[i]
    note = notes[i]

    # Debugging information
    if i < 10:
        print(
            f"Square {i}: Amplitude = {amplitude}, Frequency = {frequency}, Note = {note}"
        )

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
    if i < 10:
        print(f"H: {h}, S: {s}, L: {l}")

    # Convert HSL to RGB
    color_rgb = hsl_to_rgb(h, s, l)

    # Draw the pixel on the canvas
    draw_pixel(canvas, x, y, color_rgb, pixel_size)

# Determine output path based on environment
if os.getenv("DOCKER_ENV"):
    output_path = "/usr/src/app/output/generated_art.png"
else:
    output_path = "output/generated_art.png"

# Save the generated artwork
save_canvas(canvas, output_path)

print(f"Amplitudes: {amplitudes[:10]}")
print(f"Frequencies: {frequencies[:10]}")
print(f"Notes: {notes[:10]}")
print("Artwork generated and saved as 'generated_art.png'")
