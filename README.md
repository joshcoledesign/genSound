# Audio Visualization Project

This project generates artwork based on audio analysis. The project is structured into multiple subprojects, each having its own main script and output directory.

## Project Structure

\`\`\`
.
├── Dockerfile
├── README.md
├── __pycache__
│   ├── audio_utils.cpython-312.pyc
│   ├── audio_utils.cpython-39.pyc
│   ├── color_utils.cpython-312.pyc
│   ├── color_utils.cpython-39.pyc
│   ├── drawing_utils.cpython-312.pyc
│   └── drawing_utils.cpython-39.pyc
├── docker-compose.yml
├── proj001
│   ├── main_proj001.py
│   └── output
│       ├── generated_art0001.png
│       ├── generated_art0002.png
│       ├── generated_art0003.png
│       ├── generated_art0004.png
│       ├── generated_art0005.png
│       ├── generated_art0006.png
│       └── generated_art0007.png
├── proj002
│   ├── main_proj002.py
│   └── output
├── requirements.txt
└── shared
    ├── audio
    │   ├── audio001.mp3
    │   ├── audio002.mp3
    │   └── audio003.mp3
    ├── audio_utils.py
    ├── color_utils.py
    └── drawing_utils.py
\`\`\`

## Setup

### Prerequisites

- [Docker](https://www.docker.com/get-started)
- [Docker Compose](https://docs.docker.com/compose/install/)

### Installation

1. Clone the repository:
    \`\`\`bash
    git clone https://github.com/your-username/audio-visualization-project.git
    cd audio-visualization-project
    \`\`\`

2. Build the Docker image:
    \`\`\`bash
    docker-compose build
    \`\`\`

### Running the Projects

To run a specific project, set the \`PROJECT\` environment variable to the desired project directory and then start the container:

- **Running proj001:**
    \`\`\`bash
    PROJECT=proj001 docker-compose up
    \`\`\`

- **Running proj002:**
    \`\`\`bash
    PROJECT=proj002 docker-compose up
    \`\`\`

This will run the respective \`main_projXXX.py\` file and generate the artwork in the project's output directory.

### Building the Project

To rebuild the Docker image after making changes:
\`\`\`bash
docker-compose build
\`\`\`

### Development and Maintenance

1. **Updating Dependencies:**
    - Add new dependencies to the \`requirements.txt\` file.
    - Rebuild the Docker image to install the new dependencies:
        \`\`\`bash
        docker-compose build
        \`\`\`

2. **Adding New Audio Files:**
    - Place new audio files in the \`shared/audio\` directory.
    - Update the paths in your main script to reference the new audio files.

3. **Organizing the Output:**
    - Each project has its own \`output\` directory where generated artwork is saved.

### Notes on File Structure

- **shared/audio**: Contains audio files used by all subprojects.
- **shared/audio_utils.py**: Utility functions for audio processing.
- **shared/color_utils.py**: Utility functions for color conversions.
- **shared/drawing_utils.py**: Utility functions for drawing operations.
- **proj001**: Contains the main script and output for the first project.
- **proj002**: Contains the main script and output for the second project.

### Adding New Subprojects

To add a new subproject:

1. Create a new directory for the subproject (e.g., \`proj003\`).
2. Add your main script (e.g., \`main_proj003.py\`) to the new directory.
3. Create an \`output\` directory within the new subproject directory.
4. Ensure your new script correctly references the shared utilities and audio files.

### Example Usage

To run a script in a development environment without Docker:

1. Create a virtual environment:
    \`\`\`bash
    python -m venv venv
    source venv/bin/activate  # On Windows use \`venv\\Scripts\\activate\`
    \`\`\`

2. Install the dependencies:
    \`\`\`bash
    pip install -r requirements.txt
    \`\`\`

3. Run the script:
    \`\`\`bash
    python proj001/main_proj001.py
    \`\`\`

### Troubleshooting

- **Docker Issues:** If you encounter issues with Docker, ensure it is properly installed and running. Check the Docker documentation for more information.
- **Dependencies:** If a script fails due to a missing dependency, ensure it is listed in \`requirements.txt\` and rebuild the Docker image.

## MFCC/Chroma vs HSL Version Breakdown

### MFCC/Chroma Features Extraction

**MFCC (Mel-Frequency Cepstral Coefficients):**
- MFCCs are a representation of the short-term power spectrum of a sound, often used in speech and audio processing.
- They are derived by taking the Fourier transform of a windowed signal, mapping the powers of the spectrum onto the mel scale, taking the logarithm of the powers, and then taking the discrete cosine transform of the resulting spectrum.
- The result is a set of coefficients that represent the shape of the audio signal's spectrum.

**Chroma Features:**
- Chroma features, or chromagrams, represent the 12 different pitch classes (e.g., C, C#, D, etc.) of the audio.
- They are often used to capture harmonic and melodic characteristics of the music.
- Each frame of a chromagram represents how much energy of each pitch class is present in the audio at a given time.

**MFCC/Chroma in the Script:**
1. **Loading Audio:**
    ```python
    y, sr = librosa.load(audio_path, sr=None)
    ```
    - This loads the audio file into an array `y` and sets the sample rate `sr`.

2. **Extracting Features:**
    ```python
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=512)
    chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=512)
    ```
    - MFCCs are extracted with `librosa.feature.mfcc`.
    - Chroma features are extracted with `librosa.feature.chroma_stft`.

3. **Mapping Features to Colors:**
    ```python
    def map_features_to_colors(mfccs, chroma, target_length):
        mfccs = (mfccs - np.min(mfccs)) / (np.max(mfccs) - np.min(mfccs))
        chroma = (chroma - np.min(chroma)) / (np.max(chroma) - np.min(chroma))

        mfccs_flat = mfccs.flatten()
        chroma_flat = chroma.flatten()

        mfccs_flat = adjust_data_length(mfccs_flat, target_length)
        chroma_flat = adjust_data_length(chroma_flat, target_length)

        colors = []
        for i in range(target_length):
            h = chroma_flat[i] * 360
            s = 0.5 + mfccs_flat[i] * 0.5
            l = 0.3 + mfccs_flat[i] * 0.3
            colors.append((h, s, l))

        return colors
    ```
    - MFCCs and chroma are normalized to the range [0, 1].
    - The normalized features are then flattened and adjusted to match the target length (number of pixels).
    - For each feature, hue (`h`) is derived from the chroma value, while saturation (`s`) and lightness (`l`) are derived from the MFCC values.

### HSL (Hue, Saturation, Lightness)

**HSL Color Space:**
- **Hue (H):** Represents the color type and is an angle from 0 to 360 degrees.
- **Saturation (S):** Represents the intensity or purity of the color, ranging from 0 to 1.
- **Lightness (L):** Represents the brightness of the color, ranging from 0 to 1.

**HSL Conversion in the Script:**
1. **Convert HSL to RGB:**
    ```python
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
    ```
    - Converts HSL values to RGB values, which can be used to color the pixels on the canvas.

2. **Drawing the Canvas:**
    ```python
    def draw_pixel(canvas, x, y, color, pixel_size):
        r, g, b = hsl_to_rgb(*color)
        canvas[y:y + pixel_size, x:x + pixel_size] = [r, g, b]
    ```
    - Uses the RGB values to color the pixels on the canvas.

### Summary

- **MFCC/Chroma:** This approach uses audio features (MFCCs for spectral shape and chroma for pitch content) to generate a detailed representation of the audio signal, mapping these features to colors in the HSL color space.
- **HSL Conversion:** The mapped HSL values are converted to RGB values to color the pixels on the canvas, resulting in a visual representation of the audio's spectral and harmonic content.

### License

This project is licensed under the MIT License.

### Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements.

### Contact

For any questions, please contact josh@carbonandcole.com.

