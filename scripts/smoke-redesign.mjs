#!/usr/bin/env node
// =============================================================================
// haloFrame — redesign smoke test
//
// Verifies the logic layer (auth bootstrap, credit ledger, 402 path, /purchase
// stub) against a live dev API. No fal.ai calls — the 402 test uses a zeroed-
// out balance to trigger insufficient_credits BEFORE the fal round-trip, so
// the test costs nothing.
//
// Usage:
//   1. Ensure `npm run dev:api` is running on :4000 in full mode (non-SPIKE
//      works too — subscription router mounts whenever Supabase is configured).
//   2. node scripts/smoke-redesign.mjs
//
// The script provisions a throwaway anonymous user, runs four assertions,
// then deletes the user before exiting. Exit code 0 = green, 1 = red.
// =============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');
const envRaw = readFileSync(envPath, 'utf8');
const env = Object.fromEntries(
  envRaw
    .split('\n')
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    }),
);

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = `http://localhost:${env.API_PORT || 4000}`;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[smoke] .env missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const checks = [];
function check(name, condition, detail = '') {
  const status = condition ? 'PASS' : 'FAIL';
  checks.push({ name, status, detail });
  const icon = condition ? '✓' : '✗';
  const color = condition ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${icon}\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
}

async function signInAnonymously() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'content-type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`anon signup failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  return { jwt: json.access_token, userId: json.user.id };
}

async function setCreditsTo(userId, credits) {
  // Service-role call → direct REST PATCH bypassing RLS.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify({ credits_remaining: credits }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`patch profile failed: ${res.status} ${body.slice(0, 200)}`);
  }
}

async function deleteAuthUser(userId) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  // 200 or 404 both mean "gone"; don't throw on 404.
  if (!res.ok && res.status !== 404) {
    console.warn(`[smoke] cleanup failed for ${userId}: ${res.status}`);
  }
}

async function apiGet(path, jwt) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${jwt}` },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function apiPost(path, jwt, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${jwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function apiDelete(path, jwt) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${jwt}` },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function main() {
  // 0. API reachable
  try {
    const health = await fetch(`${API_BASE}/health`).then((r) => r.json());
    check('API /health reachable', health?.ok === true, `service=${health?.service}`);
  } catch (err) {
    check('API /health reachable', false, `dev server not running? ${err.message}`);
    console.error('\n[smoke] API not reachable — start `npm run dev:api` and retry.');
    process.exit(1);
  }

  let userId, jwt;
  try {
    // 1. Anonymous signup grants 2 credits
    ({ userId, jwt } = await signInAnonymously());
    const status1 = await apiGet('/api/subscription/status', jwt);
    check(
      'anon signup → 2-credit grant via trigger',
      status1.status === 200 &&
        status1.body?.data?.planId === 'free' &&
        status1.body?.data?.creditsRemaining === 2 &&
        status1.body?.data?.renewsOn === null,
      `status=${status1.status} balance=${status1.body?.data?.creditsRemaining}`,
    );

    // 2. Purchase stub returns 501 web_checkout_not_configured
    const purchase = await apiPost('/api/subscription/purchase', jwt, {
      planId: 'keepsake_monthly',
      platform: 'web',
    });
    check(
      'POST /purchase (web) returns 501 web_checkout_not_configured',
      purchase.status === 501 &&
        purchase.body?.error?.details?.code === 'web_checkout_not_configured',
      `status=${purchase.status} code=${purchase.body?.error?.details?.code}`,
    );

    // 3. Zero out credits, expect 402 insufficient_credits on save
    await setCreditsTo(userId, 0);
    const status2 = await apiGet('/api/subscription/status', jwt);
    check(
      'status reflects drained balance',
      status2.status === 200 && status2.body?.data?.creditsRemaining === 0,
      `balance=${status2.body?.data?.creditsRemaining}`,
    );

    const deny = await apiPost('/api/spike/apply', jwt, {
      imageUrl: 'https://example.com/x.png',
      templateIds: ['heavens_light'],
      resolution: 'final',
      saveId: 'smoke-redesign-deny',
      isPet: false,
      intensity: 'medium',
    });
    check(
      'POST /api/spike/apply final → 402 insufficient_credits',
      deny.status === 402 && deny.body?.error?.code === 'insufficient_credits',
      `status=${deny.status} code=${deny.body?.error?.code}`,
    );

    // 4. /api/tribute bridge — save-spike-result + list + delete round-trip.
    // finalImageUrl is a public stock image; rehost may or may not succeed
    // depending on whether the dev host has outbound internet — either way
    // the tribute row must be inserted and reachable via GET /.
    const saveRes = await apiPost('/api/tribute/save-spike-result', jwt, {
      flowType: 'enhance',
      isPet: false,
      templateIds: ['halo_and_wings'],
      intensity: 'medium',
      finalImageUrl: 'https://placehold.co/1024x1024/FAF3E2/4A3D2F.png',
      saveId: `smoke-${Date.now()}`,
    });
    const bridgeId = saveRes.body?.data?.tribute?.id;
    check(
      'POST /api/tribute/save-spike-result → 201 with tribute id',
      saveRes.status === 201 && typeof bridgeId === 'string' && bridgeId.length > 0,
      `status=${saveRes.status} id=${bridgeId ?? 'missing'}`,
    );

    const list = await apiGet('/api/tribute/', jwt);
    check(
      'GET /api/tribute/ lists the new tribute',
      list.status === 200 &&
        Array.isArray(list.body?.data?.tributes) &&
        list.body.data.tributes.some((t) => t.id === bridgeId),
      `count=${list.body?.data?.tributes?.length ?? '?'}`,
    );

    if (bridgeId) {
      const del = await apiDelete(`/api/tribute/${bridgeId}`, jwt);
      check(
        'DELETE /api/tribute/:id removes the tribute',
        del.status === 200 && del.body?.data?.deleted === true,
        `status=${del.status} deleted=${del.body?.data?.deleted}`,
      );

      const reList = await apiGet('/api/tribute/', jwt);
      check(
        'GET /api/tribute/ after delete → tribute gone',
        reList.status === 200 &&
          Array.isArray(reList.body?.data?.tributes) &&
          !reList.body.data.tributes.some((t) => t.id === bridgeId),
        `count=${reList.body?.data?.tributes?.length ?? '?'}`,
      );
    }
  } finally {
    if (userId) await deleteAuthUser(userId);
  }

  const failures = checks.filter((c) => c.status === 'FAIL');
  console.log('\n' + '-'.repeat(60));
  console.log(
    `${checks.length} checks, ${failures.length} failure${failures.length === 1 ? '' : 's'}`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[smoke] unexpected error:', err);
  process.exit(1);
});
