import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from server.main import Base, User, Document, USER_DOCS_DIR

# Setup DB
DATABASE_URL = "sqlite:////app/data/subscript.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def inspect_latest_user():
    db = SessionLocal()
    # Get latest user
    user = db.query(User).order_by(User.id.desc()).first()
    if not user:
        print("No users found.")
        return

    print(f"Latest User: {user.email} (ID: {user.id})")
    
    docs = db.query(Document).filter(Document.owner_id == user.id).all()
    print(f"Found {len(docs)} documents for user.")

    for doc in docs:
        print(f"\n[Doc ID: {doc.id}]")
        print(f"  Filename: {doc.filename}")
        print(f"  Directory Name: {doc.directory_name}")
        print(f"  Status: {doc.status}")
        print(f"  DB PDF Path: {doc.output_pdf_path}")
        print(f"  DB XML Path: {getattr(doc, 'output_xml_path', 'N/A')}")
        
        # Check Filesystem
        user_dir = os.path.join(USER_DOCS_DIR, user.email)
        if doc.directory_name:
            doc_dir = os.path.join(user_dir, doc.directory_name)
        else:
            doc_dir = user_dir
            
        print(f"  Expected Dir: {doc_dir}")
        if os.path.exists(doc_dir):
            print("  Listing Dir Contents:")
            for f in os.listdir(doc_dir):
                print(f"    - {f}")
        else:
            print("  !! Directory does not exist !!")

    db.close()

if __name__ == "__main__":
    inspect_latest_user()
