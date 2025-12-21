#!/bin/bash

# 1. Register
echo "--- Registering ---"
curl -s -X POST http://localhost:8001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "tourtest4@example.com", "password": "password"}'

echo -e "\n\n--- Login ---"
TOKEN_RESPONSE=$(curl -s -X POST http://localhost:8001/api/auth/token \
  -d 'username=tourtest4@example.com&password=password')
echo "Response: $TOKEN_RESPONSE"

TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.access_token')
echo "Token: $TOKEN"

if [ "$TOKEN" == "null" ]; then
  echo "Login failed"
  exit 1
fi

# 2. Get Initial Prefs
echo -e "\n\n--- Get Initial Prefs ---"
curl -s http://localhost:8001/api/preferences -H "Authorization: Bearer $TOKEN" | jq .

# 3. Update Prefs (Set tour_seen = true)
echo -e "\n\n--- Update Prefs ---"
curl -s -X PUT http://localhost:8001/api/preferences \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"preferences": {"tour_seen": true}}' | jq .

# 4. Get Prefs Again (Verify persistence)
echo -e "\n\n--- Get Prefs After Update ---"
curl -s http://localhost:8001/api/preferences -H "Authorization: Bearer $TOKEN" | jq .
