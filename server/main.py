import os
import shutil
import logging
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel

# Import subscript
# We need to ensure we can import it. In Docker it's installed.
# Locally we might need to set PYTHONPATH or install it.
try:
    from subscript.__main__ import main as run_subscript_pipeline
    from subscript.modules.transcription import preprocess_image
except ImportError:
    # Fallback for local dev without install
    import sys
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))
    from subscript.__main__ import main as run_subscript_pipeline

# --- Configuration ---
UPLOAD_DIR = "/app/uploads"
OUTPUT_DIR = "/app/uploads" # Store outputs next to inputs for now
DATABASE_URL = "sqlite:////app/subscript.db"

os.makedirs(UPLOAD_DIR, exist_ok=True)

# --- Database ---
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    upload_date = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="uploaded") # uploaded, processing, completed, error
    error_message = Column(String, nullable=True)
    output_txt_path = Column(String, nullable=True)
    output_pdf_path = Column(String, nullable=True)

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Pydantic Models ---
class DocumentResponse(BaseModel):
    id: int
    filename: str
    upload_date: datetime
    status: str
    error_message: Optional[str] = None

    class Config:
        orm_mode = True

# --- App ---
app = FastAPI()

# CORS (allow all for simplicity in this setup, nginx handles real proxying)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Background Task ---
def process_document(doc_id: int, file_path: str, model: str):
    db = SessionLocal()
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        return
    
    doc.status = "processing"
    db.commit()
    
    try:
        # Construct arguments for subscript
        # subscript [SEGMENTATION] [TRANSCRIPTION] INPUT [OPTIONS]
        # We'll use default segmentation and the requested transcription model
        
        # We need to call the pipeline. The current main() parses sys.argv.
        # We should probably refactor main() to accept args, or mock sys.argv.
        # Mocking sys.argv is easiest for now without refactoring the library.
        
        import sys
        original_argv = sys.argv
        
        output_dir = os.path.dirname(file_path)
        base_name = os.path.splitext(os.path.basename(file_path))[0]
        
        sys.argv = [
            "subscript",
            model, # Transcription model nickname (e.g. 'gemini')
            file_path,
            "--output", output_dir,
            "--nopdf" # For now, maybe? User wanted PDF download. Let's keep PDF.
        ]
        
        # Run pipeline
        # Note: This runs in the same process. Subscript uses async/await internally? 
        # No, it's mostly synchronous calls to APIs.
        # It might block the worker. In production, use Celery/RQ. 
        # For this "local" setup, BackgroundTasks is okay but will block other requests if single worker.
        # FastAPI runs background tasks in a thread pool, so it should be fine.
        
        try:
            run_subscript_pipeline()
            doc.status = "completed"
            doc.output_txt_path = os.path.join(output_dir, f"{base_name}.txt")
            doc.output_pdf_path = os.path.join(output_dir, f"{base_name}.pdf")
        except SystemExit as e:
            if e.code != 0:
                raise Exception(f"Subscript exited with code {e.code}")
            # If code 0, success
            doc.status = "completed"
            doc.output_txt_path = os.path.join(output_dir, f"{base_name}.txt")
            doc.output_pdf_path = os.path.join(output_dir, f"{base_name}.pdf")
            
    except Exception as e:
        logging.error(f"Processing failed: {e}")
        doc.status = "error"
        doc.error_message = str(e)
    finally:
        sys.argv = original_argv
        db.commit()
        db.close()

# --- Endpoints ---

@app.get("/api/documents", response_model=List[DocumentResponse])
def list_documents(db: Session = Depends(get_db)):
    return db.query(Document).order_by(Document.upload_date.desc()).all()

@app.post("/api/upload", response_model=DocumentResponse)
def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    model: str = "gemini", # Default model
    db: Session = Depends(get_db)
):
    # Save file
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Create DB entry
    doc = Document(filename=file.filename, status="queued")
    db.add(doc)
    db.commit()
    db.refresh(doc)
    
    # Trigger processing
    background_tasks.add_task(process_document, doc.id, file_path, model)
    
    return doc

@app.get("/api/documents/{doc_id}", response_model=DocumentResponse)
def get_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc

# Simple Auth Mock
@app.post("/api/auth/login")
def login():
    return {"token": "mock-token", "user": {"name": "Jane Doe", "email": "jane@example.com"}}
