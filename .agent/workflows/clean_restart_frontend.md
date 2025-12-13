---
description: Ensure changes to the frontend are applied by forcing a cache-free rebuild and container recreation.
---
Use this workflow when you have made changes to `web/src` (React components, CSS, JS) but they are not appearing in the browser even after a refresh. This often happens because Docker caches the build layers aggressively.

1. Force a rebuild of the frontend image without cache.
// turbo
2. Force recreation of the frontend container to use the new image.
```bash
docker compose build --no-cache frontend && docker compose up -d --force-recreate frontend
```
