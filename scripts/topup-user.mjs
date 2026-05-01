// Dev/test utility: look up a profile by user id, print its current
// credit/flow state, and optionally top up credits + reset the free-tier
// flow flags so the user can exercise the merge endpoint without a
// paywall blocking the real code path.
//
// Usage:
//   node scripts/topup-user.mjs <userId> [creditsToAdd]
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env at repo root.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const envText = await readFile(path.join(repoRoot, '.env'), 'utf8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx), line.slice(idx + 1).replace(/^"|"$/g, '')];
    }),
);

const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const userId = process.argv[2];
const creditsToAdd = Number(process.argv[3] ?? 10);
if (!userId) {
  console.error('usage: node scripts/topup-user.mjs <userId> [creditsToAdd=10]');
  process.exit(1);
}

async function api(method, path, body) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const resp = await fetch(url, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`${method} ${path} → ${resp.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

const profileRows = await api(
  'GET',
  `profiles?id=eq.${userId}&select=id,plan_id,credits_remaining,credits_rollover,topup_credits_remaining,topup_expires_at,renews_on`,
);

if (!profileRows || profileRows.length === 0) {
  console.error(`no profile row for userId=${userId}`);
  process.exit(2);
}

const before = profileRows[0];
console.log('BEFORE:', JSON.stringify(before, null, 2));

// Top-up credits do not expire (Apple 3.1.1). Mirrors prod webhook behavior.
const patch = {
  topup_credits_remaining: (before.topup_credits_remaining ?? 0) + creditsToAdd,
  topup_expires_at: null,
};

// enhance_used / merge_used columns come from a migration that may or may
// not have been applied yet. Attempt the reset but swallow the error if
// the columns are missing — credits alone are enough on paid-tier paths,
// and free-tier flag check in entitlements.ts falls back gracefully.
try {
  const patchWithFlags = { ...patch, enhance_used: false, merge_used: false };
  const updated = await api('PATCH', `profiles?id=eq.${userId}`, patchWithFlags);
  console.log('AFTER :', JSON.stringify(updated?.[0] ?? updated, null, 2));
  console.log(`\n✓ topped up ${creditsToAdd} credits and reset enhance_used + merge_used`);
} catch (err) {
  const msg = String(err?.message ?? '');
  if (!msg.includes('does not exist') && !msg.includes('Could not find')) throw err;
  console.warn('(flags columns missing — skipping flag reset)');
  const updated = await api('PATCH', `profiles?id=eq.${userId}`, patch);
  console.log('AFTER :', JSON.stringify(updated?.[0] ?? updated, null, 2));
  console.log(`\n✓ topped up ${creditsToAdd} credits (flag columns unavailable)`);
}
