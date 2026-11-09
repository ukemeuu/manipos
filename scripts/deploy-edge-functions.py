#!/usr/bin/env python3
"""Deploy Supabase edge functions via the Management API.

Usage:
    SUPABASE_ACCESS_TOKEN=... python3 scripts/deploy-edge-functions.py [fn ...]

Reads each function's source from supabase/functions/<name>/index.ts and
(de)registers it. Functions listed in PUBLIC_FUNCTIONS run with
verify_jwt = false so external callers (Daraja) can reach them.
"""

import json
import os
import ssl
import sys
import urllib.error
import urllib.request

try:  # Homebrew python ships without a CA bundle; certifi fills the gap.
    import certifi

    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()

PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", "ptaqejtyhdbhmhrhuxcj")
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
API = "https://api.supabase.com/v1"

FUNCTIONS = ["mpesa-stk", "mpesa-callback", "mpesa-query"]
PUBLIC_FUNCTIONS = {"mpesa-callback"}


def request(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60, context=SSL_CONTEXT) as res:
            body = res.read().decode()
            return res.status, (json.loads(body) if body else None)
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode()


def deploy(name):
    src_path = os.path.join("supabase", "functions", name, "index.ts")
    with open(src_path, encoding="utf-8") as fh:
        source = fh.read()

    # Remove any previous (possibly broken) registration first.
    status, _ = request("DELETE", f"/projects/{PROJECT_REF}/functions/{name}")
    print(f"  {name}: delete -> {status}")

    status, body = request(
        "POST",
        f"/projects/{PROJECT_REF}/functions",
        {
            "name": name,
            "slug": name,
            "body": source,
            "verify_jwt": name not in PUBLIC_FUNCTIONS,
        },
    )
    ok = status in (200, 201)
    detail = body if isinstance(body, str) else json.dumps(body)
    print(f"  {name}: create -> {status} {detail[:160] if not ok else 'OK'}")
    return ok


def main():
    if not TOKEN:
        sys.exit("SUPABASE_ACCESS_TOKEN is not set")

    targets = sys.argv[1:] or FUNCTIONS
    print(f"Deploying to {PROJECT_REF}: {', '.join(targets)}")
    results = {name: deploy(name) for name in targets}
    failed = [n for n, ok in results.items() if not ok]
    if failed:
        sys.exit(f"FAILED: {', '.join(failed)}")
    print("All functions deployed.")


if __name__ == "__main__":
    main()
