from PIL import Image, ImageDraw, ImageFont
import os
import textwrap

def create_dense_sample(path="smoke-test/sample.jpg"):
    # Create white image
    width, height = 1000, 1000
    image = Image.new('RGB', (width, height), color='white')
    draw = ImageDraw.Draw(image)
    
    # Dense paragraph text (Simple repeated sentence for easy verification)
    # We repeat it enough times to form a "paragraph" for Kraken
    text = "The quick brown fox jumps over the lazy dog. " * 10
    
    # Wrap text to simulate lines (width=40 to force multiple lines)
    lines = textwrap.wrap(text, width=40)[:5] # Take first 5 lines
    
    y = 50
    for line in lines:
        # Draw text in black
        # Using default font which is small, but should be detected as lines if spaced correctly
        # To make it "dense", we keep line spacing tight
        draw.text((50, y), line, fill='black')
        y += 25 # Tight spacing
        
    # Save
    image.save(path)
    print(f"Generated dense sample image at {path}")

if __name__ == "__main__":
    create_dense_sample()
