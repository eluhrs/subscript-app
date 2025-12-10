import os
import shutil
import logging
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from jose import JWTError, jwt

# Import subscript
try:
    from subscript.__main__ import main as run_subscript_pipeline
    from subscript.modules.transcription import preprocess_image
except ImportError:
    import sys
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))
    from subscript.__main__ import main as run_subscript_pipeline

from server.utils import sanitize_filename, sanitize_email

# --- Configuration ---
USER_DOCS_DIR = "/app/documents"
DATABASE_URL = "sqlite:////app/subscript.db"
SECRET_KEY = "your-secret-key-change-this-in-production" # TODO: Load from env
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

os.makedirs(USER_DOCS_DIR, exist_ok=True)

# --- Database ---
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    full_name = Column(String, nullable=True)
    documents = relationship("Document", back_populates="owner")

class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    upload_date = Column(DateTime, default=datetime.utcnow)
    last_modified = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="uploaded") # uploaded, processing, completed, error
    error_message = Column(String, nullable=True)
    output_txt_path = Column(String, nullable=True)
    output_pdf_path = Column(String, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="documents")

    # Grouping Fields
    is_container = Column(Boolean, default=False)
    page_order = Column(Integer, default=0)
    parent_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    children = relationship("Document", 
                            backref="parent", 
                            remote_side=[id],
                            order_by="Document.page_order")

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Security ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    return user

# --- Pydantic Models ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    class Config:
        orm_mode = True

class Token(BaseModel):
    access_token: str
    token_type: str

class DocumentResponse(BaseModel):
    id: int
    filename: str
    upload_date: datetime
    last_modified: Optional[datetime] = None
    is_container: bool = False
    page_order: int = 0
    parent_id: Optional[int] = None
    thumbnail_url: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    output_txt_path: Optional[str] = None
    output_pdf_path: Optional[str] = None
    has_xml: bool = False
    has_debug: bool = False
    class Config:
        orm_mode = True

# --- App ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Auth Endpoints ---

@app.post("/api/auth/register", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = get_password_hash(user.password)
    db_user = User(email=user.email, hashed_password=hashed_password, full_name=user.full_name)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/api/auth/token", response_model=Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

# --- Document Endpoints (Protected) ---

@app.get("/api/documents", response_model=List[DocumentResponse])
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Dynamically update last_modified based on file system
    # Filter out child documents (only show parents and loose files)
    docs = db.query(Document).filter(
        Document.owner_id == current_user.id,
        Document.parent_id == None
    ).all()

    for doc in docs:
        clean_email = sanitize_email(current_user.email)
        user_dir = os.path.join(USER_DOCS_DIR, clean_email)
        base_name = os.path.splitext(doc.filename)[0]
        
        # Check potential files
        latest_mtime = doc.upload_date.timestamp()
        if doc.last_modified:
            latest_mtime = max(latest_mtime, doc.last_modified.timestamp())
            
        file_candidates = [
            doc.filename,
            f"{base_name}.xml",
            f"{base_name}.txt",
            f"{base_name}.pdf"
        ]
        
        for f in file_candidates:
            p = os.path.join(user_dir, f)
            if os.path.exists(p):
                mtime = os.path.getmtime(p)
                if mtime > latest_mtime:
                    latest_mtime = mtime
                    
        doc.last_modified = datetime.fromtimestamp(latest_mtime)

        # Check for optional files to populate response flags
        # Note: These are not DB columns, so we set them on the object instances
        # which Pydantic will serialize.
        xml_path = os.path.join(user_dir, f"{base_name}.xml")
        thumb_path = os.path.join(user_dir, f"{base_name}-thumb.jpg")
        debug_path = os.path.join(user_dir, f"{base_name}-debug.jpg")
        
        doc.has_xml = os.path.exists(xml_path)
        # Keep has_debug for backward compatibility or debug download
        doc.has_debug = os.path.exists(debug_path)
        
        if os.path.exists(thumb_path):
            # Point to API which requires token
            doc.thumbnail_url = f"/api/thumbnail/{doc.id}"
        elif os.path.exists(debug_path):
             # Fallback to debug image if thumb generation failed but debug exists
             # But serve via API to ensure consistent access control?
             # Or stick to static path? Let's use API to be safe.
             doc.thumbnail_url = f"/api/thumbnail/{doc.id}"
        else:
            doc.thumbnail_url = None

    return docs

@app.post("/api/upload", response_model=DocumentResponse)
def upload_document(
    file: UploadFile = File(...),
    model: str = "gemini",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    clean_email = sanitize_email(current_user.email)
    clean_filename = sanitize_filename(file.filename)
    
    user_dir = os.path.join(USER_DOCS_DIR, clean_email)
    os.makedirs(user_dir, exist_ok=True)
    
    file_path = os.path.join(user_dir, clean_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    doc = Document(filename=clean_filename, status="queued", owner_id=current_user.id)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    
    # Trigger Celery Task
    from server.tasks import process_document_task
    process_document_task.delay(doc.id, file_path, model)
    
    return doc

@app.post("/api/upload-batch", response_model=DocumentResponse)
def upload_batch(
    files: List[UploadFile] = File(...),
    model: str = Form("gemini"),
    group_filename: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    clean_email = sanitize_email(current_user.email)
    
    # 1. Handle Grouping (Parent Document)
    parent_doc = None
    if group_filename:
        # User requested grouping
        clean_group_name = sanitize_filename(group_filename)
        
        # Ensure it ends in .pdf if user forgot
        if not clean_group_name.lower().endswith(".pdf"):
            clean_group_name += ".pdf"
            
        parent_doc = Document(
            filename=clean_group_name,
            status="processing", # Container is "processing" while children upload?
            owner_id=current_user.id,
            is_container=True,
            output_pdf_path=None # No PDF yet
        )
        db.add(parent_doc)
        db.commit()
        db.refresh(parent_doc)
        
        # Create sub-directory for this group
        # Remove extension for dir name: "MyBook.pdf" -> "MyBook"
        group_dir_name = os.path.splitext(clean_group_name)[0]
        upload_dir = os.path.join(USER_DOCS_DIR, clean_email, group_dir_name)
    else:
        # No grouping - flat upload to root
        upload_dir = os.path.join(USER_DOCS_DIR, clean_email)
        group_dir_name = None

    os.makedirs(upload_dir, exist_ok=True)
    
    # Trigger import
    from server.tasks import process_document_task

    children_xmls = []

    # 2. Process Files
    for i, file in enumerate(files):
        clean_filename = sanitize_filename(file.filename)
        file_path = os.path.join(upload_dir, clean_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Create Document Record
        doc = Document(
            filename=clean_filename,
            status="queued",
            owner_id=current_user.id,
            parent_id=parent_doc.id if parent_doc else None,
            page_order=i + 1
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        
        # Trigger Task
        process_document_task.delay(doc.id, file_path, model)
        
        # Track expected XML path for .lst generation relative to dashboard?
        # The Editor expects paths relative to its data/ directory.
        # If no group: clean_email/filename.xml (assuming editor mounts /documents as data/??)
        # Actually we need to check how the editor resolves paths relative from index.php location.
        # If user passes `l=../data/clean_email/list.lst`, and list contains `clean_email/group/file.xml`?
        
        # NOTE: This path logic is the trickiest part. 
        # Assuming typical setup where `pages` serve from `data/`.
        # If group_dir_name is set, files are in `clean_email/group_dir_name/file.xml`.
        if parent_doc and group_dir_name:
             base_name = os.path.splitext(clean_filename)[0]
             # Editor expects paths relative to data/ via index.php logic
             children_xmls.append(os.path.join(clean_email, group_dir_name, f"{base_name}.xml"))

    # 3. Finalize Parent
    if parent_doc:
        # Generate .lst file for the editor
        # Stored in root of user dir? Or inside group dir?
        # Root is better so it's easily accessible? Or named same as group PDF?
        lst_filename = f"{clean_group_name}.lst" # e.g. MyBook.pdf.lst or MyBook.lst?
        # Let's match the group filename logic: MyBook.pdf -> MyBook.lst?
        lst_base = os.path.splitext(clean_group_name)[0] + ".lst"
        
        lst_path_abs = os.path.join(USER_DOCS_DIR, clean_email, lst_base)
        
        # The content of LST should be paths relative to...?
        # The browser requests XMLs.
        # Let's just list the RELATIVE paths from USER_DOCS_DIR/clean_email?
        # index.php: $thelist = explode("\n", file_get_contents(...));
        # array_walk($thelist, function(&$item){ $item = "'../data/".$item."'"; });
        # So if we put 'subfolder/file.xml', it becomes '../data/subfolder/file.xml'.
        # Since files are in `USER_DOCS_DIR/clean_email/subfolder/file.xml`...
        # And `data` maps to `USER_DOCS_DIR`?
        # Wait, editor mounts `USER_DOCS_DIR` to `/var/www/nw-page-editor/data`?
        # Let's verify volume mount for page-editor.
        
        # ASSUMPTION: /app/documents (backend) == /var/www/nw-page-editor/data (editor)
        # If index.php prepends `../data/`, and we are in `data/`, then relative path from `data/` is needed.
        # Files are in `clean_email/group/file.xml`.
        # So we write `clean_email/group/file.xml` into the list.
        
        with open(lst_path_abs, "w") as f:
            f.write("\n".join(children_xmls) + "\n")
            
        parent_doc.status = "processing" 
        # Store LST path? For now just rely on filename convention or future fields.
        
        db.commit()
        return parent_doc
        
    return doc

@app.get("/api/documents/{doc_id}", response_model=DocumentResponse)
def get_document(
    doc_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.owner_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc

@app.post("/api/rebuild-pdf/{doc_id}", response_model=DocumentResponse)
def rebuild_pdf(
    doc_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.owner_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    clean_email = sanitize_email(current_user.email)
    clean_filename = sanitize_filename(doc.filename)
    user_dir = os.path.join(USER_DOCS_DIR, clean_email)
    file_path = os.path.join(user_dir, clean_filename)
    
    if not os.path.exists(file_path):
         raise HTTPException(status_code=404, detail=f"Original file not found at {file_path}")

    doc.status = "updating_pdf" 
    # Set immediately so dashboard reflects the action
    db.commit()
    db.refresh(doc)
    
    from server.tasks import rebuild_pdf_task
    rebuild_pdf_task.delay(doc.id, file_path)
    
    return doc

@app.delete("/api/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.owner_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Optional: Delete files from disk
    # Delete input file and potential outputs
    # Because we now store everything in /app/documents/{email}/{filename}.*
    # We can reconstruct the path
    clean_email = sanitize_email(doc.owner.email)
    user_dir = os.path.join(USER_DOCS_DIR, clean_email)
    
    # Try to delete likely associated files
    base_name = os.path.splitext(doc.filename)[0]

    if doc.is_container:
        # Grouped Delete
        # 1. Delete all children
        children = db.query(Document).filter(Document.parent_id == doc.id).all()
        for child in children:
            db.delete(child)
        
        # 2. Delete Group Directory (contains child images/xmls)
        group_dir = os.path.join(user_dir, base_name)
        if os.path.exists(group_dir):
            shutil.rmtree(group_dir, ignore_errors=True) # Recursive delete

        # 3. Delete .lst file
        lst_path = os.path.join(user_dir, f"{base_name}.lst")
        if os.path.exists(lst_path):
            os.remove(lst_path)
            
        # 4. Delete Merged PDF/TXT (stored in root user dir with parent filename)
        pdf_path = os.path.join(user_dir, doc.filename)
        txt_path = os.path.join(user_dir, f"{base_name}.txt")
        if os.path.exists(pdf_path): os.remove(pdf_path)
        if os.path.exists(txt_path): os.remove(txt_path)

    else:
        # Single Document Delete (or orphan child?)
        # If it's a child, it's inside a group folder.
        # But if we delete via API, we usually handle paths.
        # Logic for existing flat files:
        possible_files = [
            doc.filename,          # Original
            f"{base_name}.xml",
            f"{base_name}.txt",
            f"{base_name}.pdf",
            f"{base_name}-debug.jpg"
        ]
        
        for f in possible_files:
            p = os.path.join(user_dir, f)
            if os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass
    
    # Delete legacy paths from DB record if they exist and weren't caught above
    if doc.output_txt_path and os.path.exists(doc.output_txt_path):
        try: os.remove(doc.output_txt_path)
        except: pass
    if doc.output_pdf_path and os.path.exists(doc.output_pdf_path):
        try: os.remove(doc.output_pdf_path)
        except: pass
        
    db.delete(doc)
    db.commit()
    return None

from fastapi.responses import FileResponse

@app.get("/api/download/{doc_id}/{file_type}")
def download_document(
    doc_id: int,
    file_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.owner_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    base_name = os.path.splitext(doc.filename)[0]
    
    # Construct path based on consolidated directory structure
    clean_email = sanitize_email(current_user.email)
    
    if file_type == "pdf":
        file_path = os.path.join(USER_DOCS_DIR, clean_email, f"{base_name}.pdf")
        media_type = "application/pdf"
    elif file_type == "txt":
        file_path = os.path.join(USER_DOCS_DIR, clean_email, f"{base_name}.txt")
        media_type = "text/plain"
    elif file_type == "xml":
        file_path = os.path.join(USER_DOCS_DIR, clean_email, f"{base_name}.xml")
        media_type = "application/xml"
    elif file_type == "debug":
        file_path = os.path.join(USER_DOCS_DIR, clean_email, f"{base_name}-debug.jpg")
        media_type = "image/jpeg"
    else:
        raise HTTPException(status_code=400, detail="Invalid file type")
        
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(file_path, media_type=media_type, filename=os.path.basename(file_path))

@app.get("/api/thumbnail/{doc_id}")
def get_thumbnail(
    doc_id: int,
    token: str,
    db: Session = Depends(get_db)
):
    # Manually validate token since it's a query param for <img> tag
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
             raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    doc = db.query(Document).filter(Document.id == doc_id, Document.owner_id == user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Serve thumbnail or debug image
    clean_email = sanitize_email(user.email)
    base_name = os.path.splitext(doc.filename)[0]
    
    thumb_path = os.path.join(USER_DOCS_DIR, clean_email, f"{base_name}-thumb.jpg")
    debug_path = os.path.join(USER_DOCS_DIR, clean_email, f"{base_name}-debug.jpg")
    
    if os.path.exists(thumb_path):
        return FileResponse(thumb_path)
    elif os.path.exists(debug_path):
        return FileResponse(debug_path)
    else:
        # Do not serve original file as thumbnail (too large)
        raise HTTPException(status_code=404, detail="Thumbnail not found")

