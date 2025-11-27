# Subscript 2.0

A modular pipeline for Handwritten Text Recognition (HTR) and searchable PDF generation.

## Features
*   **Full-Page Context:** No more image slicing. Models see the whole page.
*   **Modular Architecture:** Swap Layout and Transcription engines easily.
*   **Engines Supported:**
    *   **Layout:** Google Vision (Recommended), Kraken (Legacy/Future)
    *   **Transcription:** Gemini 1.5 Pro (Reasoning), Google Vision (Fast)
*   **Output:** Searchable PDF with invisible text layer.

## Installation
1.  Clone the repository.
2.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
3.  Set up API keys in `.env`:
    ```
    GEMINI_API_KEY=your_key_here
    GOOGLE_APPLICATION_CREDENTIALS=path/to/service_account.json
    ```

## Usage
```bash
./subscript.py input_image.jpg --config config.yml
```

## Configuration
See `config.yml` for all options.

## Architecture
The pipeline consists of three stages:
1.  **Layout Analysis:** Detects text regions (lines/blocks).
2.  **Transcription:** Converts regions to text.
3.  **PDF Generation:** Combines image and text into a PDF.
