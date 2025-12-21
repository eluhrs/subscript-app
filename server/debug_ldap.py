import os
import sys
from ldap3 import Server, Connection, ALL
from getpass import getpass

# Hardcode or load from input to test rapidly
def test_ldap(server_url, dn_template, username, password):
    print(f"\n--- Testing LDAP Configuration ---")
    print(f"Server: {server_url}")
    print(f"Template: {dn_template}")
    print(f"Username: {username}")
    
    user_dn = dn_template.format(username=username)
    print(f"Full DN being used: {user_dn}")
    
    try:
        server = Server(server_url, get_info=ALL)
        conn = Connection(server, user=user_dn, password=password, auto_bind=True)
        print(f"\nSUCCESS: Bind successful!")
        print(f"User DN: {conn.user}")
        
        # Try to read attributes
        print("\nAttempting to read user attributes...")
        conn.search(search_base=user_dn, 
                    search_filter='(objectClass=*)', 
                    attributes=['cn', 'displayName', 'mail', 'uid'])
        
        if conn.entries:
            print("Attributes found:")
            print(conn.entries[0])
        else:
            print("Bind worked, but could not read attributes (Permissions issue?).")
            
        conn.unbind()
        return True
    except Exception as e:
        print(f"\nFAILURE: Bind failed.")
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    # Load defaults from env if available, otherwise ask
    default_url = os.getenv("LDAP_SERVER_URL", "ldap://nis.cc.lehigh.edu:389")
    default_template = os.getenv("LDAP_USER_DN_TEMPLATE", "uid={username},dc=lehigh,dc=edu")
    
    print("LDAP Debugger")
    url = input(f"LDAP Server URL [{default_url}]: ").strip() or default_url
    template = input(f"DN Template [{default_template}]: ").strip() or default_template
    username = input("Username to test (e.g. eluhrs): ").strip()
    password = getpass("Password: ")
    
    test_ldap(url, template, username, password)
