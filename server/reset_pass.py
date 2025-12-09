import sys
import os
sys.path.append('/app')
from server.main import SessionLocal, User, get_password_hash

db = SessionLocal()
user = db.query(User).filter(User.email == "eluhrs@gmail.com").first()
if user:
    user.hashed_password = get_password_hash("password")
    db.commit()
    print("Password reset.")
else:
    print("User not found")
db.close()
