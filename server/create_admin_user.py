import sys
import os
import getpass

# Ensure we can import from server
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from server.main import SessionLocal, User, get_password_hash

def create_admin_user(email, password, full_name=None):
    db = SessionLocal()
    try:
        # Check if user already exists
        existing_user = db.query(User).filter(User.email == email).first()
        if existing_user:
            print(f"ERROR: User {email} already exists.")
            return

        hashed_password = get_password_hash(password)
        db_user = User(
            email=email,
            hashed_password=hashed_password,
            full_name=full_name,
            is_admin=True
        )
        db.add(db_user)
        db.commit()
        print(f"SUCCESS: Admin user {email} created successfully.")
    except Exception as e:
        print(f"ERROR: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python create_admin_user.py <email> [full_name]")
        sys.exit(1)
    
    email = sys.argv[1]
    
    if len(sys.argv) > 2:
        full_name = sys.argv[2]
    else:
        full_name = "Admin User"

    # Check for password in args or env
    if len(sys.argv) > 3:
        password = sys.argv[3]
    elif os.environ.get("ADMIN_PASSWORD"):
        password = os.environ.get("ADMIN_PASSWORD")
    else:
        # Prompt for password securely
        password = getpass.getpass(prompt=f"Enter password for {email}: ")
        confirm_password = getpass.getpass(prompt="Confirm password: ")

        if password != confirm_password:
            print("ERROR: Passwords do not match.")
            sys.exit(1)
    
    if not password:
         print("ERROR: Password cannot be empty.")
         sys.exit(1)

    create_admin_user(email, password, full_name)
