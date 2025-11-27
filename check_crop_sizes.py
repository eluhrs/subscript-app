from PIL import Image
import os
import glob

def check_sizes():
    crop_dir = "smoke-test/output/basic/debug_crops/sample"
    files = glob.glob(os.path.join(crop_dir, "*.jpg"))
    files.sort()
    
    print(f"Found {len(files)} crops.")
    print(f"{'File':<15} {'Width':<10} {'Height':<10} {'Area':<10}")
    print("-" * 50)
    
    for f in files:
        im = Image.open(f)
        w, h = im.size
        area = w * h
        name = os.path.basename(f)
        print(f"{name:<15} {w:<10} {h:<10} {area:<10}")

if __name__ == "__main__":
    check_sizes()
