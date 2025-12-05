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
