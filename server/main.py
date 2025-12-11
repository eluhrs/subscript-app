from logging.handlers import RotatingFileHandler
import os
import shutil
import logging
import time
import uuid
from datetime import datetime, timedelta
from typing import List, Optional
import zipfile
from io import BytesIO

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from jose import JWTError, jwt



from server.utils import sanitize_filename, sanitize_email, create_thumbnail

# Configure Logging (Shared Volume, Rotation)
LOG_DIR = "/app/logs"
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "server.log")

# Configure Logging (Shared Volume, Rotation)
# Note: Uvicorn configures root logger, so basicConfig is ignored. We must attach handler explicitly.
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)

# Avoid adding handler multiple times on reload
if not any(isinstance(h, RotatingFileHandler) and h.baseFilename == LOG_FILE for h in root_logger.handlers):
    file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5*1024*1024, backupCount=3)
    file_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
    root_logger.addHandler(file_handler)

logger = logging.getLogger(__name__)
logger.info(f"SYSTEM: Server module initialized at {datetime.now()}")

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

# --- App ---
app = FastAPI()




class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    full_name = Column(String, nullable=True)
    is_admin = Column(Boolean, default=False)
    is_locked = Column(Boolean, default=False)
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
    directory_name = Column(String, nullable=True) # Stores {filename}-{hash}
    parent_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    share_token = Column(String, unique=True, index=True, nullable=True)
    children = relationship("Document", 
                            backref="parent", 
                            remote_side=[id],
                            order_by="Document.page_order")

class SystemSettings(Base):
    __tablename__ = "system_settings"
    key = Column(String, primary_key=True, index=True)
    value = Column(String)

class Invitation(Base):
    __tablename__ = "invitations"
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True)
    email = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_used = Column(Boolean, default=False)
    created_by_id = Column(Integer, ForeignKey("users.id"))
    # No need for back-relationship on User for now

Base.metadata.create_all(bind=engine)

# DB Migration: Ensure is_admin column exists
from sqlalchemy import text
with engine.connect() as conn:
    try:
        conn.execute(text("SELECT is_admin FROM users LIMIT 1"))
    except Exception:
        print("Migrating DB: Adding is_admin column to users table")
        conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0"))

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
    is_admin: bool = False
    is_locked: bool = False
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
    share_token: Optional[str] = None
    class Config:
        orm_mode = True

class SystemConfigResponse(BaseModel):
    registration_mode: str

class InviteCreate(BaseModel):
    email: Optional[EmailStr] = None

class InviteResponse(BaseModel):
    id: int
    token: str
    email: Optional[str]
    created_at: datetime
    is_used: bool
    class Config:
        orm_mode = True

class SettingsUpdate(BaseModel):
    registration_mode: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    is_locked: Optional[bool] = None

# --- App ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

# --- Auth Endpoints ---

@app.post("/api/auth/register", response_model=UserResponse)
def register(user: UserCreate, token: Optional[str] = None, db: Session = Depends(get_db)):
    # Check registration mode
    mode_setting = db.query(SystemSettings).filter(SystemSettings.key == "registration_mode").first()
    mode = mode_setting.value if mode_setting else "open"

    invite_obj = None
    if mode == "invite":
        if not token:
            raise HTTPException(status_code=403, detail="Registration is by invitation only.")
        invite_obj = db.query(Invitation).filter(Invitation.token == token, Invitation.is_used == False).first()
        if not invite_obj:
            raise HTTPException(status_code=403, detail="Invalid or used invitation token")

    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = get_password_hash(user.password)
    
    # First user is admin
    is_admin = db.query(User).count() == 0
    
    db_user = User(
        email=user.email, 
        hashed_password=hashed_password, 
        full_name=user.full_name,
        is_admin=is_admin
    )
    db.add(db_user)
    
    # Consume token if applicable
    if invite_obj:
        invite_obj.is_used = True
        db.add(invite_obj)

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
    
    if user.is_locked:
         raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is locked. Please contact administrator.",
        )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user



class PasswordChange(BaseModel):
    old_password: str
    new_password: str

@app.put("/api/auth/me", response_model=UserResponse)
def update_user_me(user_update: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # If email is being changed, check for uniqueness
    if user_update.email and user_update.email != current_user.email:
        existing_user = db.query(User).filter(User.email == user_update.email).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already registered")
        current_user.email = user_update.email
    
    if user_update.full_name is not None:
        current_user.full_name = user_update.full_name
    
    db.commit()
    db.refresh(current_user)
    return current_user

@app.put("/api/auth/password")
def change_password(password_change: PasswordChange, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not verify_password(password_change.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect old password")
    
    current_user.hashed_password = get_password_hash(password_change.new_password)
    db.commit()
    return {"message": "Password updated successfully"}

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
        
        # Use hashed directory if present (it should be for all new docs)
        if doc.directory_name:
             doc_dir = os.path.join(user_dir, doc.directory_name)
        else:
             # Fallback for legacy (though we wiped data)
             doc_dir = user_dir
             
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
            p = os.path.join(doc_dir, f)
            if os.path.exists(p):
                mtime = os.path.getmtime(p)
                if mtime > latest_mtime:
                    latest_mtime = mtime
                    
        doc.last_modified = datetime.fromtimestamp(latest_mtime)

        # Check for optional files to populate response flags
        # Note: These are not DB columns, so we set them on the object instances
        # which Pydantic will serialize.
        xml_path = os.path.join(doc_dir, f"{base_name}.xml")
        thumb_path = os.path.join(doc_dir, f"{base_name}-thumb.jpg")
        debug_path = os.path.join(doc_dir, f"{base_name}-debug.jpg")
        
        doc.has_xml = os.path.exists(xml_path)
        # Keep has_debug for backward compatibility or debug download
        doc.has_debug = os.path.exists(debug_path)
        
        if os.path.exists(thumb_path):
            # Point to API which requires token
            # Add cache busting
            ts = int(os.path.getmtime(thumb_path))
            doc.thumbnail_url = f"/api/thumbnail/{doc.id}?v={ts}"
        elif os.path.exists(debug_path):
             # Fallback
             ts = int(os.path.getmtime(debug_path))
             doc.thumbnail_url = f"/api/thumbnail/{doc.id}?v={ts}"
        else:
            doc.thumbnail_url = None

    return docs

@app.post("/api/upload", response_model=DocumentResponse)
def upload_document(
    file: UploadFile = File(...),
    model: str = "gemini-pro-3", # Default to valid model key
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    import secrets
    clean_email = sanitize_email(current_user.email)
    clean_filename = sanitize_filename(file.filename)
    
    # Generate unique directory name: filename-hash
    # We use base filename for the prefix
    base_name = os.path.splitext(clean_filename)[0]
    short_hash = secrets.token_hex(4) # 8 characters
    dir_name = f"{base_name}-{short_hash}"
    
    # Path: /app/documents/email/dir_name/
    user_dir = os.path.join(USER_DOCS_DIR, clean_email)
    storage_dir = os.path.join(user_dir, dir_name)
    os.makedirs(storage_dir, exist_ok=True)
    
    file_path = os.path.join(storage_dir, clean_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    doc = Document(
        filename=clean_filename, 
        status="queued", 
        owner_id=current_user.id,
        directory_name=dir_name
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    
    logger.info(f"JOB SUBMITTED: User {current_user.email} uploaded {clean_filename}")
    
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
    import secrets
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    clean_email = sanitize_email(current_user.email)
    
    # 1. Handle Grouping (Parent Document)
    parent_doc = None
    upload_target_map = {} # map index -> (storage_dir, directory_name)
    
    if group_filename:
        # User requested grouping -> One shared directory
        clean_group_name = sanitize_filename(group_filename)
        
        if not clean_group_name.lower().endswith(".pdf"):
            clean_group_name += ".pdf"
            
        group_base = os.path.splitext(clean_group_name)[0]
        short_hash = secrets.token_hex(4)
        group_dir_name = f"{group_base}-{short_hash}"
        
        # Parent Record
        parent_doc = Document(
            filename=clean_group_name,
            status="processing", 
            owner_id=current_user.id,
            is_container=True,
            output_pdf_path=None,
            directory_name=group_dir_name
        )
        db.add(parent_doc)
        db.commit()
        db.refresh(parent_doc)
        
        # Directory: documents/{email}/{group_base}-{hash}/
        upload_dir = os.path.join(USER_DOCS_DIR, clean_email, group_dir_name)
        os.makedirs(upload_dir, exist_ok=True)
        
        # All files go here
        for i in range(len(files)):
            upload_target_map[i] = (upload_dir, group_dir_name)
            
    else:
        # Flat upload -> Each file gets its own directory
        group_dir_name = None
        for i, f in enumerate(files):
            clean_f = sanitize_filename(f.filename)
            base_f = os.path.splitext(clean_f)[0]
            f_hash = secrets.token_hex(4)
            f_dir_name = f"{base_f}-{f_hash}"
            
            f_storage_dir = os.path.join(USER_DOCS_DIR, clean_email, f_dir_name)
            os.makedirs(f_storage_dir, exist_ok=True)
            
            upload_target_map[i] = (f_storage_dir, f_dir_name)

    # 2. Process Files
    # Trigger import
    from server.tasks import process_document_task

    children_xmls = [] # relative paths for LST

    for i, file in enumerate(files):
        clean_filename = sanitize_filename(file.filename)
        
        storage_dir, dir_name = upload_target_map[i]
        file_path = os.path.join(storage_dir, clean_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Generate Thumbnail Immediately
        try:
            thumb_path = os.path.join(storage_dir, f"{os.path.splitext(clean_filename)[0]}-thumb.jpg")
            create_thumbnail(file_path, thumb_path)
        except Exception as e:
            logger.error(f"Thumbnail generation failed for {clean_filename}: {e}")
            # Continue without thumbnail
            
        # Create Document Record
        doc = Document(
            filename=clean_filename,
            status="queued",
            owner_id=current_user.id,
            parent_id=parent_doc.id if parent_doc else None,
            page_order=i + 1,
            directory_name=dir_name
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        
        # Trigger Task
        process_document_task.delay(doc.id, file_path, model)
        
        # For LST generation:
        # Browser loads LST via index.php?l=...
        # LST content is prepended with "../data/" by index.php
        # So we need "email/group_dir/filename.xml" --> "../data/email/group_dir/filename.xml"
        if parent_doc:
             base_name = os.path.splitext(clean_filename)[0]
             # Must be relative to USER_DOCS_DIR (mapped to data/) or whatever logic we decide.
             # index.php logic: prepends "../data/" to each line.
             # USER_DOCS_DIR is mounted to "../data/" (effectively).
             # So we want distinct path from data root.
             # "email/group_dir_name/file.xml"
             children_xmls.append(os.path.join(clean_email, dir_name, f"{base_name}.xml"))

    # 3. Finalize Parent (.lst and merging)
    if parent_doc:
        # LST goes INSIDE the hashed directory?
        # Request: "refactor to put filename.lst ... within their respective directories"
        # So LST should be at `USER_DOCS_DIR/email/group_dir/Group.lst`
        lst_base = os.path.splitext(clean_group_name)[0] + ".lst"
        
        # Path inside the group directory
        lst_path_abs = os.path.join(USER_DOCS_DIR, clean_email, group_dir_name, lst_base)
        
        with open(lst_path_abs, "w") as f:
            f.write("\n".join(children_xmls) + "\n")
            
        # Create Parent Thumbnail (Copy from first child)
        if len(files) > 0:
            first_index = 0
            # Get first child's storage
            c_storage, c_dir = upload_target_map[first_index]
            c_filename = sanitize_filename(files[first_index].filename)
            c_base = os.path.splitext(c_filename)[0]
            c_thumb = os.path.join(c_storage, f"{c_base}-thumb.jpg")
            
            p_base = os.path.splitext(clean_group_name)[0]
            # Parent thumb lives in group dir (same as LST)
            p_thumb = os.path.join(USER_DOCS_DIR, clean_email, group_dir_name, f"{p_base}-thumb.jpg")
            
            if os.path.exists(c_thumb):
                shutil.copy2(c_thumb, p_thumb)
                logger.info(f"Created parent thumbnail at {p_thumb}")
            
        parent_doc.status = "processing" 
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
    
    if doc.directory_name:
         doc_dir = os.path.join(user_dir, doc.directory_name)
    else:
         doc_dir = user_dir
         
    file_path = os.path.join(doc_dir, clean_filename)
    
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
    
    if doc.directory_name:
        # Simple case: Just nuke the directory
        target_dir = os.path.join(user_dir, doc.directory_name)
        if os.path.exists(target_dir):
            shutil.rmtree(target_dir, ignore_errors=True)
            
        # If it's a container, we should also probably delete the children DB records
        if doc.is_container:
            children = db.query(Document).filter(Document.parent_id == doc.id).all()
            for child in children:
                db.delete(child)
    else:
        # Legacy flat-file logic
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
            possible_files = [
                doc.filename,          # Original
                f"{base_name}.xml",
                f"{base_name}.txt",
                f"{base_name}.pdf",
                f"{base_name}-debug.jpg",
                f"{base_name}-thumb.jpg"
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
    user_dir = os.path.join(USER_DOCS_DIR, clean_email)
    
    if doc.directory_name:
         doc_dir = os.path.join(user_dir, doc.directory_name)
    else:
         doc_dir = user_dir
    
    if file_type == "pdf":
        file_path = os.path.join(doc_dir, f"{base_name}.pdf")
        media_type = "application/pdf"
        download_filename = f"{base_name}.pdf"
    elif file_type == "txt":
        file_path = os.path.join(doc_dir, f"{base_name}.txt")
        media_type = "text/plain"
        download_filename = f"{base_name}.txt"
    elif file_type == "xml":
        file_path = os.path.join(doc_dir, f"{base_name}.xml")
        media_type = "application/xml"
        download_filename = f"{base_name}.xml"
    elif file_type == "debug" or file_type == "map":
        file_path = os.path.join(doc_dir, f"{base_name}-debug.jpg")
        media_type = "image/jpeg"
        download_filename = f"{base_name}-debug.jpg"
    elif file_type == "zip":
        # Create ZIP on the fly
        memory_file = BytesIO()
        with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Add PDF
            pdf_path = os.path.join(doc_dir, f"{base_name}.pdf")
            if os.path.exists(pdf_path):
                zf.write(pdf_path, f"{base_name}.pdf")
            # Add XML
            xml_path = os.path.join(doc_dir, f"{base_name}.xml")
            if os.path.exists(xml_path):
                zf.write(xml_path, f"{base_name}.xml")
            # Add TXT
            txt_path = os.path.join(doc_dir, f"{base_name}.txt")
            if os.path.exists(txt_path):
                zf.write(txt_path, f"{base_name}.txt")
            # Add Debug
            debug_path = os.path.join(doc_dir, f"{base_name}-debug.jpg")
            if os.path.exists(debug_path):
                zf.write(debug_path, f"{base_name}-debug.jpg")
        
        memory_file.seek(0)
        return StreamingResponse(
            memory_file, 
            media_type="application/zip", 
            headers={"Content-Disposition": f"attachment; filename={base_name}-assets.zip"}
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid file type")
        
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(file_path, media_type=media_type, filename=download_filename)

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
    user_dir = os.path.join(USER_DOCS_DIR, clean_email)
    
    if doc.directory_name:
         doc_dir = os.path.join(user_dir, doc.directory_name)
    else:
         doc_dir = user_dir
         
    base_name = os.path.splitext(doc.filename)[0]
    
    thumb_path = os.path.join(doc_dir, f"{base_name}-thumb.jpg")
    debug_path = os.path.join(doc_dir, f"{base_name}-debug.jpg")
    
    if os.path.exists(thumb_path):
        return FileResponse(thumb_path)
    elif os.path.exists(debug_path):
        return FileResponse(debug_path)
    else:
        # Do not serve original file as thumbnail (too large)
        raise HTTPException(status_code=404, detail="Thumbnail not found")

# --- Share Functionality ---

@app.post("/api/documents/{doc_id}/share", response_model=DocumentResponse)
def share_document(
    doc_id: int, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(Document).filter(Document.id == doc_id, Document.owner_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    if not doc.share_token:
        # Generate new token
        import secrets
        doc.share_token = secrets.token_hex(4)
        db.commit()
        db.refresh(doc)
        
    return doc

@app.get("/s/{share_token}")
def access_shared_document(
    share_token: str,
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.share_token == share_token).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Shared document not found")
        
    # Serve PDF directly for now (or maybe a viewer page? Requirements implied "Sharable link to the PDF")
    # Actually, serving raw PDF is best for "Share Link" usually. 
    
    # Construct path
    user = db.query(User).filter(User.id == doc.owner_id).first()
    if not user:
         raise HTTPException(status_code=404, detail="Owner not found") # Should not happen
         
    clean_email = sanitize_email(user.email)
    user_dir = os.path.join(USER_DOCS_DIR, clean_email)
    
    if doc.directory_name:
         doc_dir = os.path.join(user_dir, doc.directory_name)
    else:
         doc_dir = user_dir
         
    base_name = os.path.splitext(doc.filename)[0]
    file_path = os.path.join(doc_dir, f"{base_name}.pdf")
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    # Serve inline so it opens in browser
    return FileResponse(file_path, media_type="application/pdf", filename=f"{doc.filename}", content_disposition_type="inline")

# --- Admin Endpoints ---

@app.get("/api/users", response_model=List[UserResponse])
def get_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    return db.query(User).all()

class UserRoleUpdate(BaseModel):
    is_admin: bool

@app.put("/api/users/{user_id}/role", response_model=UserResponse)
def update_user_role(user_id: int, role_update: UserRoleUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Prevent self-demotion
    if user.id == current_user.id and not role_update.is_admin:
         raise HTTPException(status_code=400, detail="Cannot demote yourself")

    user.is_admin = role_update.is_admin
    db.commit()
    db.refresh(user)
    return user

@app.put("/api/users/{user_id}", response_model=UserResponse)
def update_user(user_id: int, user_update: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Check for email uniqueness if changed
    # Check for email uniqueness if changed
    if user_update.email and user_update.email != user.email:
        existing_user = db.query(User).filter(User.email == user_update.email).first()
        if existing_user:
             raise HTTPException(status_code=400, detail="Email already taken")
    
    if user_update.full_name:
        user.full_name = user_update.full_name
    if user_update.email:
        user.email = user_update.email
    
    if user_update.password:
        user.hashed_password = get_password_hash(user_update.password)
        
    if user_update.is_locked is not None:
        # Prevent locking yourself
        if user.id == current_user.id and user_update.is_locked:
             raise HTTPException(status_code=400, detail="Cannot lock yourself")
        user.is_locked = user_update.is_locked
        
    db.commit()
    db.refresh(user)
    return user



        
    # Check for email uniqueness if changed


@app.delete("/api/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    db.delete(user)
    db.commit()
    return {"message": "User deleted"}


@app.get("/api/admin/health")
def admin_health(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    try:
        total, used, free = shutil.disk_usage(USER_DOCS_DIR)
        
        # System Load (1 min, 5 min, 15 min)
        try:
            load_avg = os.getloadavg()
        except AttributeError:
             load_avg = (0, 0, 0) # Windows fallback

        # Format bytes helper
        def format_bytes(size):
            power = 1024
            n = 0
            power_labels = {0 : '', 1: 'K', 2: 'M', 3: 'G', 4: 'T'}
            while size > power:
                size /= power
                n += 1
            return f"{size:.2f} {power_labels[n]}B"

        return {
            "status": "online",
            "system_load": {
                "1min": f"{load_avg[0]:.2f}",
                "5min": f"{load_avg[1]:.2f}",
                "15min": f"{load_avg[2]:.2f}"
            },
            "disk_usage": {
                "total": format_bytes(total),
                "used": format_bytes(used),
                "free": format_bytes(free),
                "percent": f"{(used / total) * 100:.1f}%"
            },
            "documents_path": USER_DOCS_DIR
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/admin/logs")
def admin_logs(lines: int = 50, current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
         raise HTTPException(status_code=403, detail="Not authorized")
    
    # Use global LOG_FILE constant defined at configuration
    primary_log = LOG_FILE 
    
    try:
        if os.path.exists(primary_log):
            with open(primary_log, "r") as f:
                content = f.readlines()
                return {"logs": [l.strip() for l in content[-lines:]]}
        else:
             return {"logs": ["Log file not yet created."]}
    except Exception as e:
        return {"logs": [f"Error reading log file: {str(e)}"]}


# --- System / Invitation Endpoints ---

@app.get("/api/system/config", response_model=SystemConfigResponse)
def get_system_config(db: Session = Depends(get_db)):
    mode_setting = db.query(SystemSettings).filter(SystemSettings.key == "registration_mode").first()
    return {"registration_mode": mode_setting.value if mode_setting else "open"}

@app.get("/api/admin/settings", response_model=SystemConfigResponse)
def get_admin_settings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    mode_setting = db.query(SystemSettings).filter(SystemSettings.key == "registration_mode").first()
    return {"registration_mode": mode_setting.value if mode_setting else "open"}

@app.put("/api/admin/settings", response_model=SystemConfigResponse)
def update_admin_settings(settings: SettingsUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    mode_setting = db.query(SystemSettings).filter(SystemSettings.key == "registration_mode").first()
    if not mode_setting:
        mode_setting = SystemSettings(key="registration_mode", value=settings.registration_mode)
        db.add(mode_setting)
    else:
        mode_setting.value = settings.registration_mode
    db.commit()
    return {"registration_mode": mode_setting.value}

@app.get("/api/admin/invites", response_model=List[InviteResponse])
def get_invites(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    return db.query(Invitation).order_by(Invitation.created_at.desc()).all()

@app.post("/api/admin/invites", response_model=InviteResponse)
def create_invite(invite: InviteCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    token = str(uuid.uuid4())
    new_invite = Invitation(
        token=token,
        email=invite.email,
        created_by_id=current_user.id
    )
    db.add(new_invite)
    db.commit()
    db.refresh(new_invite)
    return new_invite

@app.delete("/api/admin/invites/{invite_id}")
def delete_invite(invite_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    invite = db.query(Invitation).filter(Invitation.id == invite_id).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation not found")
        
    db.delete(invite)
    db.commit()
    return {"message": "Invitation deleted"}
