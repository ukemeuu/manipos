#!/usr/bin/env bash
# Deploy the ManiPOS production build to Hostinger over FTP.
#
# Prerequisites:
#   - npm dependencies installed (npm install)
#   - FTP_* credentials in .env (see .env.example)
#
# Usage:
#   npm run build && bash scripts/deploy-hostinger.sh
#
# After uploading, flush the hCDN cache:
#   hPanel → Performance → CDN → Flush cache (for each domain).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

set -a
# shellcheck disable=SC1091
source .env
set +a

FTP_HOST="${FTP_HOST:?FTP_HOST not set in .env}"
FTP_USER="${FTP_USER:?FTP_USER not set in .env}"
FTP_PASS="${FTP_PASS:?FTP_PASS not set in .env}"
FTP_PORT="${FTP_PORT:-21}"
FTP_REMOTE_DIR="${FTP_REMOTE_DIR:-/}"

echo "Building production bundle..."
npm run build

echo "Uploading dist/ to ${FTP_USER}@${FTP_HOST} ..."
cd dist
find . -type f | sort | while read -r file; do
  remote="${file#./}"
  encoded="$(python3 -c 'import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))' "$remote")"
  printf '  %s\n' "$remote"
  curl -sS --ftp-create-dirs --connect-timeout 30 \
    -T "$file" \
    --user "${FTP_USER}:${FTP_PASS}" \
    "ftp://${FTP_HOST}:${FTP_PORT}${FTP_REMOTE_DIR}${encoded}"
done

echo
echo "Upload complete."
echo "Next: flush the hCDN cache in hPanel (Performance → CDN → Flush cache) for each domain."
