import sys
import os

# Add the shared directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'shared'))

import librosa
import numpy as np
import matplotlib.pyplot as plt

def load_audio(audio_path):
    y, sr = librosa.load(audio_path, sr=None)
    return y, sr

def extract_features(y, sr, n_mfcc=13, hop_length=512):
    # Extract MFCCs
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc, hop_length=hop_length)
    # Extract chroma features
    chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=hop_length)
    return mfccs, chroma

def map_features_to_colors(mfccs, chroma, target_length):
    # Normalize features
    mfccs = (mfccs - np.min(mfccs)) / (np.max(mfccs) - np.min(mfccs))
    chroma = (chroma - np.min(chroma)) / (np.max(chroma) - np.min(chroma))

    # Flatten features
    mfccs_flat = mfccs.flatten()
    chroma_flat = chroma.flatten()

    # Adjust lengths to match target_length
    def adjust_data_length(data, target_length):
        if len(data) > target_length:
            return data[:target_length]
        elif len(data) < target_length:
            return np.pad(data, (0, target_length - len(data)), mode="edge")
        return data

    mfccs_flat = adjust_data_length(mfccs_flat, target_length)
    chroma_flat = adjust_data_length(chroma_flat, target_length)

    colors = []
    for i in range(target_length):
        h = chroma_flat[i] * 360  # Map chroma to hue
        s = 0.5 + mfccs_flat[i] * 0.5  # Map MFCC to saturation
        l = 0.3 + mfccs_flat[i] * 0.3  # Map MFCC to lightness
        colors.append((h, s, l))

    return colors

def hsl_to_rgb(h, s, l):
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs((h / 60) % 2 - 1))
    m = l - c / 2
    if 0 <= h < 60:
        r, g, b = c, x, 0
    elif 60 <= h < 120:
        r, g, b = x, c, 0
    elif 120 <= h < 180:
        r, g, b = 0, c, x
    elif 180 <= h < 240:
        r, g, b = 0, x, c
    elif 240 <= h < 300:
        r, g, b = x, 0, c
    else:
        r, g, b = c, 0, x
    return (r + m, g + m, b + m)

def create_canvas(width, height):
    return np.zeros((height, width, 3))

def draw_pixel(canvas, x, y, color, pixel_size):
    r, g, b = hsl_to_rgb(*color)
    canvas[y:y + pixel_size, x:x + pixel_size] = [r, g, b]

def save_canvas(canvas, path):
    plt.imsave(path, canvas)

def main(draw_order="top_to_bottom"):
    # Determine audio path based on environment
    if os.getenv("DOCKER_ENV"):
        audio_path = "/usr/src/app/shared/audio/audio001.mp3"
        output_path = "/usr/src/app/proj002/output/generated_art.png"
    else:
        audio_path = "shared/audio/audio001.mp3"
        output_path = "proj002/output/generated_art.png"

    y, sr = load_audio(audio_path)

    # Extract audio features
    mfccs, chroma = extract_features(y, sr)

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

    # Map features to colors
    colors = map_features_to_colors(mfccs, chroma, total_objects)

    if draw_order == "top_to_bottom":
        # Draw the canvas from top to bottom, left to right
        for x in range(0, image_width, pixel_size):
            for y in range(0, image_height, pixel_size):
                draw_pixel(canvas, x, y, colors.pop(0), pixel_size)
    elif draw_order == "left_to_right":
        # Draw the canvas from left to right, top to bottom
        for y in range(0, image_height, pixel_size):
            for x in range(0, image_width, pixel_size):
                draw_pixel(canvas, x, y, colors.pop(0), pixel_size)

    # Save the generated artwork
    save_canvas(canvas, output_path)
    print("Artwork generated and saved as 'generated_art.png'")

if __name__ == "__main__":
    main(draw_order="left_to_right")  # Change to "left_to_right" if needed
