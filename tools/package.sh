#!/usr/bin/env bash
# Writes blob-shooter.zip: the source, plus the built standalone pages in dist/ so the game can be opened by double-click.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f dist/hero.html ] && [ -f dist/index.html ] || { echo "dist/ is missing: run 'npm run build' first" >&2; exit 1; }
rm -f blob-shooter.zip
zip -rq blob-shooter.zip . -x 'node_modules/*' '.git/*' '*.png' '*__pycache__*' '*.pyc' 'blob-shooter*.zip' 'blob-shooter-hero.html' 'blob-shooter-lab.html' 'dist/game.html' 'dist/hero-artifact.html'
echo "wrote blob-shooter.zip ($(du -h blob-shooter.zip | cut -f1))"
