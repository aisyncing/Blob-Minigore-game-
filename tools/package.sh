#!/usr/bin/env bash
# Writes blob-minigore-v2.zip: the source, plus the built standalone pages in dist/ so the game can be opened by double-click.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f dist/hero.html ] && [ -f dist/index.html ] || { echo "dist/ is missing: run 'npm run build' first" >&2; exit 1; }
rm -f blob-minigore-v2.zip
zip -rq blob-minigore-v2.zip . -x 'node_modules/*' '.git/*' '*__pycache__*' '*.pyc' 'blob-*.zip' 'blob-shooter-hero.html' 'blob-shooter-lab.html'
echo "wrote blob-minigore-v2.zip ($(du -h blob-minigore-v2.zip | cut -f1))"
