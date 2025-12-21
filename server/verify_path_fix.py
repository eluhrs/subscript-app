import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from server.main import Base, User, Document, populate_document_paths

# Setup DB
DATABASE_URL = "sqlite:////app/data/subscript.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def verify_fix():
    db = SessionLocal()
    # Find the test user
    # Based on previous dump, User 1 is 'eluhrs', User 2 is 'tester', maybe User 3 was 'tourtest'?
    # Let's just find the document with id 1 (rock01.jpg)
    doc = db.query(Document).filter(Document.filename == "rock01.jpg").first()
    
    if not doc:
        print("Document rock01.jpg not found.")
        return

    print(f"\n--- Before Population ---")
    print(f"Doc ID: {doc.id}")
    print(f"XML Path in DB: {getattr(doc, 'output_xml_path', 'N/A')}")
    
    # Needs user email for the helper
    user = db.query(User).filter(User.id == doc.owner_id).first()
    if not user:
        print("User not found.")
        return
        
    print(f"User Email: {user.email}")
    populate_document_paths(doc, user.email)
    
    print(f"\n--- After Population ---")
    print(f"XML Path on Object: {getattr(doc, 'output_xml_path', 'N/A')}")
    print(f"PDF Path on Object: {getattr(doc, 'output_pdf_path', 'N/A')}")

    db.close()

if __name__ == "__main__":
    verify_fix()
