#!/usr/bin/env bash
# Deploy the ManiPOS build to Hostinger over FTP.
#
# Targets:
#   production (default) -> public_html root        (https://manipos.com)
#   staging              -> public_html/staging     (https://staging.manipos.com)
#
# The staging target requires the `staging.manipos.com` subdomain to exist in
# hPanel and point at public_html/staging.
#
# Usage:
#   bash scripts/deploy-hostinger.sh                    # production
#   bash scripts/deploy-hostinger.sh --target staging
#   TARGET=staging bash scripts/deploy-hostinger.sh
#
# After uploading, flush the hCDN cache:
#   hPanel -> Performance -> CDN -> Flush cache (for each domain).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TARGET="${TARGET:-production}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="${2:-production}"; shift 2 ;;
    --staging) TARGET="staging"; shift ;;
    --production) TARGET="production"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

# Load local credentials when present (local deploys). CI passes them as env
# vars from repository secrets instead.
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

FTP_HOST="${FTP_HOST:?FTP_HOST not set}"
FTP_USER="${FTP_USER:?FTP_USER not set}"
FTP_PASS="${FTP_PASS:?FTP_PASS not set}"
FTP_PORT="${FTP_PORT:-21}"

case "$TARGET" in
  staging)
    FTP_REMOTE_DIR="${FTP_STAGING_REMOTE_DIR:-/staging/}"
    ;;
  production)
    FTP_REMOTE_DIR="${FTP_REMOTE_DIR:-/}"
    ;;
  *)
    echo "unknown target: ${TARGET} (expected staging or production)" >&2
    exit 1
    ;;
esac

echo "Target: ${TARGET} (${FTP_REMOTE_DIR})"

# Staging is served from /staging/, so asset URLs must be prefixed with it.
BASE="${BASE:-/}"
if [[ "$TARGET" == "staging" && "$BASE" == "/" ]]; then
  BASE="/staging/"
fi
echo "Base URL: ${BASE}"

# CI builds in a separate job and uploads the artifact; the deploy job only
# uploads. Set SKIP_BUILD=1 to reuse an existing dist/ (the repo ships a
# macOS node_modules, which cannot build on Linux runners).
if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  echo "Skipping build (using existing dist/)."
else
  echo "Building bundle..."
  npm run build -- --base "$BASE"
fi

echo "Uploading dist/ to ${FTP_USER}@${FTP_HOST} ..."
cd dist

# Each file gets its own FTP connection; transient drops are common on shared
# hosting, so retry a few times before giving up.
upload_with_retry() {
  local file="$1" remote="$2" attempt
  for attempt in 1 2 3 4; do
    if curl -sS --ftp-create-dirs --connect-timeout 30 --max-time 180 \
         -T "$file" \
         --user "${FTP_USER}:${FTP_PASS}" \
         "ftp://${FTP_HOST}:${FTP_PORT}${FTP_REMOTE_DIR}${remote}" 2>/dev/null; then
      return 0
    fi
    echo "  ! retry ${attempt} for ${remote}"
    sleep 3
  done
  return 1
}

find . -type f | sort | while read -r file; do
  remote="${file#./}"
  encoded="$(python3 -c 'import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))' "$remote")"
  printf '  %s\n' "$remote"
  upload_with_retry "$file" "$encoded"
done

echo
if [[ "$TARGET" == "staging" ]]; then
  echo "Upload complete: https://manipos.com/staging/"
else
  echo "Upload complete: https://manipos.com"
fi
echo "Next: flush the hCDN cache in hPanel (Performance -> CDN -> Flush cache)."
