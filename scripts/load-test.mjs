#!/usr/bin/env node
/**
 * Minimal load test for ManiPOS surfaces.
 *
 * Keeps dependencies out of the repo: Node's own fetch plus a hand-rolled
 * worker pool. Prints throughput, latency percentiles and the error rate.
 *
 *   node scripts/load-test.mjs --url https://manipos.com/staging/ -c 10 -n 100
 *   node scripts/load-test.mjs --scenario read-api -c 10 -n 100
 *
 * Scenarios only ever READ. Nothing here creates orders or writes rows, so it
 * is safe to point at production.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ptaqejtyhdbhmhrhuxcj.supabase.co';
const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_r8PHCMuMpU_1dybpfrz7Kw_5-9qID7g';

const args = process.argv.slice(2);
const flag = (...names) => {
  for (const name of names) {
    for (const prefix of ['--', '-']) {
      const i = args.indexOf(`${prefix}${name}`);
      if (i >= 0) return args[i + 1];
    }
  }
  return undefined;
};

const scenario = flag('scenario') || (flag('url') ? 'custom' : 'staging-page');
const concurrency = Number(flag('c', 'concurrency') || 10);
const total = Number(flag('n', 'requests') || 100);

const SCENARIOS = {
  'staging-page': {
    name: 'staging landing page',
    url: 'https://manipos.com/staging/',
    init: {},
  },
  'production-page': {
    name: 'production landing page',
    url: 'https://manipos.com/',
    init: {},
  },
  'microsite-page': {
    name: 'tenant microsite',
    url: 'https://potofjollof.manipos.com/',
    init: {},
  },
  'read-api': {
    name: 'REST read (public menu)',
    url: `${SUPABASE_URL}/rest/v1/pos_menu?select=id,name,price&limit=20`,
    init: { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } },
  },
  'settings-read': {
    name: 'REST read (restaurant settings)',
    url: `${SUPABASE_URL}/rest/v1/restaurant_settings?select=restaurant_id&limit=5`,
    init: { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } },
  },
  custom: {
    name: flag('url'),
    url: flag('url'),
    init: {},
  },
};

const target = SCENARIOS[scenario];
if (!target || !target.url) {
  console.error(`Unknown scenario "${scenario}". Choose: ${Object.keys(SCENARIOS).join(', ')}`);
  process.exit(1);
}

const samples = [];
let errors = 0;
let inFlight = 0;
let issued = 0;
let stopped = false;

async function one() {
  const started = performance.now();
  inFlight += 1;
  try {
    const res = await fetch(target.url, { ...target.init, redirect: 'follow' });
    // Drain the body so the measurement includes transfer time.
    await res.text();
    if (!res.ok) errors += 1;
  } catch {
    errors += 1;
  } finally {
    inFlight -= 1;
    samples.push(performance.now() - started);
  }
}

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function worker() {
  while (!stopped && issued < total) {
    issued += 1;
    await one();
  }
}

const startedAt = performance.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const elapsed = (performance.now() - startedAt) / 1000;

const sorted = samples.slice().sort((a, b) => a - b);
const rps = samples.length / elapsed;

console.log(`\n${target.name}`);
console.log(`  ${samples.length} requests, ${concurrency} concurrent, ${elapsed.toFixed(2)}s`);
console.log(`  throughput  ${rps.toFixed(1)} req/s`);
console.log(`  latency     p50 ${percentile(sorted, 50).toFixed(0)}ms · ` +
  `p95 ${percentile(sorted, 95).toFixed(0)}ms · ` +
  `p99 ${percentile(sorted, 99).toFixed(0)}ms · max ${sorted[sorted.length - 1].toFixed(0)}ms`);
console.log(`  errors      ${errors} (${((errors / samples.length) * 100).toFixed(1)}%)\n`);

process.exitCode = errors / samples.length > 0.01 ? 1 : 0;
