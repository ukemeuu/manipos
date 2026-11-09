# Backups and restore

ManiPOS runs on Supabase **Pro** (project `ptaqejtyhdbhmhrhuxcj`, `eu-west-1`).

## What already exists

| Layer | Detail | Verified |
|---|---|---|
| Supabase daily backups | Physical backups, 7-day retention, WAL-G enabled | Yes — daily `COMPLETED` entries in `GET /v1/projects/{ref}/database/backups` |
| Point-in-time recovery | **Off** (paid add-on) | Yes — `pitr_enabled: false` |
| Off-site logical dump | Weekly `pg_dump` via `.github/workflows/backup.yml` | Runs Mondays 02:00 UTC; 90-day artifact retention |
| Local staging copy | `https://manipos.com/staging/` | Shares the same database, so **it is not a backup** |

RPO with daily backups only: up to 24 hours. If that is not good enough, enable
PITR (Dashboard → Database → Backups → Point in time) or shorten the dump
cadence.

## One-time setup

The weekly dump needs the direct connection string as a repository secret:

```bash
# Dashboard → Project Settings → Database → Connection string → URI
# Copy it, swap [YOUR-PASSWORD] for the database password.
gh secret set SUPABASE_DB_URL --body 'postgresql://postgres.<ref>:<password>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres'
```

Then trigger it once from **Actions → Backup → Run workflow** and confirm the
artifact appears.

> The database password is not viewable after project creation. If it is lost,
> reset it in Project Settings → Database → Reset database password. Nothing in
> the app uses it — the app talks to Supabase through API keys — so resetting it
> only affects direct `psql` clients.

## Restore drill (do this quarterly)

Goal: prove that a backup can actually be brought back, not just that one exists.

### A. From our weekly dump (fast, no dashboard needed)

```bash
# 1. Download the artifact from the Actions run, then:
pg_restore --list manipos-YYYYMMDDTHHMMSSZ.dump | head   # sanity: tables are present

# 2. Restore into a scratch database (never into production)
createdb manipos_drill
pg_restore --no-owner --no-privileges --dbname manipos_drill manipos-*.dump

# 3. Compare row counts on the tables that matter
psql manipos_drill -c "select 'pos_orders' t, count(*) from pos_orders
  union all select 'restaurant_settings', count(*) from restaurant_settings
  union all select 'mpesa_transactions', count(*) from mpesa_transactions;"
```

Expected: the counts match the same query against production (allowing for rows
written since the dump).

### B. From Supabase's own backups (disaster recovery)

1. Dashboard → Database → Backups → **Restore to new project** (BETA).
2. Pick the most recent backup and a new project name.
3. Wait for provisioning, then check `pos_orders` in the new project.
4. Point the app at the restored project only if production is unusable.
5. Delete the temporary project once verified — it bills like any other project.

This is the path that matters if the database itself is damaged. It is BETA, so
test it *before* you need it.

## What a restore must contain

Check these after any restore:

- `pos_orders` — the order history the business is paid for
- `restaurant_settings` — branding, receipt details, paybill
- `staff` / auth users — who can log in
- `mpesa_transactions` — the M-Pesa ledger used for reconciliation
- `error_logs` — recent incidents
- Storage buckets — printed receipts and menu images live in Storage, **not** in
  the database dump; check them separately

## During an incident

1. Stop writes if data is being corrupted (put the site in maintenance mode).
2. Note the exact time the problem started — that decides which backup to use.
3. Restore to a **new** project first; never overwrite production until the
   restored data has been checked.
4. Swap `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` and redeploy, or update
   the edge function secrets if you restore in place.
5. Announce to staff what was lost, if anything.
