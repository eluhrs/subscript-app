#!/usr/bin/env python3
import argparse
import os
import sys
import json
import yaml
import warnings
import logging
import textwrap
import concurrent.futures
import time
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageOps
import re

# Load environment variables from .env file
load_dotenv()

# Suppress annoying CoreML warnings from Kraken/PyTorch on macOS
warnings.filterwarnings("ignore", category=RuntimeWarning, module="coremltools")

# Suppress Google API Python version warning unless debugging
if os.environ.get("LOG_LEVEL", "INFO").upper() != "DEBUG":
    warnings.filterwarnings("ignore", category=FutureWarning, module="google.api_core.*")
import google.generativeai as genai
from lxml import etree
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

# Try importing kraken, handle missing dependency gracefully for now
try:
    from kraken import blla
except ImportError:
    blla = None

def natural_sort_key(s):
    """
    Key for natural sorting (e.g., page_2.jpg comes before page_10.jpg).
    """
    return [int(text) if text.isdigit() else text.lower()
            for text in re.split('([0-9]+)', s)]



def load_config(args):
    """
    Loads configuration from config.yml and merges with CLI args.
    Returns a dict with 'model', 'prompt', 'generation_config', and global settings.
    """
    config = {
        'model': args.model,
        'prompt': "Transcribe this handwritten text line exactly as written.",
        'temperature': 0.0,
        'generation_config': {
            'temperature': 0.0,
            'max_output_tokens': 1000
        },
        'output_dir': args.output_dir,
        'context_lines': args.context,
        'concurrency': 1,
        'preprocessing': {},
        'kraken': {}
    }

    # 1. Load from YAML if exists
    config_path = args.config if args.config else 'config.yml'
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r') as f:
                data = yaml.safe_load(f)
                
                # Load Global Settings
                config.update(data) # Merge everything first
                
                # Load Model Specifics
                models = data.get('models', {})
                if args.model in models:
                    logging.info(f"Using configuration for '{args.model}' from {config_path}")
                    model_conf = models[args.model]
                    config['model'] = model_conf.get('model', args.model)
                    config['prompt'] = model_conf.get('prompt', config['prompt'])
                    config['temperature'] = model_conf.get('temperature', config['temperature'])
                    config['generation_config'] = model_conf.get('generation_config', {})
                    config['input_token_price'] = model_conf.get('input_token_price', 0.0)
                    config['output_token_price'] = model_conf.get('output_token_price', 0.0)
        except Exception as e:
            logging.warning(f"Warning: Failed to read {config_path}: {e}")

    # 2. Override with CLI args
    if args.prompt:
        config['prompt'] = args.prompt
    if args.temp is not None:
        config['temperature'] = args.temp
    if args.concurrency is not None:
        config['concurrency'] = args.concurrency
        
    return config

def segment_image(image_path, padding=0):
    """
    Segments the image using Kraken.
    
    Args:
        image_path: Path to image file
        padding: Pixels of white border to add before segmentation (helps small images)
    
    Returns a list of lines. Each line is a dict with 'baseline', 'boundary', 'text' (empty).
    """
    if blla is None:
        logging.warning("Kraken not installed. Falling back to mock segmentation.")
        return mock_segment_image(image_path)

    logging.info(f"Segmenting {image_path}...")
    try:
        original_im = Image.open(image_path)
        
        # Add white padding if requested (helps Kraken with small/cropped images)
        if padding > 0:
            padded_width = original_im.width + (padding * 2)
            padded_height = original_im.height + (padding * 2)
            padded_im = Image.new('RGB', (padded_width, padded_height), (255, 255, 255))
            padded_im.paste(original_im, (padding, padding))
            logging.info(f"Added {padding}px white padding for segmentation")
        else:
            padded_im = original_im
        
        # Manually load default model to avoid importlib bug in kraken 4.x
        from kraken.lib import vgsl
        model_path = os.path.join(os.path.dirname(blla.__file__), 'blla.mlmodel')
        logging.info(f"Loading segmentation model from {model_path}...")
        model = vgsl.TorchVGSLModel.load_model(model_path)
        
        res = blla.segment(padded_im, model=model)
        
        # Convert Kraken Segmentation object to list of dicts
        lines = []
        for line in res.lines:
            baseline = line.baseline
            boundary = line.boundary
            
            # Adjust coordinates to remove padding offset
            if padding > 0:
                baseline = [(x - padding, y - padding) for x, y in baseline]
                boundary = [(x - padding, y - padding) for x, y in boundary]
            
            lines.append({
                'baseline': baseline,
                'boundary': boundary,
                'text': ''
            })
        return lines
    except Exception as e:
        logging.error(f"Kraken segmentation failed: {e}. Falling back to mock.")
        return mock_segment_image(image_path)

def draw_page_on_canvas(c, lines, image_path):
    """
    Draws the image and invisible text onto the current PDF canvas page.
    Does NOT save the canvas.
    """
    # Draw image
    with Image.open(image_path) as im:
        w, h = im.size
    
    c.setPageSize((w, h))
    c.drawImage(image_path, 0, 0, width=w, height=h)
    
    # Draw invisible text
    c.setFillColorRGB(0, 0, 0, 0) # Invisible
    
    for line in lines:
        text = line.get('text', '')
        if not text:
            continue
            
        # Calculate bounding box from boundary polygon
        xs = [p[0] for p in line['boundary']]
        ys = [p[1] for p in line['boundary']]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        
        box_width = max_x - min_x
        box_height = max_y - min_y
        
        # ReportLab coordinates are bottom-up, Image is top-down
        pdf_y = h - max_y 
        
        text_object = c.beginText()
        text_object.setTextRenderMode(3) # Invisible text
        font_size = box_height * 0.8
        text_object.setFont("Helvetica", font_size)
        text_object.setTextOrigin(min_x, pdf_y)
        
        # Calculate text width and stretch to fit box_width
        text_width = c.stringWidth(text, "Helvetica", font_size)
        if text_width > 0 and box_width > 0:
            scale = (box_width / text_width) * 100
            text_object.setHorizScale(scale)
        
        text_object.textLine(text)
        c.drawText(text_object)

def save_pdf(lines, image_path, output_path):
    """
    Generates a searchable PDF.
    """
    c = canvas.Canvas(output_path)
    draw_page_on_canvas(c, lines, image_path)
    c.save()
    logging.info(f"Saved PDF to {output_path}")

def detect_repetition(text, threshold=0.2):
    """
    Detects if the text contains excessive repetition.
    Simple heuristic: if the compressed length (zlib) is significantly smaller than original,
    or if specific patterns repeat.
    """
    if len(text) < 50:
        return False
        
    # Check for character repetition (e.g. "I. I. I.")
    # If > 30% of the text is just one or two characters repeated
    from collections import Counter
    counts = Counter(text)
    most_common = counts.most_common(1)
    if most_common and (most_common[0][1] / len(text)) > 0.5:
        return True
        
    # Check for substring repetition
    import zlib
    compressed = zlib.compress(text.encode('utf-8'))
    ratio = len(compressed) / len(text)
    if ratio < threshold:
        return True
        
    return False

def resize_image(image, transcription_resolution="high"):
    """
    Resizes the image to the specified transcription resolution tier.
    high: max 3072px
    medium: max 1536px
    low: max 768px
    """
    tiers = {
        "high": 3072,
        "medium": 1536,
        "low": 768
    }
    max_dim = tiers.get(transcription_resolution, 3072)
    
    width, height = image.size
    if width > max_dim or height > max_dim:
        ratio = min(max_dim / width, max_dim / height)
        new_size = (int(width * ratio), int(height * ratio))
        return image.resize(new_size, Image.Resampling.LANCZOS)
    return image

def apply_preprocessing(image, polygon, config):
    """
    Applies preprocessing steps: White Masking, Contrast, Invert.
    """
    if not config:
        return image

    # 1. White Masking (Polygon)
    if config.get('line_mask', False) and polygon:
        # Create a mask initialized to white (0) or transparent? 
        # We want to keep the polygon area and make the rest WHITE.
        
        # Create a mask image (L mode) initialized to 0 (Black)
        mask = Image.new("L", image.size, 0)
        draw = ImageDraw.Draw(mask)
        
        # Draw the polygon in White (255)
        # Polygon points need to be relative to the crop, but 'polygon' passed here 
        # is likely absolute coordinates from Kraken. 
        # Wait, we are cropping the image BEFORE calling this? 
        # If we crop first, we need to adjust polygon coordinates.
        # OR we mask the WHOLE page first, then crop?
        # Masking the whole page is safer/easier if we have the full image.
        # But transcribe_line receives a crop.
        
        # If we implement masking here, we need the polygon relative to the crop.
        # Let's skip masking inside this helper for now and implement it in process_image_data
        # where we have the crop coordinates.
        pass

    # 2. Contrast Enhancement
    if config.get('enhance_contrast', False):
        factor = config.get('contrast_factor', 1.5)
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(factor)

    # 3. Invert (Reverse Video)
    if config.get('invert', False):
        # Ensure image is RGB (ImageOps.invert supports L and RGB)
        if image.mode == 'RGBA':
            r,g,b,a = image.split()
            rgb_image = Image.merge('RGB', (r,g,b))
            inverted_image = ImageOps.invert(rgb_image)
            r2,g2,b2 = inverted_image.split()
            image = Image.merge('RGBA', (r2,g2,b2,a))
        else:
            image = ImageOps.invert(image)
            
    return image

def transcribe_line(model_name, api_key, image_slice, base_prompt, generation_config, context="", transcription_resolution="high", fallback=False, timeout=60, line_index=None, output_dir="output"):
    """
    Sends the image slice to Gemini for transcription.
    Instantiates a fresh model object to avoid thread-safety issues.
    Saves problematic images on error.
    """
    # Configure API (needed if running in thread)
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name)

    full_prompt = base_prompt
    if context:
        full_prompt += f" The previous line read: '{context}'. Use this context to resolve ambiguous characters."
    
    # Create GenerationConfig from dictionary
    gen_config = genai.types.GenerationConfig(**generation_config)

    # Disable safety settings to prevent false positives
    safety_settings = {
        genai.types.HarmCategory.HARM_CATEGORY_HARASSMENT: genai.types.HarmBlockThreshold.BLOCK_NONE,
        genai.types.HarmCategory.HARM_CATEGORY_HATE_SPEECH: genai.types.HarmBlockThreshold.BLOCK_NONE,
        genai.types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: genai.types.HarmBlockThreshold.BLOCK_NONE,
        genai.types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: genai.types.HarmBlockThreshold.BLOCK_NONE,
    }

    # Resolution Fallback Loop
    resolutions = ["high", "medium", "low"]
    
    # If fallback enabled, try lower resolutions on MAX_TOKENS error
    start_idx = 0
    if fallback:
        try:
            start_idx = resolutions.index(transcription_resolution)
        except ValueError:
            start_idx = 0 # Default to high
        
    for i in range(start_idx, len(resolutions)):
        current_res = resolutions[i]
        
        # Resize image if needed
        processed_image = resize_image(image_slice, current_res)
        
        try:
            # if line_index is not None:
            #     print(f"DEBUG: Line {line_index} Requesting (Res: {current_res})...")
            # else:
            #     print(f"DEBUG: Requesting (Res: {current_res})...")
                
            response = model.generate_content(
                [full_prompt, processed_image],
                generation_config=gen_config,
                safety_settings=safety_settings,
                request_options={'timeout': timeout}
            )
            
            # Extract Usage Metadata
            usage = {'input_tokens': 0, 'output_tokens': 0}
            if hasattr(response, 'usage_metadata'):
                usage['input_tokens'] = response.usage_metadata.prompt_token_count
                usage['output_tokens'] = response.usage_metadata.candidates_token_count
            
            # Check if response has text (even partial)
            if response.text:
                return response.text.strip(), usage
                
            # If no text property (blocked completely?)
            if response.candidates and response.candidates[0].content.parts:
                 return response.candidates[0].content.parts[0].text.strip(), usage
                 
            # If absolutely no text
            finish_reason = response.candidates[0].finish_reason if response.candidates else 'Unknown'
            
            # Check for MAX_TOKENS (Finish Reason 2)
            if str(finish_reason) == "2" or str(finish_reason) == "FinishReason.MAX_TOKENS":
                if fallback and i < len(resolutions) - 1:
                    print(f"     [Warning: Max Tokens at {current_res} resolution. Retrying at {resolutions[i+1]}...]")
                    continue # Try next resolution
            
            # Save error image
            if line_index is not None:
                err_path = os.path.join(output_dir, f"error_line_{line_index}_{current_res}.png")
                processed_image.save(err_path)
                print(f"     [Saved error image to {err_path}]")
                
            return f"[Error: {finish_reason}]", usage

        except Exception as e:
             # Check for MAX_TOKENS in exception message (sometimes SDK throws)
            if "FinishReason.MAX_TOKENS" in str(e) or "finish_reason: 2" in str(e).lower():
                if fallback and i < len(resolutions) - 1:
                    print(f"     [Warning: Max Tokens error at {current_res} resolution. Retrying at {resolutions[i+1]}...]")
                    continue

            # Save error image
            if line_index is not None:
                err_path = os.path.join(output_dir, f"error_line_{line_index}_{current_res}.png")
                processed_image.save(err_path)
                print(f"     [Saved error image to {err_path}]")

            return f"[Error: {e}]", {'input_tokens': 0, 'output_tokens': 0}
            
    return "[Error: Failed all resolution attempts]", {'input_tokens': 0, 'output_tokens': 0}

def save_page_xml(lines, image_path, output_path):
    """
    Generates PAGE XML from the lines.
    """
    # Basic PAGE XML structure
    NSMAP = {None: "http://schema.primaresearch.org/PAGE/gts/pagecontent/2013-07-15"}
    root = etree.Element("PcGts", nsmap=NSMAP)
    metadata = etree.SubElement(root, "Metadata")
    etree.SubElement(metadata, "Creator").text = "Subscript"
    etree.SubElement(metadata, "Created").text = "2024-01-01T00:00:00" # Placeholder
    
    page = etree.SubElement(root, "Page")
    page.set("imageFilename", os.path.basename(image_path))
    
    # Get image size
    with Image.open(image_path) as im:
        w, h = im.size
    page.set("imageWidth", str(w))
    page.set("imageHeight", str(h))
    
    text_region = etree.SubElement(page, "TextRegion")
    text_region.set("id", "region_0")
    
    for i, line in enumerate(lines):
        text_line = etree.SubElement(text_region, "TextLine")
        text_line.set("id", f"line_{i}")
        
        # Coords
        coords = etree.SubElement(text_line, "Coords")
        # Convert boundary list of tuples [(x,y),...] to string "x,y x,y ..."
        points = " ".join([f"{int(p[0])},{int(p[1])}" for p in line['boundary']])
        coords.set("points", points)
        
        # Baseline
        baseline = etree.SubElement(text_line, "Baseline")
        points = " ".join([f"{int(p[0])},{int(p[1])}" for p in line['baseline']])
        baseline.set("points", points)
        
        # Text
        text_equiv = etree.SubElement(text_line, "TextEquiv")
        unicode_text = etree.SubElement(text_equiv, "Unicode")
        unicode_text.text = line.get('text', '')

    tree = etree.ElementTree(root)
    tree.write(output_path, pretty_print=True, xml_declaration=True, encoding="utf-8")

import logging

# Configure logging
def setup_logging():
    log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format='%(message)s' # Keep it clean, just the message
    )

def save_text(lines, output_path):
    """
    Saves plain text output.
    """
    with open(output_path, "w", encoding="utf-8") as f:
        for line in lines:
            text = line.get('text', '')
            if text:
                f.write(text + "\n")
    logging.info(f"Saved Text to {output_path}")

def process_image_data(image_path, model, args, config):
    """
    Segments and transcribes an image. Returns lines.
    """
    logger = logging.getLogger(__name__)
    logger.info(f"Processing {image_path}...")
    
    # 1. Segment (with optional pre-segmentation padding)
    seg_padding = config.get('preprocessing', {}).get('segmentation_padding', 0)
    try:
        lines = segment_image(image_path, padding=seg_padding)
    except Exception as e:
        logger.error(f"Segmentation failed for {image_path}: {e}")
        return None, {'input_tokens': 0, 'output_tokens': 0}

    logger.info(f"Found {len(lines)} lines in {os.path.basename(image_path)}.")
    
    # 2. Transcribe
    im = Image.open(image_path)
    history = [] 
    

    # Pre-calculate bounding boxes for cropping
    for line in lines:
        xs = [p[0] for p in line['boundary']]
        ys = [p[1] for p in line['boundary']]
        line['box'] = (min(xs), min(ys), max(xs), max(ys))
    
    # --- Transcription Loop ---
    print(f"Starting transcription of {len(lines)} lines...")
    
    import time
    start_time = time.time()
    total_input_tokens = 0
    total_output_tokens = 0
    
    if config['concurrency'] > 1:
        print(f"\n--- Transcription Output ({os.path.basename(image_path)}) ---", flush=True)
        print(f"Running in PARALLEL mode (Concurrency: {config['concurrency']}). Context disabled.", flush=True)
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=config['concurrency']) as executor:
            # Submit all tasks
            future_to_line = {}
            padding = config.get('kraken', {}).get('padding', 0)
            
            for i, line in enumerate(lines):
                # 1. Calculate Padded Box
                box = list(line['box'])
                if padding > 0:
                    box[0] = max(0, box[0] - padding)
                    box[1] = max(0, box[1] - padding)
                    box[2] = min(im.width, box[2] + padding)
                    box[3] = min(im.height, box[3] + padding)
                
                # 2. Crop
                line_im = im.crop(box).convert("RGB")
                
                # --- Min Crop Size Filter ---
                min_crop_size = config.get('preprocessing', {}).get('min_crop_size', 0)
                if min_crop_size > 0:
                    width, height = line_im.size
                    area = width * height
                    if area < min_crop_size:
                        # Skip this line
                        # We need to handle the future mapping carefully.
                        # Since we are inside the loop, we can just NOT submit a future.
                        # But we need to make sure the results loop handles missing indices?
                        # Actually, better to submit a dummy future that returns empty.
                        pass # Handled below
                
                should_skip = False
                if min_crop_size > 0:
                    if (line_im.width * line_im.height) < min_crop_size:
                        should_skip = True

                if should_skip:
                     # Create a dummy future result
                    future = executor.submit(lambda: ("", {'input_tokens': 0, 'output_tokens': 0}))
                    future_to_line[future] = i
                    continue

                # 3. White Masking (Polygon)
                if config['preprocessing'].get('line_mask', False):
                    # Create mask (L mode, 0=Black/Transparent)
                    mask = Image.new("L", line_im.size, 0)
                    draw = ImageDraw.Draw(mask)
                    
                    # Convert absolute polygon to relative crop coordinates
                    min_x, min_y = box[0], box[1]
                    rel_poly = [(p[0] - min_x, p[1] - min_y) for p in line['boundary']]
                    
                    # Draw polygon in White (255=Opaque/Keep)
                    draw.polygon(rel_poly, fill=255)
                    
                    # Dilate mask if padding > 0 to include ascenders/descenders
                    if padding > 0:
                        # Kernel size must be odd. 
                        # Dilation radius R requires kernel size 2R + 1
                        kernel_size = padding * 2 + 1
                        mask = mask.filter(ImageFilter.MaxFilter(kernel_size))
                    
                    # Create white background
                    white_bg = Image.new("RGB", line_im.size, (255, 255, 255))
                    
                    # Composite: Keep original where mask is white, use white_bg elsewhere
                    line_im = Image.composite(line_im, white_bg, mask)
                
                # 4. Other Preprocessing (Contrast, Invert)
                line_im = apply_preprocessing(line_im, None, config['preprocessing'])

                # 4. Save Debug Crop (if enabled)
                if config['preprocessing'].get('save_line_crops', False):
                    base_name = os.path.splitext(os.path.basename(image_path))[0]
                    debug_dir = os.path.join(config['output_dir'], "debug_crops", base_name)
                    os.makedirs(debug_dir, exist_ok=True)
                    debug_path = os.path.join(debug_dir, f"line_{i}.jpg")
                    line_im.save(debug_path)

                # No context in parallel mode
                future = executor.submit(
                    transcribe_line, 
                    config['model'],
                    os.environ.get("GEMINI_API_KEY"),
                    line_im, 
                    config['prompt'], 
                    config['generation_config'], 
                    "", # Context
                    config['preprocessing'].get('transcription_resolution', 'high'),
                    config['preprocessing'].get('fallback_resolution', False),
                    config.get('timeout', 60),
                    i, # line_index
                    config['output_dir']
                )
                future_to_line[future] = i
            
            # Process results IN ORDER (using stored index)
        for future, i in future_to_line.items():
            try:
                text, usage = future.result()
            except Exception as e:
                text = f"[Error: {e}]"
                usage = {'input_tokens': 0, 'output_tokens': 0}
            
            lines[i]['text'] = text
            total_input_tokens += usage.get('input_tokens', 0)
            total_output_tokens += usage.get('output_tokens', 0)
            
            # Print output (formatted)
            if text.startswith("[Error"):
                    print(textwrap.fill(text, width=80, initial_indent='     ', subsequent_indent='     '), flush=True)
            else:
                    print(text, flush=True)

    else:
        # Sequential Mode (with Context)
        history = []
        print(f"\n--- Transcription Output ({os.path.basename(image_path)}) ---", flush=True)
        padding = config.get('kraken', {}).get('padding', 0)
        
        for i, line in enumerate(lines):
            # 1. Calculate Padded Box
            box = list(line['box'])
            if padding > 0:
                box[0] = max(0, box[0] - padding)
                box[1] = max(0, box[1] - padding)
                box[2] = min(im.width, box[2] + padding)
                box[3] = min(im.height, box[3] + padding)

            # 2. Crop
            line_im = im.crop(box).convert("RGB")
            
            # 3. White Masking (Polygon)
            if config['preprocessing'].get('line_mask', False):
                # Create mask (L mode, 0=Black/Transparent)
                mask = Image.new("L", line_im.size, 0)
                draw = ImageDraw.Draw(mask)
                
                # Convert absolute polygon to relative crop coordinates
                min_x, min_y = box[0], box[1]
                rel_poly = [(p[0] - min_x, p[1] - min_y) for p in line['boundary']]
                
                # Draw polygon in White (255=Opaque/Keep)
                draw.polygon(rel_poly, fill=255)
                
                # Dilate mask if padding > 0
                if padding > 0:
                    kernel_size = padding * 2 + 1
                    mask = mask.filter(ImageFilter.MaxFilter(kernel_size))
                
                # Create white background
                white_bg = Image.new("RGB", line_im.size, (255, 255, 255))
                
                # Composite: Keep original where mask is white, use white_bg elsewhere
                line_im = Image.composite(line_im, white_bg, mask)
            
            # 4. Other Preprocessing (Contrast, Invert)
            line_im = apply_preprocessing(line_im, None, config['preprocessing'])
            
            # 4. Save Debug Crop (if enabled)
            if config['preprocessing'].get('save_line_crops', False):
                base_name = os.path.splitext(os.path.basename(image_path))[0]
                debug_dir = os.path.join(config['output_dir'], "debug_crops", base_name)
                os.makedirs(debug_dir, exist_ok=True)
                debug_path = os.path.join(debug_dir, f"line_{i}.jpg")
                line_im.save(debug_path)

            # Context: Previous N lines
            context = ""
            if config['context_lines'] > 0 and history:
                start = max(0, len(history) - config['context_lines'])
                context = " ".join(history[start:])
                
            text, usage = transcribe_line(
                config['model'],
                os.environ.get("GEMINI_API_KEY"),
                line_im, 
                config['prompt'], 
                config['generation_config'], 
                context,
                config['preprocessing'].get('transcription_resolution', 'high'),
                config['preprocessing'].get('fallback_resolution', False),
                config.get('timeout', 60),
                i, # line_index
                config['output_dir']
            )
            
            total_input_tokens += usage.get('input_tokens', 0)
            total_output_tokens += usage.get('output_tokens', 0)
            
            line['text'] = text
            history.append(text)
            
            # Print output
            if text.startswith("[Error"):
                 print(textwrap.fill(text, width=80, initial_indent='     ', subsequent_indent='     '), flush=True)
            else:
                 print(text, flush=True)
    
    # --- Statistics ---
    end_time = time.time()
    duration = end_time - start_time
    m, s = divmod(duration, 60)
    h, m = divmod(m, 60)
    time_str = f"{int(h):02d}:{int(m):02d}:{int(s):02d}"
    
    input_price = config.get('input_token_price', 0.0)
    output_price = config.get('output_token_price', 0.0)
    cost = (total_input_tokens * input_price + total_output_tokens * output_price) / 1_000_000
    
    print("\n--- Statistics ---")
    print(f"Time:       {time_str}")
    print(f"Input:      {total_input_tokens} tokens")
    print(f"Output:     {total_output_tokens} tokens")
    print(f"Cost:       ${cost:.4f}")
    print("------------------\n")
        
    return lines, {'input_tokens': total_input_tokens, 'output_tokens': total_output_tokens}

def setup_args():
    parser = argparse.ArgumentParser(
        description="Handwritten input images are segmented, transcribed, and saved as a searchable PDFs.",
        usage="./subscript.py model input [options]",
        formatter_class=argparse.RawTextHelpFormatter
    )
    
    # Positional arguments
    parser.add_argument("model", help="Model nickname defined in config.yml")
    parser.add_argument("input", nargs='+', help="Path to input image(s) or directory")
    
    # Options
    parser.add_argument("--output-dir", metavar="DIR", default="output", help="Directory for output files. Default: ./output")
    parser.add_argument("--combine", metavar="FILE", help="Combine all inputs into the specified output filename.")
    parser.add_argument("--context", metavar="NUM", type=int, default=5, help="Set number of transcript lines used as context. Default: 5")
    parser.add_argument("--config", metavar="FILE", help="Path to configuration file. Default: config.yml")
    parser.add_argument("--prompt", metavar="TEXT", help="Set custom prompt (overrides value in config).")
    parser.add_argument("--temp", metavar="FLOAT", type=float, help="Set temperature (overrides value in config).")
    parser.add_argument("--concurrency", metavar="NUM", type=int, default=None, help="Number of parallel lines to process (Default: 1). Note: Parallel processing disables context.")
    
    return parser.parse_args()

def main():
    setup_logging()
    logger = logging.getLogger(__name__)
    
    args = setup_args()
    config = load_config(args)
    
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        logger.error("Error: GEMINI_API_KEY environment variable not set.")
        sys.exit(1)
        
    genai.configure(api_key=api_key)
    
    logger.info(f"Initializing model: {config['model']}")
    model = genai.GenerativeModel(config['model'])
    
    # Collect all images
    image_files = []
    for input_path in args.input:
        if os.path.isdir(input_path):
            # Add all images in directory
            for root, _, files in os.walk(input_path):
                for file in files:
                    if file.lower().endswith(('.png', '.jpg', '.jpeg', '.tif', '.tiff')):
                        image_files.append(os.path.join(root, file))
        elif os.path.isfile(input_path):
            image_files.append(input_path)
        else:
            # Handle glob patterns
            import glob
            matches = glob.glob(input_path)
            if matches:
                image_files.extend(matches)
            else:
                logger.warning(f"Input not found: {input_path}")

    if not image_files:
        logger.error("No valid image files found.")
        sys.exit(1)

    # Sort files to ensure correct order (Natural Sort)
    image_files.sort(key=natural_sort_key)
    logger.info(f"Processing {len(image_files)} images...")
    
    os.makedirs(args.output_dir, exist_ok=True)
    
    # Global Stats
    job_start_time = time.time()
    job_input_tokens = 0
    job_output_tokens = 0
    
    if args.combine:
        # Use provided filename
        combined_name = args.combine
        # Strip extension if provided, to use for both PDF and TXT
        if combined_name.lower().endswith(('.pdf', '.txt')):
            combined_name = os.path.splitext(combined_name)[0]
            
        combined_pdf_path = os.path.join(args.output_dir, f"{combined_name}.pdf")
        combined_txt_path = os.path.join(args.output_dir, f"{combined_name}.txt")
        
        c = canvas.Canvas(combined_pdf_path)
        logger.info(f"Combining outputs into {combined_pdf_path} and {combined_txt_path}")
        
        all_lines = []
        temp_txt_files = []
        
        for image_path in image_files:
            lines, stats = process_image_data(image_path, model, args, config)
            if lines:
                # Accumulate Stats
                job_input_tokens += stats.get('input_tokens', 0)
                job_output_tokens += stats.get('output_tokens', 0)

                # Save individual XML (optional but good for debugging/data)
                base_name = os.path.splitext(os.path.basename(image_path))[0]
                xml_path = os.path.join(args.output_dir, f"{base_name}.xml")
                save_page_xml(lines, image_path, xml_path)
                
                # Save Temporary Page TXT
                temp_txt_path = os.path.join(args.output_dir, f"{base_name}.txt")
                save_text(lines, temp_txt_path)
                temp_txt_files.append(temp_txt_path)
                
                # Add to PDF
                draw_page_on_canvas(c, lines, image_path)
                c.showPage()
                
                # Collect lines for combined text
                all_lines.extend(lines)
        
        c.save()
        save_text(all_lines, combined_txt_path)
        logger.info(f"Saved Combined PDF to {combined_pdf_path}")
        logger.info(f"Saved Combined Text to {combined_txt_path}")
        
        # Cleanup Temporary TXT Files
        logger.info("Cleaning up temporary page-level text files...")
        for temp_path in temp_txt_files:
            try:
                os.remove(temp_path)
            except OSError as e:
                logger.warning(f"Failed to remove temp file {temp_path}: {e}")

        # Print Job Statistics
        job_duration = time.time() - job_start_time
        m, s = divmod(job_duration, 60)
        h, m = divmod(m, 60)
        job_time_str = f"{int(h):02d}:{int(m):02d}:{int(s):02d}"
        
        input_price = config.get('input_token_price', 0.0)
        output_price = config.get('output_token_price', 0.0)
        job_cost = (job_input_tokens * input_price + job_output_tokens * output_price) / 1_000_000
        
        print("\n=== Combine Job Statistics ===")
        print(f"Total Time:   {job_time_str}")
        print(f"Total Input:  {job_input_tokens} tokens")
        print(f"Total Output: {job_output_tokens} tokens")
        print(f"Total Cost:   ${job_cost:.4f}")
        print("==============================\n")
        
    else:
        # Process individually
        for image_path in image_files:
            lines, stats = process_image_data(image_path, model, args, config)
            if lines:
                base_name = os.path.splitext(os.path.basename(image_path))[0]
                
                xml_path = os.path.join(args.output_dir, f"{base_name}.xml")
                save_page_xml(lines, image_path, xml_path)
                logger.info(f"Saved PAGE XML to {xml_path}")
                
                pdf_path = os.path.join(args.output_dir, f"{base_name}.pdf")
                save_pdf(lines, image_path, pdf_path)
                
                txt_path = os.path.join(args.output_dir, f"{base_name}.txt")
                save_text(lines, txt_path)

if __name__ == "__main__":
    main()
