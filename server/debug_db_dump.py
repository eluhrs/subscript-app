import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from server.main import Base, User, UserPreference

# Setup DB
DATABASE_URL = "sqlite:////app/data/subscript.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def dump_prefs():
    db = SessionLocal()
    users = db.query(User).all()
    print(f"Found {len(users)} users.")
    
    for user in users:
        print(f"\nUser: {user.email} (ID: {user.id})")
        pref = db.query(UserPreference).filter(UserPreference.user_id == user.id).first()
        if pref:
            print(f"  Preferences: {pref.preferences}")
            print(f"  Type of prefs: {type(pref.preferences)}")
            if pref.preferences:
                 print(f"  tour_seen: {pref.preferences.get('tour_seen')} (Type: {type(pref.preferences.get('tour_seen'))})")
        else:
            print("  No preferences record found.")
            
    db.close()

if __name__ == "__main__":
    dump_prefs()
