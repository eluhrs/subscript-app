import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from server.main import Base, User, Document

# Setup DB
DATABASE_URL = "sqlite:////app/data/subscript.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def dump_docs():
    db = SessionLocal()
    docs = db.query(Document).all()
    print(f"Found {len(docs)} documents.")
    
    for doc in docs:
        print(f"\nDoc ID: {doc.id} (User: {doc.owner_id})")
        print(f"  Filename: {doc.filename}")
        print(f"  XML Path: {doc.output_xml_path}")
            
    db.close()

if __name__ == "__main__":
    dump_docs()
