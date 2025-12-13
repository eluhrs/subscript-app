---
description: Revert the application to the stable "Dashboard Polish" state (Commit fc038cb) and perform a clean rebuild. Use this if the environment becomes unstable before a demo.
---

1. **Stop all running containers** to release file locks.
   ```bash
   docker compose down
   ```

2. **Hard Reset Git** to the last pushed commit (`origin/main` aka `fc038cb`).
   ```bash
   git reset --hard origin/main
   ```

3. **Clean Untracked Files**. This is critical to remove the temporary files like `AdvancedUploadScreen.jsx` that might persist and confuse the build.
   ```bash
   git clean -fd
   ```

4. **Rebuild Containers from Scratch**. Use `--no-cache` to ensure Docker drops all "ghost" layers.
   ```bash
   // turbo-all
   docker compose build --no-cache
   ```

5. **Start the Application**. Use `--force-recreate` to ensure new containers are spun up.
   ```bash
   docker compose up -d --force-recreate
   ```

6. **Verify**. The application will now be running the stable "Dashboard Polish" version. "Advanced Options" will be gone.
