import argparse
import os
import numpy as np
from color_utils import rgb_to_hsl, hsl_to_rgb
from audio_utils import load_audio, analyze_audio
from drawing_utils import create_canvas, draw_pixel, save_canvas
from layout_utils import LAYOUTS, layout_positions

# Default output path depends on environment
if os.getenv('DOCKER_ENV'):
    default_output_path = '/usr/src/app/output/generated_art.png'
else:
    default_output_path = 'output/generated_art.png'

parser = argparse.ArgumentParser(description='Turn an audio file into generative grid art.')
parser.add_argument('-i', '--input', required=True, help='path to the audio file (MP3, WAV, FLAC, ...)')
parser.add_argument('-o', '--output', default=default_output_path, help='output PNG path (default: %(default)s)')
parser.add_argument('--size', type=int, default=250, help='image width and height in pixels (default: %(default)s)')
parser.add_argument('--pixel-size', type=int, default=10, help='size of each square in pixels (default: %(default)s)')
parser.add_argument('--interval', type=int, default=100, help='analysis window in milliseconds (default: %(default)s)')
timing = parser.add_mutually_exclusive_group()
timing.add_argument('--hop', type=float, help='milliseconds between window starts; smaller than --interval makes windows overlap (default: same as --interval)')
timing.add_argument('--fit', action='store_true', help='spread windows evenly so the whole track fills the grid exactly')
parser.add_argument('--layout', choices=LAYOUTS, default='rows', help='order in which time fills the grid (default: %(default)s)')
args = parser.parse_args()

def validate_args(parser, args):
    # Reject option values that would break the grid
    if args.size <= 0:
        parser.error('--size must be greater than 0')
    if args.pixel_size <= 0:
        parser.error('--pixel-size must be greater than 0')
    if args.size % args.pixel_size != 0:
        parser.error(f'--size ({args.size}) must be a multiple of --pixel-size ({args.pixel_size})')
    if args.interval <= 0:
        parser.error('--interval must be greater than 0')
    if args.hop is not None and args.hop <= 0:
        parser.error('--hop must be greater than 0')
    if not os.path.isfile(args.input):
        parser.error(f'audio file not found: {args.input}')

validate_args(parser, args)

# Define base colors in RGB
color1_rgb = [247, 35, 233]  # Pink
color2_rgb = [23, 237, 252]  # Cyan
color3_rgb = [157, 252, 23]  # Lime
silence_rgb = (0, 0, 0)  # Black, for slices with no note

# Convert to HSL
color1_hsl = rgb_to_hsl(color1_rgb)
color2_hsl = rgb_to_hsl(color2_rgb)
color3_hsl = rgb_to_hsl(color3_rgb)

print(f"Color 1 HSL: {color1_hsl}")
print(f"Color 2 HSL: {color2_hsl}")
print(f"Color 3 HSL: {color3_hsl}")

# Load the audio file
y, sr = load_audio(args.input)

# Analyze the audio
n_windows = (args.size // args.pixel_size) ** 2 if args.fit else None
amplitudes, frequencies, notes = analyze_audio(y, sr, interval_ms=args.interval, hop_ms=args.hop, n_windows=n_windows)

# Debugging information
print(f"Max Amplitude: {max(amplitudes) if amplitudes else 'N/A'}")
print(f"Max Frequency: {max(frequencies) if frequencies else 'N/A'}")

# Define image size
image_width = args.size
image_height = args.size
canvas = create_canvas(image_width, image_height)

# Define the size of each pixel square
pixel_size = args.pixel_size

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
        return np.interp(np.linspace(0, len(data)-1, target_length), np.arange(len(data)), data)
    return data

# Notes are labels, not numbers, so stretch them by repeating the nearest slice
def adjust_note_length(notes, target_length):
    if len(notes) >= target_length:
        return notes[:target_length]
    indices = np.round(np.linspace(0, len(notes)-1, target_length)).astype(int)
    return [notes[i] for i in indices]

scaled_amplitudes = adjust_data_length(amplitudes, total_objects)
scaled_frequencies = adjust_data_length(frequencies, total_objects)
notes = adjust_note_length(notes, total_objects)

# Iterate over the audio data and generate the artwork
positions = layout_positions(args.layout, objects_per_row, objects_per_column)
for i in range(total_objects):
    x = positions[i][0] * pixel_size
    y = positions[i][1] * pixel_size

    amplitude = scaled_amplitudes[i]
    frequency = scaled_frequencies[i]
    note = notes[i]

    # Debugging information
    if i < 10:
        print(f"Square {i}: Amplitude = {amplitude}, Frequency = {frequency}, Note = {note}")

    # Silent slices have no note to map, so paint them the silence color
    if note == 'N/A':
        draw_pixel(canvas, x, y, silence_rgb, pixel_size)
        continue

    # Choose base hue based on note range
    if note.startswith(('C', 'D')):
        base_color_hsl = color1_hsl
    elif note.startswith(('E', 'F', 'G')):
        base_color_hsl = color2_hsl
    elif note.startswith(('A', 'B')):
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

# Save the generated artwork, creating the output folder if needed
output_path = args.output
os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
save_canvas(canvas, output_path)

print(f"Amplitudes: {amplitudes[:10]}")
print(f"Frequencies: {frequencies[:10]}")
print(f"Notes: {notes[:10]}")
print(f"Artwork generated and saved as '{output_path}'")
