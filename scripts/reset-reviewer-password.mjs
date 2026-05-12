#!/usr/bin/env node
// Reset the Supabase auth password for reviewer@gethaloframe.com to a
// freshly-generated random value, then persist that value to
// .env.codemagic.local so the asc-build-status.mjs `set-app-beta-info`
// subcommand can pick it up.
//
// Why this exists:
//   The reviewer account was first seeded by scripts/seed-reviewer-account.mjs
//   on 2026-04-25 with a password chosen at that time. If the canonical
//   1Password copy of that password drifts (or was never recorded), the
//   demo account in App Store Connect's BetaAppReviewDetail will fail
//   Apple's login probe and reject the beta-review submission. Resetting
//   sidesteps the drift entirely.
//
// What it does:
//   1. Looks up the reviewer auth user by email via the Supabase admin API.
//   2. Generates a 24-char URL-safe random password.
//   3. PATCHes the user via supa.auth.admin.updateUserById.
//   4. Writes REVIEWER_PASSWORD=... into .env.codemagic.local (gitignored),
//      preserving every other line in that file.
//   5. Tells you to copy that single line into 1Password as the new
//      canonical record. Does NOT echo the password to stdout — the
//      conversation transcript stays clean.
//
// Usage:
//   node scripts/reset-reviewer-password.mjs
//
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env (repo root).

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const REVIEWER_EMAIL = 'reviewer@gethaloframe.com';
const CODEMAGIC_ENV_PATH = resolve(REPO_ROOT, '.env.codemagic.local');

// ---- .env loader (matches scripts/topup-user.mjs convention) ------------
function loadDotenv() {
  const text = readFileSync(resolve(REPO_ROOT, '.env'), 'utf8');
  const out = Object.fromEntries(
    text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
      }),
  );
  for (const v of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!out[v]) throw new Error(`missing ${v} in .env`);
  }
  return out;
}

// ---- Upsert a single key into a dotenv-style file -----------------------
function upsertEnvLine(filePath, key, value) {
  let lines = [];
  if (existsSync(filePath)) {
    lines = readFileSync(filePath, 'utf8').split('\n');
  }
  let replaced = false;
  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      replaced = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!replaced) {
    if (next.length > 0 && next[next.length - 1] !== '') next.push('');
    next.push(`${key}=${value}`);
    next.push('');
  }
  writeFileSync(filePath, next.join('\n'));
  return replaced ? 'updated' : 'added';
}

// ---- Main ---------------------------------------------------------------
const env = loadDotenv();
const supa = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1. Look up the reviewer.
console.log(`Looking up auth user for ${REVIEWER_EMAIL}...`);
const { data, error: listErr } = await supa.auth.admin.listUsers({ perPage: 200 });
if (listErr) throw listErr;
const reviewer = data?.users.find((u) => u.email === REVIEWER_EMAIL);
if (!reviewer) {
  console.error(`No auth user with email ${REVIEWER_EMAIL}.`);
  console.error('Run scripts/seed-reviewer-account.mjs first.');
  process.exit(1);
}
console.log(`  ✓ user id: ${reviewer.id}`);

// 2. Generate a 24-char URL-safe random password. base64url alphabet is
//    [A-Za-z0-9_-], all keyboard-safe and accepted by ASC's demo-account
//    password field.
const newPassword = randomBytes(18).toString('base64url');

// 3. Reset.
console.log('Updating password via Supabase admin API...');
const { error: updErr } = await supa.auth.admin.updateUserById(reviewer.id, {
  password: newPassword,
});
if (updErr) {
  console.error('Supabase update failed:', updErr.message);
  process.exit(1);
}
console.log('  ✓ password updated on Supabase auth');

// 4. Persist to .env.codemagic.local.
const action = upsertEnvLine(CODEMAGIC_ENV_PATH, 'REVIEWER_PASSWORD', newPassword);
console.log(`  ✓ REVIEWER_PASSWORD ${action} in .env.codemagic.local`);

// 5. Instruction (deliberately doesn't echo the password).
console.log('');
console.log('Next steps:');
console.log(`  1. Open .env.codemagic.local and copy the REVIEWER_PASSWORD line`);
console.log(`     into 1Password as the new canonical record for`);
console.log(`     "haloFrame → ${REVIEWER_EMAIL}".`);
console.log('  2. Run: node scripts/asc-build-status.mjs set-app-beta-info');
console.log('  3. Then submit-external when ready.');
