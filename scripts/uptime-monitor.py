#!/usr/bin/env python3
"""ManiPOS uptime monitor.

Checks every public surface — the marketing site, the POS terminal, each tenant
microsite and the Supabase REST API — and sends a Telegram alert only when a
surface *changes* state. A long outage therefore produces one "down" alert plus
an occasional reminder instead of hundreds of messages.

State lives in a JSON file. Locally that is .uptime-state.json; in GitHub
Actions the file is restored from and saved to the actions cache so state
survives between scheduled runs.

Requests go through `curl` rather than urllib so the monitor behaves the same
on a laptop (where a proxy may replace the TLS chain) and on GitHub Actions.

Usage:
    TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... python3 scripts/uptime-monitor.py

Environment:
    TELEGRAM_BOT_TOKEN     (required) bot token from @BotFather
    TELEGRAM_CHAT_ID       (required) chat to send alerts to
    UPTIME_STATE_FILE      (optional) default .uptime-state.json
    UPTIME_REMIND_MINUTES  (optional) minutes between reminders, default 60
    SUPABASE_URL           (optional) default the ManiPOS project
    SUPABASE_ANON_KEY      (optional) used for the Supabase health check
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
SUPABASE_ANON_KEY = os.environ.get(
    "SUPABASE_ANON_KEY", "sb_publishable_r8PHCMuMpU_1dybpfrz7Kw_5-9qID7g"
)

SITES = [
    {"name": "ManiPOS website", "url": "https://manipos.com"},
    {"name": "POS terminal", "url": "https://pos.manipos.com"},
    {"name": "Pot of Jollof microsite", "url": "https://potofjollof.manipos.com"},
    {"name": "Chop Now Now microsite", "url": "https://chopnownow.manipos.com"},
    {
        "name": "Supabase API",
        "url": f"{SUPABASE_URL}/rest/v1/restaurants?select=id&limit=1",
        "headers": {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        },
    },
]


def now() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now().strftime("%Y-%m-%d %H:%M UTC")


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("UTC", "+00:00"))
    except ValueError:
        return None


def load_state(path: str) -> dict:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict) and isinstance(data.get("sites"), dict):
            return data
        print("warning: state file has an unexpected shape", file=sys.stderr)
    except FileNotFoundError:
        pass
    except Exception as exc:  # noqa: BLE001 - state is best-effort
        print(f"warning: could not read state file: {exc}", file=sys.stderr)
    return {"sites": {}}


def save_state(path: str, state: dict) -> None:
    state["updated_at"] = now_iso()
    try:
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2, sort_keys=True)
            handle.write("\n")
    except Exception as exc:  # noqa: BLE001 - state is best-effort
        print(f"warning: could not write state file: {exc}", file=sys.stderr)


def curl_json(url: str, payload: dict, timeout: int = 20) -> dict:
    """POST JSON and return the parsed response body."""
    completed = subprocess.run(
        [
            "curl", "-sS", "-X", "POST", url,
            "-H", "Content-Type: application/json",
            "-d", json.dumps(payload),
            "--max-time", str(timeout),
        ],
        capture_output=True,
        text=True,
        timeout=timeout + 10,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or f"curl exited {completed.returncode}")
    return json.loads(completed.stdout or "{}")


def check_site(site: dict) -> tuple[bool, object]:
    command = [
        "curl", "-sS", "-o", "/dev/null", "-w", "%{http_code}",
        "--max-time", "25", "-L",
        "-H", "User-Agent: ManiPOS-Uptime/1.0",
    ]
    for key, value in site.get("headers", {}).items():
        command += ["-H", f"{key}: {value}"]
    command.append(site["url"])

    try:
        completed = subprocess.run(
            command, capture_output=True, text=True, timeout=40
        )
    except Exception as exc:  # noqa: BLE001 - any failure counts as down
        return False, type(exc).__name__

    if completed.returncode != 0:
        return False, f"curl-{completed.returncode}"

    raw = completed.stdout.strip()
    try:
        status = int(raw)
    except ValueError:
        return False, raw or "no-response"
    return 200 <= status < 400, status


def send_alert(text: str) -> bool:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat = os.environ.get("TELEGRAM_CHAT_ID")
    try:
        body = curl_json(
            f"https://api.telegram.org/bot{token}/sendMessage",
            {
                "chat_id": chat,
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
        )
    except Exception as exc:  # noqa: BLE001 - alerting must not crash the run
        print(f"warning: telegram send failed: {exc}", file=sys.stderr)
        return False

    if not body.get("ok"):
        print(f"warning: telegram rejected message: {body}", file=sys.stderr)
        return False
    return True


def downtime_text(name: str, url: str, status: object, reminder: bool) -> str:
    first_line = (
        "🟠 <b>ManiPOS still down</b>" if reminder else "🔴 <b>ManiPOS downtime</b>"
    )
    return (
        f"{first_line}\n"
        f"<b>{name}</b> is unreachable.\n"
        f"URL: {url}\n"
        f"Status: {status}\n"
        f"Detected: {now_iso()}"
    )


def recovery_text(name: str, url: str) -> str:
    return (
        "✅ <b>ManiPOS recovered</b>\n"
        f"<b>{name}</b> is back online.\n"
        f"{url}\n"
        f"Recovered: {now_iso()}"
    )


def main() -> int:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        print(
            "error: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required",
            file=sys.stderr,
        )
        return 2

    state_path = os.environ.get("UPTIME_STATE_FILE", ".uptime-state.json")
    remind_seconds = float(os.environ.get("UPTIME_REMIND_MINUTES", "60")) * 60
    state = load_state(state_path)
    sites = state["sites"]

    sent = 0
    for site in SITES:
        url = site["url"]
        up, status = check_site(site)
        entry = sites.get(url) or {"status": "unknown", "last_alert": None}
        previous = entry.get("status")

        if up and previous == "down":
            print(f"  ✓ {site['name']} recovered")
            sent += send_alert(recovery_text(site["name"], url))
            entry = {"status": "up", "last_alert": None}
        elif not up and previous != "down":
            print(f"  ✗ {site['name']} is DOWN ({status})")
            sent += send_alert(downtime_text(site["name"], url, status, reminder=False))
            entry = {"status": "down", "last_alert": now_iso()}
        elif not up and previous == "down":
            last = parse_iso(entry.get("last_alert"))
            elapsed = (now() - last).total_seconds() if last else None
            if elapsed is None or elapsed >= remind_seconds:
                print(f"  ! {site['name']} still down ({status})")
                sent += send_alert(downtime_text(site["name"], url, status, reminder=True))
                entry = {"status": "down", "last_alert": now_iso()}
        elif up:
            entry["status"] = "up"

        sites[url] = entry

    save_state(state_path, {"sites": sites})
    print(f"Checked {len(SITES)} surfaces, sent {sent} alert(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
