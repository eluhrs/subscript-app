import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "subscript.db")

def migrate():
    print(f"Checking {DB_PATH} for share_token column...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if column exists
        cursor.execute("SELECT share_token FROM documents LIMIT 1")
        print("Column 'share_token' already exists.")
    except sqlite3.OperationalError:
        print("Adding 'share_token' column...")
        try:
            # SQLite cannot add UNIQUE column in ALTER TABLE. We do it in two steps.
            cursor.execute("ALTER TABLE documents ADD COLUMN share_token TEXT DEFAULT NULL")
            cursor.execute("CREATE UNIQUE INDEX idx_documents_share_token ON documents(share_token)")
            conn.commit()
            print("Migration successful.")
        except Exception as e:
            print(f"Migration failed: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
