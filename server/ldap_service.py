import os
import logging
from ldap3 import Server, Connection, ALL, SAFE_SYNC
from ldap3.core.exceptions import LDAPException

logger = logging.getLogger(__name__)

from server.utils import sanitize_filename, sanitize_email, create_thumbnail, sanitize_ldap_username

class LDAPService:
    def __init__(self):
        self.enabled = os.getenv("LDAP_ENABLED", "false").lower() == "true"
        self.server_url = os.getenv("LDAP_SERVER_URL")
        # Template: e.g. "uid={username},ou=people,dc=example,dc=com"
        self.dn_template = os.getenv("LDAP_USER_DN_TEMPLATE")
        
        if self.enabled and self.server_url and self.server_url.startswith("ldap://"):
             logger.warning("SECURITY WARNING: LDAP configured with 'ldap://' (Plaintext). "
                            "Passwords are being transmitted unencrypted. "
                            "Please use 'ldaps://' (Port 636) and StartTLS if possible.")

    def authenticate(self, username, password):
        """
        Attempts to bind to the LDAP server using the provided credentials.
        Returns:
            dict: User attributes (email, full_name) if successful.
            None: If authentication fails.
        """
        if not self.enabled:
            return None
            
        if not self.server_url or not self.dn_template:
            logger.warning("LDAP authentication attempted but not configured.")
            return None

        # 0. Sanitize Input (Anti-Injection)
        # We strip illegal chars before injecting into the DN template
        safe_username = sanitize_ldap_username(username)
        if safe_username != username:
            logger.warning(f"LDAP: Username '{username}' contained illegal characters. Sanitized to '{safe_username}'.")
            
        if not safe_username:
             return None

        # 1. Construct User DN
        try:
            user_dn = self.dn_template.format(username=safe_username)
        except KeyError:
            logger.error("LDAP_USER_DN_TEMPLATE must contain {username} placeholder.")
            return None

        logger.info(f"LDAP: Attempting bind for {safe_username} (DN: ...)")

        try:
            # 2. Connect and Bind
            server = Server(self.server_url, get_info=ALL)
            conn = Connection(server, user=user_dn, password=password, auto_bind=True)
            
            # If we are here, bind was successful.
            logger.info(f"LDAP: Bind successful for {username}")
            
            # 3. Retrieve Attributes (Optional but helpful for JIT)
            # We need to know who this user is (Email, Full Name).
            # If the DN bind doesn't let us read attributes, we might need a separate 
            # search bind, but for now let's assume we can read our own entry.
            
            user_info = {
                "username": username,
                "email": None,
                "full_name": None
            }

            try:
                # Search for self to get attributes
                # Base: user_dn
                # Filter: (objectClass=*)
                conn.search(search_base=user_dn, 
                            search_filter='(objectClass=*)', 
                            attributes=['cn', 'displayName', 'mail', 'uid'])
                
                if conn.entries:
                    entry = conn.entries[0]
                    # Map standard LDAP attributes to our User model
                    # Mail
                    if 'mail' in entry:
                         user_info['email'] = str(entry.mail)
                    
                    # Full Name
                    if 'displayName' in entry:
                        user_info['full_name'] = str(entry.displayName)
                    elif 'cn' in entry:
                        user_info['full_name'] = str(entry.cn)
                        
            except Exception as e:
                logger.warning(f"LDAP: Could not fetch attributes for {username}: {e}")

            # Fallback: If email is missing, use username? 
            # Subscript REQUIRES email. If LDAP doesn't give mail, we might have to fallback 
            # to {username} if it looks like an email, or fail.
            if not user_info['email']:
                if '@' in username:
                    user_info['email'] = username
                else:
                    logger.warning(f"LDAP: No email attribute found and username '{username}' is not an email. Cannot JIT provision.")
                    # Return success but strictly valid flag? 
                    # For now fail if we can't identify the user email.
                    return None
            
            conn.unbind()
            return user_info

        except LDAPException as e:
            logger.info(f"LDAP: Bind failed for {username}: {e}")
            return None
        except Exception as e:
            logger.error(f"LDAP: Unexpected error: {e}")
            return None
