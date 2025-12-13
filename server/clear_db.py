import sys
import os

# Ensure the parent directory (/app) is in sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.database import SessionLocal
from server.models import Document

def clear_docs():
    db = SessionLocal()
    try:
        count = db.query(Document).delete()
        db.commit()
        print(f"Deleted {count} records.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    clear_docs()
