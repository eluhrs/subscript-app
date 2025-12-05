import os
import shutil
import logging
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Depends, status
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

# --- Configuration ---
# --- Configuration ---
BASE_UPLOAD_DIR = "/app/documents"
INPUT_DIR = os.path.join(BASE_UPLOAD_DIR, "input")
OUTPUT_DIR = os.path.join(BASE_UPLOAD_DIR, "output")
DATABASE_URL = "sqlite:////app/subscript.db"
SECRET_KEY = "your-secret-key-change-this-in-production" # TODO: Load from env
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

os.makedirs(INPUT_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

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
    status = Column(String, default="uploaded") # uploaded, processing, completed, error
    error_message = Column(String, nullable=True)
    output_txt_path = Column(String, nullable=True)
    output_pdf_path = Column(String, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="documents")

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
    status: str
    error_message: Optional[str] = None
    output_txt_path: Optional[str] = None
    output_pdf_path: Optional[str] = None
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
    return current_user.documents

@app.post("/api/upload", response_model=DocumentResponse)
def upload_document(
    file: UploadFile = File(...),
    model: str = "gemini",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    user_input_dir = os.path.join(INPUT_DIR, current_user.email)
    os.makedirs(user_input_dir, exist_ok=True)
    file_path = os.path.join(user_input_dir, file.filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    doc = Document(filename=file.filename, status="queued", owner_id=current_user.id)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    
    # Trigger Celery Task
    from server.tasks import process_document_task
    process_document_task.delay(doc.id, file_path, model)
    
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
    if doc.output_txt_path and os.path.exists(doc.output_txt_path):
        os.remove(doc.output_txt_path)
    if doc.output_pdf_path and os.path.exists(doc.output_pdf_path):
        os.remove(doc.output_pdf_path)
        
    # Delete input file
    input_path = os.path.join(INPUT_DIR, doc.owner.email, doc.filename)
    if os.path.exists(input_path):
        os.remove(input_path)
    # Also check legacy path just in case
    legacy_input_path = os.path.join(INPUT_DIR, str(doc.owner_id), doc.filename)
    if os.path.exists(legacy_input_path):
        os.remove(legacy_input_path)
        
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
        
    if file_type == "pdf":
        file_path = doc.output_pdf_path
        media_type = "application/pdf"
    elif file_type == "txt":
        file_path = doc.output_txt_path
        media_type = "text/plain"
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
        
    # Serve input file as thumbnail if it exists
    # Look in user-specific directory first, then fallback to root input (for legacy files)
    user_input_path = os.path.join(INPUT_DIR, user.email, doc.filename)
    legacy_input_path = os.path.join(INPUT_DIR, str(user.id), doc.filename)
    
    if os.path.exists(user_input_path):
        return FileResponse(user_input_path)
    elif os.path.exists(legacy_input_path):
        return FileResponse(legacy_input_path)
    else:
        # Fallback to placeholder or 404
        raise HTTPException(status_code=404, detail="Thumbnail not found")

