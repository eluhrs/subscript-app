import urllib.request
import urllib.parse
import json
import os
import time
import mimetypes

BASE_URL = "http://localhost:8001/api"
EMAIL = "verification_user@example.com"
PASSWORD = "password123"
FILENAME = "test file (1) & more.txt"

def request(method, url, data=None, headers=None, files=None):
    if headers is None:
        headers = {}
    
    if files:
        boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
        data_bytes = b''
        for name, (filename, file_content) in files.items():
            data_bytes += f'--{boundary}\r\n'.encode()
            data_bytes += f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode()
            data_bytes += f'Content-Type: {mimetypes.guess_type(filename)[0] or "application/octet-stream"}\r\n\r\n'.encode()
            data_bytes += file_content
            data_bytes += b'\r\n'
        data_bytes += f'--{boundary}--\r\n'.encode()
        headers['Content-Type'] = f'multipart/form-data; boundary={boundary}'
        data = data_bytes
    elif data is not None and isinstance(data, dict):
        if 'Content-Type' not in headers:
            headers['Content-Type'] = 'application/json'
        data = json.dumps(data).encode('utf-8')
    elif data is not None and isinstance(data, str):
         data = data.encode('utf-8')

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            return response.status, response.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')

def verify():
    # 1. Register
    print("Registering user...")
    status, body = request("POST", f"{BASE_URL}/auth/register", data={"email": EMAIL, "password": PASSWORD})
    if status not in [200, 400]:
        print(f"Registration failed: {status} {body}")
        
    # 2. Login
    print("Logging in...")
    login_data = urllib.parse.urlencode({"username": EMAIL, "password": PASSWORD}).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/auth/token", data=login_data, method="POST")
    try:
        with urllib.request.urlopen(req) as response:
            body = response.read().decode('utf-8')
            token = json.loads(body)["access_token"]
    except urllib.error.HTTPError as e:
        print(f"Login failed: {e.code} {e.read().decode('utf-8')}")
        return False
        
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Upload File
    print(f"Uploading file: {FILENAME}")
    file_content = b"This is a test document content for debug link check."
    status, body = request("POST", f"{BASE_URL}/upload", headers=headers, files={"file": (FILENAME, file_content)})
    
    if status != 200:
        print(f"Upload failed: {status} {body}")
        return False
    
    doc = json.loads(body)
    doc_id = doc["id"]
    sanitized_filename = doc["filename"]
    print(f"Upload success. ID: {doc_id}, Sanitized Name: {sanitized_filename}")

    # 4. Check on disk
    expected_path = f"documents/{EMAIL}/{sanitized_filename}"
    if os.path.exists(expected_path):
        print(f"File found on disk at {expected_path}")
    else:
        print(f"ERROR: File NOT found on disk at {expected_path}")
        return False

    # 5. Check Links
    # We expect these might 404 if processing hasn't run/failed, BUT the endpoint logic should be reachable.
    # We can fake the existence of an XML file to test download logic if needed,
    # but let's just create a dummy xml file on disk to verify the download endpoint picks it up.
    xml_path = expected_path.replace(".txt", ".xml")
    with open(xml_path, "w") as f:
        f.write("<xml>test</xml>")
    
    print("Testing XML download...")
    status, body = request("GET", f"{BASE_URL}/download/{doc_id}/xml", headers=headers)
    if status == 200 and "<xml>test</xml>" in body:
        print("XML download verified.")
    else:
        print(f"XML download failed: {status}")
        return False

    # 6. Delete
    print("Deleting document...")
    status, body = request("DELETE", f"{BASE_URL}/documents/{doc_id}", headers=headers)
    if status != 204:
        print(f"Delete failed: {status} {body}")
        return False
        
    # 7. Verify Deletion
    if os.path.exists(expected_path):
        print(f"ERROR: File still exists on disk after deletion!")
        return False
    else:
        print("File successfully removed from disk.")
    
    # Also verify the manually created XML is gone
    if os.path.exists(xml_path):
         print(f"ERROR: Manual XML file still exists!")
    else:
         print("Associated XML file successfully removed.")
        
    return True

if __name__ == "__main__":
    try:
        if verify():
            print("VERIFICATION SUCCESSFUL")
        else:
            print("VERIFICATION FAILED")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Verification crashed: {e}")
