#!/usr/bin/env bash
# Send a Telegram message through the ManiPOS alert bot.
#
# Usage:
#   telegram-notify "message text"
#   telegram-notify "<b>bold</b> message" --html
#
# Credentials come from TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in the
# environment (or a local .env file, which this script will source).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/.env"
fi

TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT="${TELEGRAM_CHAT_ID:-}"
MESSAGE="${1:-}"
PARSE_MODE="HTML"

if [[ "${2:-}" == "--plain" ]]; then
  PARSE_MODE=""
fi

if [[ -z "$TOKEN" || -z "$CHAT" ]]; then
  echo "error: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set" >&2
  exit 1
fi

if [[ -z "$MESSAGE" ]]; then
  echo "usage: telegram-notify \"message\"" >&2
  exit 1
fi

PAYLOAD="$(MESSAGE="$MESSAGE" CHAT="$CHAT" PARSE_MODE="$PARSE_MODE" python3 -c '
import json, os
payload = {"chat_id": os.environ["CHAT"], "text": os.environ["MESSAGE"]}
if os.environ.get("PARSE_MODE"):
    payload["parse_mode"] = os.environ["PARSE_MODE"]
payload["disable_web_page_preview"] = True
print(json.dumps(payload))
')"

curl -sS -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
echo
