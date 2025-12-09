import sqlite3
import os

DB_PATH = "/app/subscript.db"

def migrate():
    # Connect
    if not os.path.exists(DB_PATH):
        print("Database not found.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check columns
    cursor.execute("PRAGMA table_info(documents)")
    columns = [info[1] for info in cursor.fetchall()]

    if "last_modified" not in columns:
        print("Adding last_modified column...")
        cursor.execute("ALTER TABLE documents ADD COLUMN last_modified DATETIME")
        
        # Populate with upload_date or current time
        # We can just copy upload_date
        cursor.execute("UPDATE documents SET last_modified = upload_date")
        
        conn.commit()
        print("Migration successful.")
    else:
        print("Column last_modified already exists.")

    conn.close()

if __name__ == "__main__":
    migrate()
