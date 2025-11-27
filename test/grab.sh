#!/usr/bin/env bash

# Usage: ./grab_pages.sh manifest.json

set -euo pipefail

manifest="${1:-}"

if [ -z "$manifest" ]; then
  echo "Usage: $0 manifest.json" >&2
  exit 1
fi

i=1

# Extract URLs ending with .jpg, unescape `\/` → `/`, download via lynx
grep -o 'https:\\/\\/[^"]*\.jpg' "$manifest" \
  | sed 's#\\/#/#g' \
  | while read -r url; do
      printf -v out "page_%03d.jpg" "$i"
      echo "Downloading $url -> $out"
      lynx -source "$url" > "$out"
      i=$((i+1))
    done
