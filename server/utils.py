import re
import os

def sanitize_filename(filename: str) -> str:
    """
    Sanitize a filename to be safe for filesystem usage.
    Removes dangerous characters and path separators.
    """
    # Remove path separators
    filename = os.path.basename(filename)
    
    # Replace anything that isn't alphanumeric, dot, or dash/underscore with empty
    # We keep spaces as underscores to avoid issues
    s = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    
    # Remove multiple underscores
    s = re.sub(r'_+', '_', s)
    
    # Strip leading/trailing underscores or dots
    s = s.strip('._')
    
    # Ensure it's not empty
    if not s:
        s = "unnamed_file"
        
    return s

def sanitize_email(email: str) -> str:
    """
    Sanitize an email address for use as a directory name.
    """
    # Remove path separators just in case
    email = os.path.basename(email)
    
    # Replace @ with _at_ for cleaner fs handling if desired, 
    # but for now just keeping it alphanumeric + . - _ @ is usually fine 
    # IF the FS supports it. To be super safe, let's keep it restricted.
    s = re.sub(r'[^a-zA-Z0-9._@-]', '_', email)
    return s

def create_thumbnail(image_path: str, thumb_path: str, size: tuple = (300, 300)) -> bool:
    """
    Generate a thumbnail for the given image path.
    Saves it to thumb_path.
    Returns True if successful, False otherwise.
    """
    try:
        from PIL import Image
        with Image.open(image_path) as img:
            img.thumbnail(size)
            if img.mode != 'RGB':
                img = img.convert('RGB')
            img.save(thumb_path, "JPEG", quality=80)
            return True
    except Exception as e:
        import logging
        logging.error(f"Error generating thumbnail for {image_path}: {e}")
        return False


