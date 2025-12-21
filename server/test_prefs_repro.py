import sys
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from server.main import Base, User, UserPreference, UserPreferenceUpdate

# Setup DB
DATABASE_URL = "sqlite:////app/data/subscript.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def test_persistence():
    db = SessionLocal()
    
    # Clean up test user if exists
    test_email = "test_pref_user@example.com"
    existing = db.query(User).filter(User.email == test_email).first()
    if existing:
        db.delete(existing)
        db.commit()

    # Create User
    user = User(email=test_email, hashed_password="pw", is_admin=False)
    db.add(user)
    db.commit()
    db.refresh(user)
    
    print(f"Created User ID: {user.id}")

    # 1. Create Preference manually
    print("\n--- Test 1: Manual Creation ---")
    pref = UserPreference(user_id=user.id, preferences={"tour_seen": True})
    db.add(pref)
    db.commit()
    
    # Read back (Refresh)
    db.expire_all()
    pref = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    val = pref.preferences.get("tour_seen")
    print(f"Manual Read: Value={val}, Type={type(val)}")
    
    if val is not True:
        print("FAIL: Manual persistence failed to preserve Boolean type.")
    else:
        print("PASS: Manual persistence preserved Boolean type.")

    # 2. Update via Logic (mimic API)
    print("\n--- Test 2: Update Logic ---")
    # Simulate Pydantic input
    update_data = {"tour_seen": True} 
    # Logic from endpoint
    current_prefs = dict(pref.preferences) if pref.preferences else {}
    updated_prefs = {**current_prefs, **update_data}
    
    pref.preferences = updated_prefs
    db.commit()
    
    # Read back
    db.expire_all()
    pref = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
    val = pref.preferences.get("tour_seen")
    print(f"Update Read: Value={val}, Type={type(val)}")

    if val is not True:
         print("FAIL: Update persistence failed to preserve Boolean type.")
    else:
         print("PASS: Update persistence preserved Boolean type.")

    # Cleanup
    db.delete(user)
    db.commit()
    db.close()

if __name__ == "__main__":
    test_persistence()
