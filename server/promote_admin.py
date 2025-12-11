import sys
import os

# Ensure we can import from server
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from server.main import SessionLocal, User

def promote_admin(email):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.is_admin = True
            db.commit()
            print(f"SUCCESS: User {email} has been promoted to Admin.")
        else:
            print(f"ERROR: User {email} not found.")
    except Exception as e:
        print(f"ERROR: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python promote_admin.py <email>")
        sys.exit(1)
    
    promote_admin(sys.argv[1])
