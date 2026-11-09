# Load testing

Baseline capacity check for the surfaces a customer or cashier actually
touches. The tool is dependency-free (`scripts/load-test.mjs`) and only issues
**reads**, so it is safe against production.

## Running it

```bash
node scripts/load-test.mjs --scenario production-page -c 20 -n 200
node scripts/load-test.mjs --scenario microsite-page  -c 20 -n 200
node scripts/load-test.mjs --scenario read-api        -c 20 -n 200
node scripts/load-test.mjs --url https://example.com  -c 10 -n 100   # any URL
```

`-c` is concurrency, `-n` is total requests. Exit code is non-zero when more
than 1% of requests fail, so it can gate a deploy if wanted.

## Baseline — 9 November 2026

Single client, run from Nairobi against live infrastructure.

| Surface | Concurrency | Throughput | p50 | p95 | p99 | Errors |
|---|---|---|---|---|---|---|
| Production landing page | 20 | 33.7 req/s | 505 ms | 763 ms | 837 ms | 0% |
| Staging landing page | 20 | 25.9 req/s | 599 ms | 1568 ms | 1610 ms | 0% |
| Tenant microsite | 10 | 16.4 req/s | 553 ms | 1056 ms | 1085 ms | 0% |
| REST read (public menu) | 20 | 29.7 req/s | 377 ms | 1479 ms | **6247 ms** | 0% |
| REST read (settings) | 10 | 27.8 req/s | 317 ms | 493 ms | 794 ms | 0% |

## Reading the numbers

- **No failures at any level tested.** The app stays up under 20 concurrent
  clients, which is far more than a restaurant needs.
- **Static pages are CDN-bound, not app-bound.** Production beats staging
  because its assets are cached at the edge; staging is fetched through the
  same origin with a different base path.
- **The REST p99 spike is the thing to watch.** At 20 concurrent readers a few
  requests took over 6 seconds. That is connection-pool saturation on Nano
  compute, not slow queries. It will get worse as more tenants are added.
- **Latency floor is geographic.** The database is in `eu-west-1` (Ireland), so
  every query pays a round trip from Kenya. A p50 of ~380 ms for a simple read
  is mostly distance.

## Capacity guidance

- A single restaurant (a few terminals + microsite) peaks in the low tens of
  requests per second. Current headroom is fine.
- **Before onboarding roughly ten active restaurants**, either move the compute
  off Nano or move the database region closer to the customers. Re-run the
  `read-api` scenario at `-c 50 -n 500` first to see where it breaks.
- Keep the microsite's checkout polling gentle — it should poll an order every
  few seconds, not every few hundred milliseconds.

## What a heavier test would need

This harness measures one client's view. A real capacity test needs load from
several regions and hundreds of connections, which a single laptop cannot
produce. If that becomes necessary, run k6 or Artillery from a cloud VM and
watch Supabase → Observability during the run.

## After any change

Re-run the table above and update it. A regression is usually a missing CDN
cache, an accidental `select *`, or a query that lost its index.
