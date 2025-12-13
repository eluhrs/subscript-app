---
description: reliably apply backend/worker changes by cleaning pyc files and forcing container recreation
---

Use this workflow when modifying `server/tasks.py` or other deep backend logic where a simple restart has proven insufficient or when you suspect "stale code" is running.

1. Stop the relevant containers to release file locks.
   // turbo
   ```bash
   docker compose stop backend worker
   ```

2. Clean up compiled Python files (removes potential stale bytecode).
   // turbo
   ```bash
   find . -name "__pycache__" -type d -exec rm -rf {} + && find . -name "*.pyc" -delete
   ```

3. Recreate the containers. The `--force-recreate` flag ensures fresh containers are created even if configuration hasn't changed.
   // turbo
   ```bash
   docker compose up -d --force-recreate backend worker
   ```
