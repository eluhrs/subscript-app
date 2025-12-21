#!/bin/bash

# Display help
if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    echo "Usage: ./create_admin.sh [email] [full_name] [password]"
    echo "If arguments are missing, you will be prompted to enter them."
    exit 0
fi

EMAIL=$1
NAME=$2
PASSWORD=$3

# Prompt for values if not provided
if [ -z "$EMAIL" ]; then
    read -p "Enter Admin Email: " EMAIL
fi

if [ -z "$NAME" ]; then
    read -p "Enter Admin Full Name: " NAME
fi

if [ -z "$PASSWORD" ]; then
    read -s -p "Enter Admin Password: " PASSWORD
    echo "" # Newline
    read -s -p "Confirm Admin Password: " CONFIRM_PASSWORD
    echo "" # Newline
    
    if [ "$PASSWORD" != "$CONFIRM_PASSWORD" ]; then
        echo "Error: Passwords do not match."
        exit 1
    fi
fi

if [ -z "$PASSWORD" ]; then
    echo "Error: Password cannot be empty."
    exit 1
fi

echo "Creating Admin User: $EMAIL ($NAME)..."

# Run the python script inside the container, passing the password via environment variable for safety
# (Avoiding passing it as a command line argument which would be visible in ps)
docker compose exec -e ADMIN_PASSWORD="$PASSWORD" backend python server/create_admin_user.py "$EMAIL" "$NAME"
