#!/usr/bin/env python3
"""Forward ManiPOS bug reports from Supabase to Telegram.

The browser posts unhandled errors to public.error_logs (see
supabase/migrations/20261108_error_logs.sql). This script reads rows that have
not been forwarded yet, groups identical errors, sends one Telegram message per
group, and marks the rows as forwarded.

Run it on a schedule (GitHub Actions cron) or by hand.

Requests go through `curl` so the script behaves the same on a laptop and on
GitHub Actions runners.

Environment:
    SUPABASE_URL          (optional) default the ManiPOS project
    SUPABASE_SERVICE_KEY  (required) service role key — bypasses RLS
    TELEGRAM_BOT_TOKEN    (required)
    TELEGRAM_CHAT_ID      (required)
    ERROR_BATCH_LIMIT     (optional) max rows to process, default 50
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone

SUPABASE_URL = os.environ.get(
    "SUPABASE_URL", "https://ptaqejtyhdbhmhrhuxcj.supabase.co"
)
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
BATCH_LIMIT = int(os.environ.get("ERROR_BATCH_LIMIT", "50"))


def curl(method: str, url: str, payload: dict | None = None, timeout: int = 25):
    """Run a curl request and return (http_status, parsed_body_or_text)."""
    command = [
        "curl", "-sS", "-X", method, url,
        "-H", f"apikey: {SERVICE_KEY}",
        "-H", f"Authorization: Bearer {SERVICE_KEY}",
        "-H", "Content-Type: application/json",
        "-w", "\n%{http_code}",
        "--max-time", str(timeout),
    ]
    if payload is not None:
        command += ["-d", json.dumps(payload)]

    completed = subprocess.run(
        command, capture_output=True, text=True, timeout=timeout + 10
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or f"curl exited {completed.returncode}")

    output = completed.stdout
    body, _, status = output.rpartition("\n")
    try:
        parsed = json.loads(body) if body.strip() else None
    except json.JSONDecodeError:
        parsed = body
    return status.strip(), parsed


def fetch_pending() -> list[dict]:
    try:
        status, body = curl(
            "GET",
            f"{SUPABASE_URL}/rest/v1/error_logs"
            "?select=id,created_at,error_message,error_stack,page,url,"
            "tenant_slug,staff_name,user_agent"
            f"&forwarded_at=is.null&order=created_at.asc&limit={BATCH_LIMIT}",
        )
    except RuntimeError as exc:
        raise SystemExit(f"Supabase request failed: {exc}")

    # The migration may not have been applied yet — stay quiet rather than
    # failing every scheduled run.
    if status == "404":
        print("error_logs table not found — run supabase/migrations/20261108_error_logs.sql")
        return []
    if status != "200":
        raise SystemExit(f"Supabase request failed ({status}): {body}")
    return body if isinstance(body, list) else []


def group_rows(rows: list[dict]) -> list[dict]:
    """Collapse identical (message, page) pairs into a single alert."""
    groups: dict[tuple[str, str], dict] = {}
    for row in rows:
        key = (row.get("error_message") or "Unknown error", row.get("page") or "/")
        group = groups.get(key)
        if group is None:
            group = {
                "message": key[0],
                "page": key[1],
                "count": 0,
                "ids": [],
                "first_seen": row.get("created_at"),
                "last_seen": row.get("created_at"),
                "stack": row.get("error_stack") or "",
                "tenant": row.get("tenant_slug") or "",
                "staff": row.get("staff_name") or "",
                "user_agent": row.get("user_agent") or "",
            }
            groups[key] = group
        else:
            group["count"] += 1
        group["ids"].append(row["id"])
    return list(groups.values())


def format_message(group: dict) -> str:
    lines = [
        "🐛 <b>ManiPOS bug report</b>",
        "",
        f"<b>{group['message'][:300]}</b>",
        "",
        f"Page: {group['page']}",
        f"Occurrences: {group['count']}",
    ]
    if group["tenant"]:
        lines.append(f"Restaurant: {group['tenant']}")
    if group["staff"]:
        lines.append(f"Staff: {group['staff']}")
    lines.append(f"Last seen: {group['last_seen']}")
    return "\n".join(lines)[:4000]


def send_alert(text: str) -> bool:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat = os.environ.get("TELEGRAM_CHAT_ID")
    try:
        completed = subprocess.run(
            [
                "curl", "-sS", "-X", "POST",
                f"https://api.telegram.org/bot{token}/sendMessage",
                "-H", "Content-Type: application/json",
                "-d", json.dumps(
                    {
                        "chat_id": chat,
                        "text": text,
                        "parse_mode": "HTML",
                        "disable_web_page_preview": True,
                    }
                ),
                "--max-time", "20",
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        body = json.loads(completed.stdout or "{}")
    except Exception as exc:  # noqa: BLE001
        print(f"warning: telegram send failed: {exc}", file=sys.stderr)
        return False

    if not body.get("ok"):
        print(f"warning: telegram rejected message: {body}", file=sys.stderr)
        return False
    return True


def mark_forwarded(ids: list[int]) -> None:
    id_list = ",".join(str(i) for i in ids)
    status, body = curl(
        "PATCH",
        f"{SUPABASE_URL}/rest/v1/error_logs?id=in.({id_list})",
        payload={
            "forwarded_at": datetime.now(timezone.utc).isoformat(),
            "forwarded_count": 1,
        },
    )
    if status not in ("200", "204"):
        raise SystemExit(f"could not mark rows forwarded ({status}): {body}")


def main() -> int:
    if not SERVICE_KEY:
        print("error: SUPABASE_SERVICE_KEY is required", file=sys.stderr)
        return 2

    rows = fetch_pending()
    if not rows:
        print("No pending bug reports.")
        return 0

    groups = group_rows(rows)
    print(f"Forwarding {len(rows)} report(s) in {len(groups)} group(s)...")

    forwarded_ids: list[int] = []
    for group in groups:
        if send_alert(format_message(group)):
            forwarded_ids.extend(group["ids"])

    if forwarded_ids:
        mark_forwarded(forwarded_ids)
        print(f"Marked {len(forwarded_ids)} row(s) as forwarded.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
