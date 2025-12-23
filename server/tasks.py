import os
import logging
import subprocess
import sys
import re
from datetime import datetime
from server.celery_app import celery_app
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from server.main import Document, DATABASE_URL, USER_DOCS_DIR
from server.utils import sanitize_email, sanitize_filename
import io
import contextlib

import io
import contextlib
import json
import yaml

# Setup DB session for worker
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@celery_app.task(bind=True)
def process_document_task(self, doc_id: int, file_path: str, model: str, options: str = None):
    db = SessionLocal()
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        logging.error(f"Document {doc_id} not found")
        return
    
    doc.status = "processing"
    db.commit()
    
    try:
        # Output directory is simply the directory of the input file
        output_dir = os.path.dirname(file_path)
        os.makedirs(output_dir, exist_ok=True)
        base_name = os.path.splitext(os.path.basename(file_path))[0]
        
        # Parse Options
        prompt_override = None
        temperature_override = None
        segmentation_model = "historical-manuscript" # Default
        preprocessing_opts = {}

        if options:
            try:
                opts = json.loads(options)
                logging.info(f"Task {doc_id} parsed options: {opts}")
                
                transcription_opts = opts.get('transcription', {})
                prompt_override = transcription_opts.get('prompt')
                temperature_override = transcription_opts.get('temperature')
                
                if 'segmentation_model' in opts:
                    segmentation_model = opts['segmentation_model']
                
                preprocessing_opts = opts.get('preprocessing', {})
                    
            except Exception as e:
                logging.error(f"Failed to parse options: {e}")

        # Construct Command
        cmd = [
            "subscript",
            "--config", "/app/config/config.yml",
            segmentation_model, # Dynamic Segmentation Model
            model,
            file_path,
            "--output", output_dir
        ]
        
        # Apply Parsing Logic
        if prompt_override:
            logging.info(f"Task {doc_id} found prompt override: {prompt_override}")
            cmd.extend(["--prompt", prompt_override])

        if temperature_override is not None:
             logging.info(f"Task {doc_id} found temp override: {temperature_override}")
             cmd.extend(["--temp", str(temperature_override)])
             
        # Apply Preprocessing Options
        if preprocessing_opts:
            if preprocessing_opts.get('resize_image') and preprocessing_opts['resize_image'] != 'false':
                cmd.extend(["--resize", preprocessing_opts['resize_image']])
                
            if preprocessing_opts.get('contrast') is not None:
                cmd.extend(["--contrast", str(preprocessing_opts['contrast'])])
                
            if preprocessing_opts.get('binarize'):
                cmd.append("--binarize")
                
            if preprocessing_opts.get('invert'):
                cmd.append("--invert")
        
        logging.info(f"TASK START: Processing {doc.filename} (ID: {doc.id})")
        logging.info(f"Command: {cmd}")
        
        # Run in separate process with streaming output
        full_output = []
        with subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1, # Line buffered
            env=os.environ
        ) as proc:
            for line in proc.stdout:
                line = line.strip()
                if line:
                    logging.info(f"[Subscript] {line}")
                    full_output.append(line)
            
            proc.wait()
            
            if proc.returncode != 0:
                 error_msg = "\n".join(full_output[-10:])
                 raise subprocess.CalledProcessError(proc.returncode, cmd, output="\n".join(full_output), stderr=error_msg)

        logging.info(f"SUBSCRIPT FINISHED for {doc.id}")
        
        # Check if output directory still exists (user might have deleted the doc)
        if not os.path.exists(output_dir):
            logging.warning(f"Output directory {output_dir} not found. Document likely deleted by user. Aborting task completion.")
            return

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

    except subprocess.CalledProcessError as e:
        db.rollback()
        logging.error(f"Processing failed (exit code {e.returncode}): {e.stderr}")
        doc.status = "error"
        doc.error_message = f"Subscript failed: {e.stderr}"
    except Exception as e:
        db.rollback()
        # Check if doc deleted during processing
        if "0 were matched" in str(e) or not db.query(Document).filter(Document.id == doc_id).first():
            logging.warning(f"Document {doc_id} deleted during processing. Suppressing error.")
            return

        logging.error(f"Processing failed: {e}")
        doc.status = "error"
        doc.error_message = str(e)
    finally:
        db.commit()
        
        # Anti-Zombie Cleanup: Check if doc was deleted during processing
        try:
            db.expire_all()
            if not db.query(Document).filter(Document.id == doc_id).first():
                logging.warning(f"Document {doc_id} was deleted during processing. Cleaning up output.")
                # output_dir might not be defined if error occurred early
                if 'output_dir' in locals() and output_dir and os.path.exists(output_dir):
                    import shutil
                    shutil.rmtree(output_dir, ignore_errors=True)
        except Exception as e:
            logging.error(f"Cleanup failed: {e}")

        db.close()

@celery_app.task(bind=True)
def process_batch_task(self, parent_id: int, file_paths: list, model: str, options: str = None):
    db = SessionLocal()
    parent = db.query(Document).filter(Document.id == parent_id).first()
    if not parent:
        logging.error(f"Parent Document {parent_id} not found")
        return

    # Set status for parent and children
    parent.status = "processing"
    children = db.query(Document).filter(Document.parent_id == parent.id).all()
    for child in children:
        child.status = "processing"
    db.commit()

    try:
        from subscript.__main__ import main as run_subscript_pipeline
        
        original_argv = sys.argv
        
        # Determine output setup
        clean_email = sanitize_email(parent.owner.email)
        user_dir = os.path.join(USER_DOCS_DIR, clean_email)
        if parent.directory_name:
            parent_dir = os.path.join(user_dir, parent.directory_name)
        else:
            parent_dir = user_dir

        output_pdf_path = os.path.join(parent_dir, parent.filename)
        # Note: In batch mode, individual files might be in subdirs or flat.
        # But looking at inputs `file_paths`, they are absolute.
        # subscript output logic: if --output is not set, it uses input dir?
        # But inputs might be in different dirs? 
        # Actually, for batch upload, they are all in `documents/email/group_dir/`.
        # So setting --output to that group_dir works.
        
        output_dir = parent_dir 
        os.makedirs(output_dir, exist_ok=True)

        # Construct Command
        # subscript [SEG] [MODEL] file1 file2 ... --combine parent.pdf --output [dir]
        sys.argv = [
            "subscript",
            "--config", "/app/config/config.yml",
            "historical-manuscript",
            model
        ] + file_paths + [
            "--combine", output_pdf_path,
            "--output", output_dir
        ]

        # Handle Options (Prompt etc)
        if options:
            try:
                opts = json.loads(options)
                transcription_opts = opts.get('transcription', {})
                prompt_override = transcription_opts.get('prompt')
                if prompt_override:
                    sys.argv.extend(["--prompt", prompt_override])
                    
                temp_override = transcription_opts.get('temperature')
                if temp_override is not None:
                     sys.argv.extend(["--temp", str(temp_override)])
                     
                # Preprocessing
                preproc = opts.get('preprocessing', {})
                if preproc.get('resize_image') and preproc['resize_image'] != 'false':
                    sys.argv.extend(["--resize", preproc['resize_image']])
                if preproc.get('contrast') is not None:
                    sys.argv.extend(["--contrast", str(preproc['contrast'])])
                if preproc.get('binarize'):
                    sys.argv.append("--binarize")
                if preproc.get('invert'):
                    sys.argv.append("--invert")
            except: pass

        logging.info(f"BATCH TASK START: Parent {parent.filename} (ID: {parent.id})")
        logging.info(f"Command: {' '.join(sys.argv)}")

        f_out = io.StringIO()
        with contextlib.redirect_stdout(f_out), contextlib.redirect_stderr(f_out):
            run_subscript_pipeline()
        
        logging.info(f"BATCH OUTPUT:\n{f_out.getvalue()}")

        # Update Statuses
        parent.status = "completed"
        parent.output_pdf_path = output_pdf_path
        parent.output_txt_path = os.path.splitext(output_pdf_path)[0] + ".txt"
        
        # Post-process Children (Uniquify XML IDs)
        for child in children:
            child.status = "completed"
            
            # Reconstruct expected XML path
            # Assuming file was processed in place or to output_dir
            # For grouped upload, logic put them in `parent_dir`.
            
            # Use child filename to find xml
            base_name = os.path.splitext(child.filename)[0]
            xml_path = os.path.join(output_dir, f"{base_name}.xml")
            child.output_txt_path = os.path.join(output_dir, f"{base_name}.txt")
            
            if os.path.exists(xml_path):
                 try:
                    with open(xml_path, "r") as f:
                        content = f.read()
                    
                    page_prefix = f"p{child.page_order}_"
                    
                    def replace_id(match):
                        prefix = match.group(1)
                        val = match.group(2)
                        suffix = match.group(3)
                        if val.startswith("p"): return match.group(0)
                        return f'{prefix}{page_prefix}{val}{suffix}'
                        
                    content = re.sub(r'(id=["\'])(r\d+)(["\'])', replace_id, content)
                    content = re.sub(r'(id=["\'])(l\d+)(["\'])', replace_id, content)
                    
                    with open(xml_path, "w") as f:
                        f.write(content)
                 except Exception as e:
                    logging.error(f"Failed to uniquify IDs for {child.filename}: {e}")

    except Exception as e:
        db.rollback()
        logging.error(f"Batch processing failed: {e}")
        parent.status = "error"
        parent.error_message = str(e)

        for child in children:
            child.status = "error"
            child.error_message = "Batch processing failed"
    finally:
        sys.argv = original_argv
        db.commit()
        
        # Anti-Zombie Cleanup
        try:
            db.expire_all()
            if not db.query(Document).filter(Document.id == parent_id).first():
                logging.warning(f"Parent {parent_id} was deleted during processing. Cleaning up output.")
                if 'output_dir' in locals() and output_dir and os.path.exists(output_dir):
                    import shutil
                    shutil.rmtree(output_dir, ignore_errors=True)
        except Exception as e:
            logging.error(f"Cleanup failed: {e}")

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
        
        # Determine paths
        user_dir = os.path.join(USER_DOCS_DIR, clean_email)
        
        # Parent Output Path
        # Should go into the parent's specific directory.
        if parent.directory_name:
             parent_dir = os.path.join(user_dir, parent.directory_name)
        else:
             parent_dir = user_dir # fallback
             
        output_pdf_path = os.path.join(parent_dir, parent.filename)
        
        # Child paths
        child_paths = []
        for child in children:
            # Each child might be in its own directory (if flat upload) or same group dir
            if child.directory_name:
                 child_dir = os.path.join(user_dir, child.directory_name)
            else:
                 # If no directory name, assume legacy or same as parent group?
                 # If we created correctly, ALL children have directory_name matching the group (if grouped)
                 # or their own (if flat).
                 child_dir = user_dir 
                 
            child_full_path = os.path.join(child_dir, child.filename)
            child_paths.append(child_full_path)

        # Import subscript
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
            


    except Exception as e:
        logging.error(f"Merge failed: {e}")
        parent.status = "error"
        parent.error_message = str(e)
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
    
    doc.status = "updating_pdf" 
    db.commit()
    
    try:
        from subscript.__main__ import main as run_subscript_pipeline

        original_argv = sys.argv
        output_dir = os.path.dirname(file_path)
            
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
