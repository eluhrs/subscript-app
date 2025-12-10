import os
import logging
import sys
import re
from datetime import datetime
from server.celery_app import celery_app
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from server.main import Document, DATABASE_URL, USER_DOCS_DIR
from server.utils import sanitize_email, sanitize_filename

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
        
        # Output directory is simply the directory of the input file
        output_dir = os.path.dirname(file_path)
            
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

            # Post-Process XML: Uniquify IDs if part of a container
            if doc.parent_id:
                xml_path = os.path.join(output_dir, f"{base_name}.xml")
                
                if os.path.exists(xml_path):
                    try:
                        with open(xml_path, "r") as f:
                            content = f.read()
                        
                        # Prefix IDs with page index (p{page_order}_)
                        page_prefix = f"p{doc.page_order}_"
                        
                        def replace_id(match):
                            prefix = match.group(1)
                            val = match.group(2)
                            suffix = match.group(3)
                            # avoid double prefixing if re-run
                            if val.startswith("p"): return match.group(0)
                            return f'{prefix}{page_prefix}{val}{suffix}'
                            
                        # TextRegion
                        content = re.sub(r'(id=["\'])(r\d+)(["\'])', replace_id, content)
                        # TextLine
                        content = re.sub(r'(id=["\'])(l\d+)(["\'])', replace_id, content)
                        
                        with open(xml_path, "w") as f:
                            f.write(content)
                        logging.info(f"Uniquified IDs in {xml_path} with prefix {page_prefix}")
                    except Exception as e:
                        logging.error(f"Failed to uniquify IDs: {e}")
            
        # Commit status update so sibling check sees it
        db.commit()

        if doc.parent_id:
            # Check if all siblings are complete
            parent = db.query(Document).filter(Document.id == doc.parent_id).first()
            if parent:
                # Count total children and completed children
                total_children = db.query(Document).filter(Document.parent_id == parent.id).count()
                completed_children = db.query(Document).filter(
                    Document.parent_id == parent.id, 
                    Document.status == "completed"
                ).count()
                
                if total_children == completed_children:
                    # Trigger merge
                    logging.info(f"All {total_children} pages for parent {parent.id} are done. Triggering merge.")
                    merge_document_task.delay(parent.id)

    except Exception as e:
        logging.error(f"Processing failed: {e}")
        doc.status = "error"
        doc.error_message = str(e)
    finally:
        sys.argv = original_argv
        db.commit()
        db.close()

@celery_app.task(bind=True)
def rebuild_pdf_task(self, doc_id: int, file_path: str):
    db = SessionLocal()
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        logging.error(f"Document {doc_id} not found")
        return
    
    # Store previous status in case of failure? 
    # For now, let's just set it to 'processing' or a custom status if supported.
    # The user requested "Updating PDF" as the dashboard message. 
    # If the dashboard just shows the doc.status string, we can set it to "updating_pdf".
    doc.status = "updating_pdf" 
    db.commit()
    
    try:
        from subscript.__main__ import main as run_subscript_pipeline

        original_argv = sys.argv
        output_dir = os.path.dirname(file_path)
            
        # Mock sys.argv for the pipeline
        # subscript input.jpg --onlypdf --output output_dir
        sys.argv = [
            "subscript",
            file_path,
            "--onlypdf",
            "--output", output_dir
        ]
        
        try:
            run_subscript_pipeline()
            doc.status = "completed"
            doc.last_modified = datetime.utcnow()
        except SystemExit as e:
            if e.code != 0:
                raise Exception(f"Subscript exited with code {e.code}")
            doc.status = "completed"
            doc.last_modified = datetime.utcnow()
            
    except Exception as e:
        logging.error(f"PDF Rebuild failed: {e}")
        doc.status = "error"
        doc.error_message = str(e)
    finally:
        sys.argv = original_argv
        db.commit()
        db.close()

@celery_app.task(bind=True)
def merge_document_task(self, parent_id: int):
    db = SessionLocal()
    parent = db.query(Document).filter(Document.id == parent_id).first()
    if not parent:
        logging.error(f"Parent Document {parent_id} not found")
        return

    try:
        original_argv = sys.argv
        logging.info(f"Starting merge for parent {parent.id}: {parent.filename}")
        parent.status = "merging"
        db.commit()

        # Get all children sorted by page_order
        children = db.query(Document).filter(
            Document.parent_id == parent.id
        ).order_by(Document.page_order).all()

        if not children:
            raise Exception("No children found to merge")

        # Construct file paths
        # They should be in the same directory as parent context?
        # User dir:
        clean_email = sanitize_email(parent.owner.email)
        # Parent filename: "MyBook.pdf". Group dir: "MyBook"
        # The children are in `documents/email/MyBook/page1.jpg`
        # We need the absolute paths to the child IMAGES (User inputs).
        # `subscript --combine output.pdf input1.jpg input2.jpg ...`
        
        # Determine paths
        # Parent output path: documents/email/MyBook.pdf (or inside the folder?)
        # User said "MyBook.pdf" row -> clickable.
        # Let's put the output PDF in the `documents/email/` root (same as MyBook.lst)
        # So it matches the "ghost" entry.
        
        user_dir = os.path.join(USER_DOCS_DIR, clean_email)
        output_pdf_path = os.path.join(user_dir, parent.filename)
        
        # Child paths
        child_paths = []
        for child in children:
            # We need to find the child's input file path.
            # child.filename = "page1.jpg"
            # child is inside the group directory "MyBook"
            base_name = os.path.splitext(parent.filename)[0]
            child_full_path = os.path.join(user_dir, base_name, child.filename)
            child_paths.append(child_full_path)

        # Import subscript
        from subscript.__main__ import main as run_subscript_pipeline

        from subscript.__main__ import main as run_subscript_pipeline

        # Mock sys.argv
        # subscript --combine output.pdf input1 input2 ...
        sys.argv = [
            "subscript",
            "--combine",
            output_pdf_path,
        ] + child_paths
        
        logging.info(f"Running subscript command: {sys.argv}")
        
        try:
            run_subscript_pipeline()
            parent.status = "completed"
            parent.output_pdf_path = output_pdf_path
            # Also set TXT path: subscript creates "filename.txt" along with PDF?
            parent.output_txt_path = os.path.splitext(output_pdf_path)[0] + ".txt"
            parent.last_modified = datetime.utcnow()
        except SystemExit as e:
            if e.code != 0:
                raise Exception(f"Subscript merge exited with code {e.code}")
            parent.status = "completed"
            parent.output_pdf_path = output_pdf_path
            parent.output_txt_path = os.path.splitext(output_pdf_path)[0] + ".txt"
            parent.last_modified = datetime.utcnow()
            
            # Generate Thumbnail: Copy the first child's debug image (or image) to parent thumbnail
            # This avoids dependencies like pdf2image/poppler
            try:
                # Find first child
                first_child = db.query(Document).filter(
                    Document.parent_id == parent.id
                ).order_by(Document.page_order).first()
                
                if first_child:
                    # Construct paths
                    # Child is in subdirectory: clean_email/group_dir/filename.jpg
                    # We need absolute path.
                    # parent.filename is "Group.pdf". Directory is "Group".
                    group_dir_name = os.path.splitext(parent.filename)[0]
                    child_filename_base = os.path.splitext(first_child.filename)[0]
                    
                    # Try debug image first, then original
                    # Note: child filename in DB is just base filename usually? or relative?
                    # Let's assume standard structure: USER_DOCS_DIR/email/group/child.jpg
                    
                    user_email = sanitize_email(parent.owner.email) # Need owner from parent
                    base_dir = os.path.join(USER_DOCS_DIR, user_email, group_dir_name)
                    
                    child_debug_path = os.path.join(base_dir, f"{child_filename_base}-debug.jpg")
                    child_img_path = os.path.join(base_dir, f"{child_filename_base}.jpg")
                    
                    # Parent thumbnail path: USER_DOCS_DIR/email/Group-debug.jpg
                    parent_thumb_path = os.path.join(USER_DOCS_DIR, user_email, f"{group_dir_name}-debug.jpg")
                    
                    if os.path.exists(child_debug_path):
                        import shutil
                        shutil.copy(child_debug_path, parent_thumb_path)
                        logging.info(f"Copied thumbnail from {child_debug_path}")
                    elif os.path.exists(child_img_path):
                        # If no debug image, resize original? Or just copy (might be large)
                        # For now, just copy. Dashboard scales it.
                        import shutil
                        shutil.copy(child_img_path, parent_thumb_path)
                        logging.info(f"Copied thumbnail from {child_img_path}")
                    else:
                        logging.warning(f"No child image found for thumbnail: {child_img_path}")
                else:
                    logging.warning("No children found for thumbnail generation")

            except Exception as e:
                 logging.warning(f"Failed to generate thumbnail: {e}")

    except Exception as e:
        logging.error(f"Merge failed: {e}")
        parent.status = "error"
        parent.error_message = str(e)
    finally:
        sys.argv = original_argv
        db.commit()
        db.close()
