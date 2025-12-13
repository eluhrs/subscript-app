import sys
import os

# Ensure the parent directory (/app) is in sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.main import SessionLocal, Document, DATABASE_URL, USER_DOCS_DIR
import os

def count_docs():
    db = SessionLocal()
    try:
        print(f"DB URL: {DATABASE_URL}")
        
        # LS Documents
        user_doc_dir = os.path.join(USER_DOCS_DIR, "eluhrs@gmail.com")
        if os.path.exists(user_doc_dir):
            print(f"LS {user_doc_dir}:")
            for root, dirs, files in os.walk(user_doc_dir):
                for name in files:
                    print(os.path.join(root, name))
        else:
            print(f"Dir {user_doc_dir} not found")

        docs = db.query(Document).all()
        print(f"Count: {len(docs)}")
        for d in docs:
            print(f"ID: {d.id} Status: {d.status} File: {d.filename} Owner: {d.owner_id} Parent: {d.parent_id} Dir: {d.directory_name}")
            if d.children:
                print(f"  Children: {[c.id for c in d.children]}")
            else:
                print("  Children: None/Empty")
            
        from server.main import User
        users = db.query(User).all()
        print(f"Users Count: {len(users)}")
        for u in users:
            print(f"User ID: {u.id} Email: {u.email}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    count_docs()
