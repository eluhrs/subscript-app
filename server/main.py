from logging.handlers import RotatingFileHandler
import os
import shutil
import logging
import time
import uuid
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any, Union
import zipfile
import yaml
from io import BytesIO

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
import secrets

from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship, backref
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from jose import JWTError, jwt



from server.utils import sanitize_filename, sanitize_email, create_thumbnail, validate_strong_password
from server.ldap_service import LDAPService
from server.security import check_rate_limit

# Access Environment
LDAP_ENABLED = os.getenv("LDAP_ENABLED", "false").lower() == "true"

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
DATABASE_URL = "sqlite:////app/data/subscript.db"
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("FATAL: SECRET_KEY environment variable is not set. Please generate a strong key and add it to your .env file.")
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
    auth_source = Column(String, default="local") # 'local' or 'ldap'
    documents = relationship("Document", back_populates="owner", cascade="all, delete-orphan")

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
                            backref=backref("parent", remote_side=[id]), 
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
    created_by_id = Column(Integer, ForeignKey("users.id"))
    # No need for back-relationship on User for now

class UserPreference(Base):
    __tablename__ = "user_preferences"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    preferences = Column(JSON, default={})
    user = relationship("User", backref=backref("preference", uselist=False, cascade="all, delete-orphan"))

Base.metadata.create_all(bind=engine)

# DB Migration: Ensure is_admin column exists
from sqlalchemy import text
with engine.connect() as conn:
    try:
        conn.execute(text("SELECT is_admin FROM users LIMIT 1"))
    except Exception:
        print("Migrating DB: Adding is_admin column to users table")
        conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0"))

    # Phase 35: Ensure auth_source column exists
    try:
        conn.execute(text("SELECT auth_source FROM users LIMIT 1"))
    except Exception:
        print("Migrating DB: Adding auth_source column to users table")
        conn.execute(text("ALTER TABLE users ADD COLUMN auth_source VARCHAR DEFAULT 'local'"))

    # Phase 29: Ensure user_preferences table exists
    try:
        conn.execute(text("SELECT user_id FROM user_preferences LIMIT 1"))
    except Exception:
        print("Migrating DB: Creating user_preferences table")
        # Use SQLAlchemy metadata to create only this table if missing? 
        # Easier to just let create_all handle it, but for existing DBs we might need manual CREATE.
        # However, Base.metadata.create_all(bind=engine) above should handle new tables automatically.
        # This block is mainly for column alterations. Since create_all handles new tables, no action needed here.
        pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Helper: Demo Provisioning ---
def provision_demo_document(user: User, db: Session):
    """
    Copies the demo_template content to the user's directory if it's their first time.
    Strictly checks for existence of user's root document directory to avoid re-provisioning.
    """
    clean_email = sanitize_email(user.email)
    user_root_dir = os.path.join(USER_DOCS_DIR, clean_email)
    
    # Check if user directory already exists (Proxy for "Not New User")
    if os.path.exists(user_root_dir):
        # User has logged in before / directory exists. Do nothing.
        return

    # Source Template
    template_dir = os.path.join(USER_DOCS_DIR, "demo_template")
    if not os.path.exists(template_dir):
        print("WARNING: Demo template directory not found. Skipping provisioning.")
        return

    # Check for PDF file in template to get name
    # We assume 'welcome_sample.pdf' or similar. Let's list files.
    # Actually, simpler to just copy everything to a predictable hash dir.
    
    # Destination Setup
    # Create the user root dir first
    os.makedirs(user_root_dir, exist_ok=True)
    
    # Generate unique directory name for the doc
    # We'll use a fixed name for the Demo to keep it recognizable, or hashed?
    # Hashed is safer for the system.
    # Let's see what's in the template.
    template_files = os.listdir(template_dir)
    pdf_files = [f for f in template_files if f.lower().endswith('.pdf')]
    
    if not pdf_files:
        print("WARNING: No PDF found in demo template.")
        return
        
    pdf_filename = pdf_files[0] # Grab first PDF
    base_name = os.path.splitext(pdf_filename)[0]
    
    short_hash = secrets.token_hex(4)
    target_dir_name = f"{base_name}-{short_hash}"
    target_dir_full = os.path.join(user_root_dir, target_dir_name)
    
    try:
        # Copy the directory content
        shutil.copytree(template_dir, target_dir_full)
        
        # Create DB Record
        doc = Document(
            filename=pdf_filename,
            status="completed", # Assume demo is ready
            owner_id=user.id,
            directory_name=target_dir_name,
            upload_date=datetime.utcnow()
        )
        db.add(doc)
        db.commit()
        print(f"INFO: Provisioned demo document for new user {user.email}")
        
    except Exception as e:
        print(f"ERROR: Failed to provision demo document: {e}")

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

def get_user_from_token_str(token: str, db: Session):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    print(f"DEBUG: Validating token: {token[:10]}...")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        print(f"DEBUG: Token payload email: {email}")
        if email is None:
            raise credentials_exception
    except JWTError as e:
        print(f"DEBUG: JWT Error: {e}")
        raise credentials_exception
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        print(f"DEBUG: User not found for email {email}")
        raise credentials_exception
    print(f"DEBUG: User validated: {user.id}")
    return user

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    return get_user_from_token_str(token, db)

async def get_current_user_flexible(
    request: Request,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    # 1. Try Query Param
    if token:
         return get_user_from_token_str(token, db)
    
    # 2. Try Header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
         token_str = auth_header.split(" ")[1]
         return get_user_from_token_str(token_str, db)
         
    raise HTTPException(status_code=401, detail="Not authenticated")

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
    auth_source: str = "local"
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
    output_xml_path: Optional[str] = None
    has_xml: bool = False
    has_debug: bool = False
    share_token: Optional[str] = None
    class Config:
        orm_mode = True

class ModelConfig(BaseModel):
    id: str
    name: str  # Can be same as ID or pretty name
    default_prompt: str = ""
    default_temperature: float = 0.0

class SystemConfigResponse(BaseModel):
    registration_mode: str
    default_model: Optional[str] = None
    default_temperature: Optional[float] = None
    available_models: List[ModelConfig] = []
    
    # New Fields for Phase 28
    default_segmentation_model: Optional[str] = None
    segmentation_models: List[str] = []
    preprocessing: Optional[Dict[str, Any]] = {}

class UserCreateAdmin(BaseModel):
    email: str
    auth_source: str # 'local' or 'ldap'
    full_name: Optional[str] = None

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

class SettingsUpdate(BaseModel):
    registration_mode: str

class UserPreferenceUpdate(BaseModel):
    preferences: Dict[str, Any]

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
def register(request: Request, user: UserCreate, token: Optional[str] = None, db: Session = Depends(get_db)):
    # Rate Limit
    client_host = request.client.host if request.client else "unknown"
    check_rate_limit(f"register:{client_host}", 5, 60) # 5 per minute
    
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
        
    if not validate_strong_password(user.password):
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters and include uppercase, lowercase, number, and special character.")
        
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
def login_for_access_token(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # Rate Limit
    client_host = request.client.host if request.client else "unknown"
    check_rate_limit(f"login:{client_host}", 10, 60) # 10 per minute

    # 1. Try to find user directly (assuming username input is email)
    user = db.query(User).filter(User.email == form_data.username).first()
    
    authenticated_user = None
    
    # 2. Local Authentication
    if user and user.auth_source == 'local':
        if verify_password(form_data.password, user.hashed_password):
            authenticated_user = user
    
    # 3. LDAP Authentication (If local failed or user not found or user is ldap)
    if not authenticated_user:
        # Only try LDAP if user is missing OR user exists and is ldap
        # (Don't let local users bypass password by hacking LDAP?? No, LDAP bind is strict)
        should_try_ldap = False
        if not user:
            should_try_ldap = True
        elif user.auth_source == 'ldap':
            should_try_ldap = True
            
        if should_try_ldap:
            ldap_service = LDAPService()
            
            # Silent Strip: Remove domain if user entered full email for LDAP
            ldap_check_username = form_data.username
            if '@' in ldap_check_username:
                ldap_check_username = ldap_check_username.split('@')[0]
                
            ldap_info = ldap_service.authenticate(ldap_check_username, form_data.password)
            
            if ldap_info:
                # LDAP Success!
                # Check mapping via Email (in case they logged in with username 'jdoe' but DB has 'jdoe@univ.edu')
                email_from_ldap = ldap_info.get('email')
                if not email_from_ldap:
                     # Fallback to username if it looks like email, or error?
                     # We need an email for Subscript.
                     if '@' in form_data.username:
                         email_from_ldap = form_data.username
                     else:
                         print("ERROR: LDAP authenticated but no email found. Cannot provision.")
                         # If user matches existing DB user by some other means? Hard. fail for now.
                
                if email_from_ldap:
                    # Look up user again by the canonical LDAP email
                    existing_user = db.query(User).filter(User.email == email_from_ldap).first()
                    
                    if existing_user:
                        # User exists (mapped by email)
                        authenticated_user = existing_user
                        # Update metadata
                        if ldap_info.get('full_name') and ldap_info['full_name'] != existing_user.full_name:
                             existing_user.full_name = ldap_info['full_name']
                             db.commit()
                        if existing_user.auth_source != 'ldap':
                             # Migration? Or collision?
                             # Let's assume we update source if they successfully authed via LDAP?
                             # No, unsafe. Keep as is.
                             pass
                    else:
                        # JIT Provisioning
                        
                        # Phase 37: Restricted Access Check
                        mode_setting = db.query(SystemSettings).filter(SystemSettings.key == "registration_mode").first()
                        if mode_setting and mode_setting.value == 'invite':
                            print(f"Blocking New LDAP User {email_from_ldap} (Registration Closed)")
                            # Raise 403 explicitly
                            raise HTTPException(
                                status_code=status.HTTP_403_FORBIDDEN,
                                detail="Registration is closed. Please contact an administrator.",
                            )
                        
                        # Check if first user
                        is_admin = db.query(User).count() == 0
                        new_user = User(
                            email=email_from_ldap,
                            full_name=ldap_info.get('full_name'),
                            auth_source='ldap',
                            is_admin=is_admin,
                            hashed_password="" # Not used
                        )
                        db.add(new_user)
                        db.commit()
                        db.refresh(new_user)
                        authenticated_user = new_user

    if not authenticated_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = authenticated_user

    if user.is_locked:
         raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is locked. Please contact administrator.",
        )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )

    # Attempt to provision demo document (Passive/Async-like check)
    # We do this AFTER token creation but before return. 
    # It checks file system so it's fast enough.
    try:
        provision_demo_document(user, db)
    except Exception as e:
        print(f"ERROR: Provisioning Hook Failed: {e}")

    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/auth/refresh", response_model=Token)
async def refresh_token(current_user: User = Depends(get_current_user)):
    """
    Refresh the access token for the current user.
    """
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": current_user.email}, expires_delta=access_token_expires
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
        
    if not validate_strong_password(password_change.new_password):
        raise HTTPException(status_code=400, detail="New password is too weak. Requires 8+ chars, upper, lower, number, special.")
    
    current_user.hashed_password = get_password_hash(password_change.new_password)
    db.commit()
    return {"message": "Password updated successfully"}

# --- Document Endpoints (Protected) ---

def populate_document_paths(doc: Document, user_email: str):
    """
    Dynamically populates absolute paths for document files if they exist on disk,
    even if the DB columns are empty. This ensures the frontend gets a valid path.
    """
    clean_email = sanitize_email(user_email)
    user_dir = os.path.join(USER_DOCS_DIR, clean_email)
    
    # Determine Document Directory
    if doc.directory_name:
         doc_dir = os.path.join(user_dir, doc.directory_name)
    else:
         doc_dir = user_dir # Legacy flat structure
         
    base_name = os.path.splitext(doc.filename)[0]
    
    # helper to set if exists
    def set_if_exists(attr_name, extension):
        # 1. Check if DB has it (prioritize DB if valid? No, filesystem is truth)
        # Actually, let's just overwrite with absolute path if found.
        candidate_path = os.path.join(doc_dir, f"{base_name}{extension}")
        if os.path.exists(candidate_path):
            setattr(doc, attr_name, candidate_path)
    
    set_if_exists("output_xml_path", ".xml")
    set_if_exists("output_pdf_path", ".pdf")
    set_if_exists("output_txt_path", ".txt")
    
    # Also ensure we have a fallback for PDF build if missing
    if not doc.output_pdf_path:
        # Check source image? No, just ensuring outputs are set if they exist.
        pass

@app.get("/api/documents", response_model=List[DocumentResponse])
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    print(f"DEBUG: Listing docs for user {current_user.id}")
    # Dynamically update last_modified based on file system
    # Filter out child documents (only show parents and loose files)
    docs = db.query(Document).filter(
        Document.owner_id == current_user.id,
        Document.parent_id == None
    ).all()
    print(f"DEBUG: Found {len(docs)} docs")

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
        if os.path.exists(os.path.join(doc_dir, f"{base_name}-debug.jpg")):
             # Fallback
             debug_path = os.path.join(doc_dir, f"{base_name}-debug.jpg")
             ts = int(os.path.getmtime(debug_path))
             # Removed thumbnail logic
             doc.thumbnail_url = None
        else:
            doc.thumbnail_url = None

        # New Dynamic Thumbnail Logic
        # For parent documents (merged), use the thumbnail of the first page (child with lowest page_order)
        if doc.parent_id is None and doc.children and len(doc.children) > 0:
             # It is a parent. Children are loaded eagerly? 
             # SQLAlchemy relationship `children` is available.
             # We want the child with lowest page_order.
             sorted_children = sorted(doc.children, key=lambda c: c.page_order)
             first_child = sorted_children[0]
             # Dynamic URL to first child
             doc.thumbnail_url = f"/api/thumbnail/{first_child.id}"
        elif doc.thumbnail_url is None:
             # Standard self-reference
             doc.thumbnail_url = f"/api/thumbnail/{doc.id}"

        # Dynamic Path Population (Fix for missing DB paths)
        populate_document_paths(doc, current_user.email)

    return docs

@app.post("/api/upload", response_model=DocumentResponse)
def upload_document(
    file: UploadFile = File(...),
    model: str = Form("gemini-pro-3"), # Default to valid model key
    options: Optional[str] = Form(None),
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
        
    # Synchronous Thumbnail Generation
    thumb_path = os.path.join(storage_dir, f"{base_name}-thumb.jpg")
    create_thumbnail(file_path, thumb_path)
        
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
    # Trigger Celery Task
    from server.tasks import process_document_task
    process_document_task.delay(doc.id, file_path, model, options)
    
    return doc

@app.post("/api/upload-batch", response_model=DocumentResponse)
def upload_batch(
    files: List[UploadFile] = File(...),
    model: str = Form("gemini-pro-3"),
    group_filename: Optional[str] = Form(None),
    options: Optional[str] = Form(None),
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
    from server.tasks import process_document_task, process_batch_task

    children_xmls = [] # relative paths for LST
    file_path_list = [] # Accumulate paths for batch processing
    created_docs_info = [] # Store (doc_id, file_path) for flat processing

    for i, file in enumerate(files):
        clean_filename = sanitize_filename(file.filename)
        
        storage_dir, dir_name = upload_target_map[i]
        file_path = os.path.join(storage_dir, clean_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Synchronous Thumbnail Generation
        thumb_path = os.path.join(storage_dir, f"{os.path.splitext(clean_filename)[0]}-thumb.jpg")
        create_thumbnail(file_path, thumb_path)
            
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
        
        # Accumulate info
        file_path_list.append(file_path)
        created_docs_info.append((doc.id, file_path))

        # For LST generation:
        if parent_doc:
             base_name = os.path.splitext(clean_filename)[0]
             children_xmls.append(os.path.join(clean_email, dir_name, f"{base_name}.xml"))

    # 3. Finalize
    if parent_doc:
        # LST Generation
        lst_base = os.path.splitext(clean_group_name)[0] + ".lst"
        lst_path_abs = os.path.join(USER_DOCS_DIR, clean_email, group_dir_name, lst_base)
        
        with open(lst_path_abs, "w") as f:
            f.write("\n".join(children_xmls) + "\n")
            

            
        parent_doc.status = "queued" 
        db.commit()
        
        # Trigger Optimized Batch Task
        process_batch_task.delay(parent_doc.id, file_path_list, model, options)
        
        return parent_doc
    else:
        # Flat upload -> Individual Tasks
        for doc_id, f_path in created_docs_info:
             process_document_task.delay(doc_id, f_path, model, options)
             
        # Return last doc (existing behavior)
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
        
    populate_document_paths(doc, current_user.email)
    
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

class BulkDownloadRequest(BaseModel):
    doc_ids: List[int]
    type: str # 'map', 'txt', 'xml', 'pdf', 'zip'

@app.post("/api/download/bulk")
def download_bulk(
    request: BulkDownloadRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not request.doc_ids:
        raise HTTPException(status_code=400, detail="No documents selected")

    # Fetch all docs at once to validate ownership
    docs = db.query(Document).filter(
        Document.id.in_(request.doc_ids), 
        Document.owner_id == current_user.id
    ).all()
    
    if len(docs) != len(set(request.doc_ids)):
        # Some docs missing or not owned by user
        # For bulk actions, we usually just process what we can find, but let's be strict or lenient?
        # Lenient: Just zip what matches.
        pass

    if not docs:
        raise HTTPException(status_code=404, detail="No valid documents found")

    memory_file = BytesIO()
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        
        clean_email = sanitize_email(current_user.email)
        user_base_dir = os.path.join(USER_DOCS_DIR, clean_email)

        for doc in docs:
            # Resolve Doc Directory
            if doc.directory_name:
                doc_dir = os.path.join(user_base_dir, doc.directory_name)
            else:
                doc_dir = user_base_dir
            
            base_name = os.path.splitext(doc.filename)[0]
            
            # Determine files to add
            files_to_add = [] # List of (abs_path, zip_path)

            if request.type == 'zip':
                # Create a nested ZIP for this doc's assets
                # We reuse the logic from download_document by manually zipping here
                doc_assets_buffer = BytesIO()
                with zipfile.ZipFile(doc_assets_buffer, 'w', zipfile.ZIP_DEFLATED) as nested_zf:
                    # PDF
                    p = os.path.join(doc_dir, f"{base_name}.pdf")
                    if os.path.exists(p): nested_zf.write(p, f"{base_name}.pdf")
                    # XML
                    p = os.path.join(doc_dir, f"{base_name}.xml")
                    if os.path.exists(p): nested_zf.write(p, f"{base_name}.xml")
                    # TXT
                    p = os.path.join(doc_dir, f"{base_name}.txt")
                    if os.path.exists(p): nested_zf.write(p, f"{base_name}.txt")
                    # Debug
                    p = os.path.join(doc_dir, f"{base_name}-debug.jpg")
                    if os.path.exists(p): nested_zf.write(p, f"{base_name}-debug.jpg")
                
                # Write the nested zip to the master zip
                # We need to write the bytes
                zf.writestr(f"{base_name}-assets.zip", doc_assets_buffer.getvalue())

            else:
                # specific types
                if request.type == 'pdf':
                    files_to_add.append((os.path.join(doc_dir, f"{base_name}.pdf"), f"{base_name}.pdf"))
                elif request.type == 'xml':
                    files_to_add.append((os.path.join(doc_dir, f"{base_name}.xml"), f"{base_name}.xml"))
                elif request.type == 'txt':
                    files_to_add.append((os.path.join(doc_dir, f"{base_name}.txt"), f"{base_name}.txt"))
                elif request.type == 'map':
                    files_to_add.append((os.path.join(doc_dir, f"{base_name}-debug.jpg"), f"{base_name}-debug.jpg"))
            
                for src, dst in files_to_add:
                    if os.path.exists(src):
                        zf.write(src, dst)
    
    memory_file.seek(0)
    filename = f"bulk_download_{request.type}.zip"
    return StreamingResponse(
        memory_file, 
        media_type="application/zip", 
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

from fastapi.responses import FileResponse

@app.get("/api/download/{doc_id}/{file_type}")
def download_document(
    doc_id: int,
    file_type: str,
    filename: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_flexible)
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
        download_filename = filename if filename else f"{base_name}.pdf"
    elif file_type == "txt":
        file_path = os.path.join(doc_dir, f"{base_name}.txt")
        media_type = "text/plain"
        download_filename = filename if filename else f"{base_name}.txt"
    elif file_type == "xml":
        file_path = os.path.join(doc_dir, f"{base_name}.xml")
        media_type = "application/xml"
        download_filename = filename if filename else f"{base_name}.xml"
    elif file_type == "debug" or file_type == "map":
        file_path = os.path.join(doc_dir, f"{base_name}-debug.jpg")
        media_type = "image/jpeg"
        download_filename = filename if filename else f"{base_name}-debug.jpg"
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
        
    return FileResponse(file_path, media_type=media_type, filename=download_filename, content_disposition_type="inline")

@app.get("/api/thumbnail/{doc_id}")
def get_thumbnail(
    doc_id: int, 
    token: str = Query(None),
    db: Session = Depends(get_db)
):
    if not token:
        raise HTTPException(status_code=401, detail="Token required")
        
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
        
    clean_email = sanitize_email(user.email)
    user_dir = os.path.join(USER_DOCS_DIR, clean_email)
    
    if doc.directory_name:
         doc_dir = os.path.join(user_dir, doc.directory_name)
    else:
         doc_dir = user_dir
         
    base_name = os.path.splitext(doc.filename)[0]
    thumb_path = os.path.join(doc_dir, f"{base_name}-thumb.jpg")
    
    if os.path.exists(thumb_path):
        return FileResponse(thumb_path)
    
    # 404 if missing (Frontend will handle fallback)
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
        if not validate_strong_password(user_update.password):
             raise HTTPException(status_code=400, detail="Password is too weak.")
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
        
    
    # Cleanup file system (Recursive delete of user's root document directory)
    clean_email = sanitize_email(user.email)
    user_dir = os.path.join(USER_DOCS_DIR, clean_email)
    if os.path.exists(user_dir):
        try:
            shutil.rmtree(user_dir)
            logger.info(f"Deleted user directory: {user_dir}")
        except Exception as e:
            logger.error(f"Failed to delete user directory {user_dir}: {e}")

    db.delete(user)
    db.commit()
    db.delete(user)
    db.commit()
    return {"message": "User deleted"}

@app.post("/api/users", response_model=UserResponse)
def create_user_admin(user_create: UserCreateAdmin, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Admin endpoint to manually create/pre-approve a user.
    Useful for adding LDAP users when registration is closed.
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    existing_user = db.query(User).filter(User.email == user_create.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")
        
    new_user = User(
        email=user_create.email,
        full_name=user_create.full_name,
        auth_source=user_create.auth_source,
        is_admin=False,
        hashed_password="" # Empty for LDAP. If local, they must use Invite link? 
                           # Actually for Local, this creates a user with NO password, breaking login.
                           # So this endpoint should restrict auth_source='ldap' OR handle local differently.
                           # But user requested "Add User" for toggling.
                           # If they add "Local" here, the user cannot login (no password).
                           # We should enforce auth_source='ldap' or warn?
                           # The UI separates "Guest Link" (Invite) vs "LDAP User" (Direct Add).
                           # So this endpoint is primarily for LDAP. 
    )
    
    if user_create.auth_source == 'local':
        # If admin tries to create LOCAL user directly, they won't have a password.
        # We could set a temp password? Or just allow it and they use "Forgot Password"? (No SMTP).
        # Best to treat this as "LDAP Only" or clarify usage.
        # But for now, just create it.
        pass

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


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

def load_system_config_logic(db: Session) -> Dict[str, Any]:
    # 1. Registration Mode (DB)
    mode_setting = db.query(SystemSettings).filter(SystemSettings.key == "registration_mode").first()
    reg_mode = mode_setting.value if mode_setting else "open"

    # 2. Transcription Defaults (YAML)
    default_model = "gemini-pro-3"
    default_temperature = 0.0
    models_list = [] 

    config_path = "/app/config.yml"
    models_config = {} # Define early scope
    transcription = {}
    preprocessing = {}
    
    try:
        with open(config_path, "r") as f:
            config = yaml.safe_load(f)
            
        transcription = config.get("transcription", {})
        default_model = transcription.get("default_model", "gemini-pro-3")
        
        # Parse all models
        models_config = transcription.get("models", {})
        if models_config:
            for model_id, m_data in models_config.items():
                api_pass = m_data.get("API_passthrough", {})
                temp = api_pass.get("temperature", 0.0)
                prompt = m_data.get("prompt", "")
                
                # Check for pretty name or use ID
                name = m_data.get("model", model_id) 
                
                models_list.append(ModelConfig( 
                    id=model_id,
                    name=model_id, 
                    default_prompt=prompt,
                    default_temperature=float(temp)
                ))
        
        # Lookup default temp again from the robust list or fallback
        # Find default model in list
        def_mod_obj = next((m for m in models_list if m.id == default_model), None)
        if def_mod_obj:
            default_temperature = def_mod_obj.default_temperature

        
    except Exception as e:
        logger.error(f"Failed to load defaults from config.yml: {e}")

    # Phase 28: Segmentation & Preprocessing
    seg_config = config.get("segmentation", {})
    default_seg = seg_config.get("default_segmentation", "historical-manuscript")
    seg_models_dict = seg_config.get("models", {})
    seg_model_keys = list(seg_models_dict.keys()) if seg_models_dict else []

    # Preprocessing is at ROOT level in config.yml (Phase 28 Correction)
    preprocessing = config.get("preprocessing", {})

    return {
        "registration_mode": reg_mode,
        "default_model": default_model,
        "default_temperature": default_temperature,
        "available_models": models_list,
        "default_segmentation_model": default_seg,
        "segmentation_models": seg_model_keys,
        "preprocessing": preprocessing,
        # Raw helpers for robust merge later (not part of response model but useful)
        "_models_config": models_config 
    }

@app.get("/api/system/config", response_model=SystemConfigResponse)
def get_system_config(db: Session = Depends(get_db)):
    data = load_system_config_logic(db)
    # Remove internal keys
    if "_models_config" in data:
        del data["_models_config"]
    return data

@app.get("/api/admin/settings", response_model=SystemConfigResponse)
def get_admin_settings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    mode_setting = db.query(SystemSettings).filter(SystemSettings.key == "registration_mode").first()
    return {"registration_mode": mode_setting.value if mode_setting else "open"}


# --- Phase 29: User Preferences Endpoints ---

@app.get("/api/preferences", response_model=Dict[str, Any])
def get_user_preferences(
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """
    Returns the merged configuration:
    1. Loads current System Config (defaults from config.yml)
    2. Loads UserPreference from DB
    3. Merges DB prefs over System defaults
    """
    # 1. Get System Defaults
    system_data = load_system_config_logic(db)
    
    # Construct Default State Object (matching what UI expects)
    # The UI mainly cares about: selectedModel, temperature, systemPrompt, segmentationModel, preprocessing
    
    # Default Model
    def_model_id = system_data["default_model"]
    def_temp = system_data["default_temperature"]
    def_prompt = ""
    # Find prompt for default model
    for m in system_data["available_models"]:
        if m.id == def_model_id:
            def_prompt = m.default_prompt
            break

    default_state = {
        "subscript_model": def_model_id,
        "subscript_temp": def_temp,
        "subscript_prompt": def_prompt,
        "subscript_seg": system_data["default_segmentation_model"],
        "subscript_preproc": system_data["preprocessing"]
    }

    # 2. Get User Preferences
    user_pref = db.query(UserPreference).filter(UserPreference.user_id == current_user.id).first()
    user_overrides = user_pref.preferences if user_pref else {}

    # 3. Merge User Overrides
    print(f"DEBUG: User {current_user.email} - DB Prefs: {user_overrides}")
    merged_prefs = {**default_state, **user_overrides}
    print(f"DEBUG: User {current_user.email} - Merged Prefs: {merged_prefs}")
    
    # 4. Return EVERYTHING (Metadata + Merged Prefs)
    # We include available_models etc. so frontend doesn't need a 2nd call
    response_data = {
        **system_data, # Includes available_models, segmentation_models, etc.
        "preferences": merged_prefs # The active user selections
    }
    
    # Remove internal keys if any
    if "_models_config" in response_data:
        del response_data["_models_config"]
        
    return response_data

@app.put("/api/preferences")
def update_user_preferences(
    pref_update: UserPreferenceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Updates the user's preferences.
    This expects a partial or full dictionary of settings to save.
    We will merge these into the existing DB record.
    """
    user_pref = db.query(UserPreference).filter(UserPreference.user_id == current_user.id).first()
    
    if not user_pref:
        user_pref = UserPreference(user_id=current_user.id, preferences={})
        db.add(user_pref)
    
    # Merge new updates into existing DB JSON
    current_prefs = dict(user_pref.preferences) if user_pref.preferences else {}
    updated_prefs = {**current_prefs, **pref_update.preferences}
    
    # Force update detection for SQLAlchemy JSON type
    user_pref.preferences = updated_prefs
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(user_pref, "preferences")
    
    db.commit()
    
    return {"status": "success", "preferences": updated_prefs}

@app.post("/api/preferences/reset")
def reset_user_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Resets user preferences by deleting the DB record.
    Future GET calls will return system defaults.
    """
    user_pref = db.query(UserPreference).filter(UserPreference.user_id == current_user.id).first()
    if user_pref:
        db.delete(user_pref)
        db.commit()
    
    return {"status": "reset_complete"}

@app.get("/api/system/status")
def get_system_status(db: Session = Depends(get_db)):
    mode_setting = db.query(SystemSettings).filter(SystemSettings.key == "registration_mode").first()
    mode = "open"
    if mode_setting:
        mode = mode_setting.value
    return {
        "registration_mode": mode,
        "ldap_enabled": LDAP_ENABLED
    }

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

# --- Config Management ---

class ConfigUpdate(BaseModel):
    content: str

@app.get("/api/admin/config/yml")
def get_config_yml(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    config_path = "/app/config.yml"
    try:
        with open(config_path, "r") as f:
            content = f.read()
        return {"content": content}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="config.yml not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/admin/config/yml")
def update_config_yml(config: ConfigUpdate, current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    config_path = "/app/config.yml"
    
    # Validate YAML
    try:
        yaml.safe_load(config.content)
    except yaml.YAMLError as e:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {e}")
        
    try:
        with open(config_path, "w") as f:
            f.write(config.content)
        return {"message": "Configuration updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
