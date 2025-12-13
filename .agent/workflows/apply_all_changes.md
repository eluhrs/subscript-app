---
description: safely applies all code changes (frontend and backend) by cleaning cache and forcing a rebuild
---

Use this workflow when you have made changes to both Frontend and Backend, or when you want to be 100% sure that your changes are applied without "stale code" issues.

1. Stop all containers to ensure a clean slate.
   // turbo
   ```bash
   docker compose down
   ```

2. Clean up compiled Python files to prevent stale bytecode execution.
   // turbo
   ```bash
   find . -name "__pycache__" -type d -exec rm -rf {} + && find . -name "*.pyc" -delete
   ```

3. Rebuild and recreate all services.
   - `--build`: Recompiles the Frontend and Backend images.
   - `--force-recreate`: Ensures containers are fresh even if configuration hasn't changed.
   // turbo
   ```bash
   docker compose up -d --build --force-recreate
   ```
