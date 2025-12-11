import sqlite3
import os

DB_PATH = "/app/subscript.db"

def migrate():
    print(f"Checking {DB_PATH} for is_locked column...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT is_locked FROM users LIMIT 1")
        print("Column 'is_locked' already exists.")
    except sqlite3.OperationalError:
        print("Adding 'is_locked' column...")
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN is_locked BOOLEAN DEFAULT 0")
            conn.commit()
            print("Migration successful.")
        except Exception as e:
            print(f"Migration failed: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
