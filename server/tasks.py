import os
import logging
import sys
from server.celery_app import celery_app
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from server.main import Document, DATABASE_URL

# Setup DB session for worker
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@celery_app.task(bind=True)
def process_document_task(self, doc_id: int, file_path: str, model: str):
    db = SessionLocal()
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        logging.error(f"Document {doc_id} not found")
        return
    
    doc.status = "processing"
    db.commit()
    
    try:
        # Import subscript here to avoid circular imports or early init issues
        try:
            from subscript.__main__ import main as run_subscript_pipeline
        except ImportError:
            sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))
            from subscript.__main__ import main as run_subscript_pipeline

        original_argv = sys.argv
        
        # output_dir = os.path.dirname(file_path)
        # Derive output directory based on input path to maintain user separation
        # file_path is like /app/documents/input/{user_email}/filename.jpg
        # We want output to be /app/documents/output/{user_email}/
        try:
            relative_path = os.path.relpath(os.path.dirname(file_path), "/app/documents/input")
            output_dir = os.path.join("/app/documents/output", relative_path)
        except ValueError:
            # Fallback if path is not relative to input (e.g. legacy or absolute path issue)
            output_dir = "/app/documents/output"
            
        os.makedirs(output_dir, exist_ok=True)
        base_name = os.path.splitext(os.path.basename(file_path))[0]
        
        # Mock sys.argv for the pipeline
        sys.argv = [
            "subscript",
            model,
            file_path,
            "--output", output_dir
        ]
        
        try:
            run_subscript_pipeline()
            doc.status = "completed"
            doc.output_txt_path = os.path.join(output_dir, f"{base_name}.txt")
            doc.output_pdf_path = os.path.join(output_dir, f"{base_name}.pdf")
        except SystemExit as e:
            if e.code != 0:
                raise Exception(f"Subscript exited with code {e.code}")
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
