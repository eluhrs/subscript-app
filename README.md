# Manuscript OCR Pipeline

A flexible tool for transcribing images of handwritten manuscript into searchable PDFs using a combination of **Kraken** (for layout analysis), **LLMs** (for handwriting recognition), and **ReportLab** (for PDF generation).

This tool is designed to be accessible for Digital Humanities researchers while remaining hackable for developers.

## Features

-   **Hybrid Pipeline:** Uses Kraken to segment lines of text from an image, then sends each line to a Generative AI model for high-accuracy transcription.
-   **Searchable PDF Output:** Generates PDFs where the image is visible, but the text is selectable and searchable (invisible text layer).
-   **Parallel Processing:** Process multiple lines concurrently for faster transcription (disables context).
-   **Image Preprocessing:** Built-in options for contrast enhancement, color inversion, and polygon masking to improve OCR accuracy.
-   **Robust Error Handling:** Automatic resolution fallback and detailed error logging.

## Installation

### Prerequisites

1.  **Python 3.10 or 3.11** (Recommended for Kraken compatibility).
    *   *Note: Newer versions of Python may have compatibility issues with some dependencies.*
2.  **API Key**: You will need an API key for the model provider you intend to use (e.g., Google Gemini).

### Setup

1.  **Clone or Download** this repository.
2.  **Create a Virtual Environment** (Recommended):
    ```bash
    # macOS/Linux
    python3.10 -m venv venv
    source venv/bin/activate
    ```
3.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```
4.  **Configure Environment**:
    Create a `.env` file in the project root to store your API key. An sample .env.example file is provided, but be sure to add your own API keys.
    ```bash
    # Create .env file
    echo "GEMINI_API_KEY=your_api_key_here" > .env
    ```
5.  **Configuration**:
    Copy the example configuration file:
    ```bash
    cp config.example.yml config.yml
    ```

## Usage

The main script is `subscript.py`. It can be run directly from the terminal.

### Basic Syntax

```bash
./subscript.py [MODEL] [INPUT] [OPTIONS]
```

-   **MODEL**: The nickname of the model to use (defined in `config.yml`), e.g., `gemini-pro-3`.
-   **INPUT**: Path to an image, a directory of images, or a wildcard pattern.

### Examples

**1. Transcribe a single image:**
```bash
./subscript.py gemini-pro-3 my_page.jpg
```
*Output: `output/my_page.pdf`, `output/my_page.txt`, `output/my_page.xml`*

**2. Transcribe an entire directory in parallel:**
```bash
./subscript.py gemini-pro-3 ./scans/ --concurrency 5
```

**3. Combine multiple images into one book:**
```bash
./subscript.py gemini-pro-3 "scans/*.jpg" --combine my_manuscript
```
*Output: `output/my_manuscript.pdf` (all pages), `output/my_manuscript.txt`*

### Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--output-dir` | Directory for output files. | `./output` |
| `--combine` | Combine all inputs into the specified output filename. | None |
| `--context` | Set number of transcript lines used as context. | `5` |
| `--config` | Path to configuration file. | `config.yml` |
| `--prompt` | Set custom prompt (overrides value in config). | None |
| `--temp` | Set temperature (overrides value in config). | None |
| `--concurrency` | Number of parallel lines to process. Note: Parallel processing disables context. | `1` |

## Configuration (config.yml)

The `config.yml` file defines global settings, preprocessing options, and model configurations.

```yaml
# --- Global Settings ---
concurrency: 5
timeout: 600

# --- Segmentation (Kraken) ---
kraken:
  model: "default"
  padding: 10 # Padding (pixels) around the line crop

# --- Image Preprocessing ---
preprocessing:
  line_mask: true # Mask non-text areas
  enhance_contrast: true
  invert: true # Invert colors (Reverse Video)
  save_line_crops: true # Save debug crops
  resolution: "medium"

# --- Transcription Models ---
models:
  gemini-pro-3:
    model: "gemini-3-pro-preview"
    prompt: "..."

  gemini-2.5-flash:
    model: "gemini-2.5-flash"
    prompt: "..."

  gpt-4o:
    model: "gpt-4o"
    prompt: "..."
```

## License

**GNU General Public License v3.0**

Copyright (c) 2025

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.

---
*Built using:*
-   **[Kraken](https://kraken.re/)** for segmentation.
-   **[ReportLab](https://www.reportlab.com/)** for PDF generation.
-   **[Google Gemini](https://deepmind.google/technologies/gemini/)** (specifically `gemini-3-pro-preview`) for transcription.

*Inspiration*

-   Inspired by **[htr]https://github.com/lehigh-university-libraries/htr)**.
-   Developed with **[Google Antigravity](https://deepmind.google/technologies/gemini/)**.
