#!/usr/bin/env node
// Idempotent reviewer-account seeder for App Review.
//
// Creates `reviewer@gethaloframe.com` with 20 top-up credits + 4 sample
// portrait photos in storage. Used to populate App Store Connect
// "App Review Information → Sign-In" + Play Console "Reviewer credentials".
//
// Idempotency: re-running keeps the same user, resets credits to the
// target value (UPDATE not INCREMENT), and upserts the same photos by
// stable storage path. Safe to re-run any time.
//
// Usage:
//   node scripts/seed-reviewer-account.mjs
//
// Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REVIEWER_PASSWORD from
// .env at repo root (matches scripts/topup-user.mjs convention).
//
// Fixtures: 4 portrait JPEGs at scripts/fixtures/reviewer-photos/0{1..4}.jpg.
// Auto-generated as solid-color placeholders if missing — drop in real
// portraits to override.

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const FIXTURES_DIR = resolve(HERE, 'fixtures/reviewer-photos');

const REVIEWER_EMAIL = 'reviewer@gethaloframe.com';
const REVIEWER_CREDITS = 20;
// Top-up credits never expire (Apple Guideline 3.1.1: "Any credits or
// in-game currencies purchased via in-app purchase may not expire").
// Mirrors the production grant path which now writes null.

// Portrait dimensions match a typical phone capture (4:5 aspect).
const PORTRAIT_W = 1024;
const PORTRAIT_H = 1280;

// Earth-tone palette — neutral enough that the placeholder doesn't read
// as alarmist or clinical when a reviewer browses Supabase storage.
const PALETTE = [
  { bg: '#9F7E48', fg: '#FAF3E2' }, // gold bronze
  { bg: '#7A5C9C', fg: '#F2E8FA' }, // muted plum
  { bg: '#4A6B7C', fg: '#E2EEF5' }, // muted slate blue
  { bg: '#8C5A4F', fg: '#FAEAE2' }, // terracotta
];

// -----------------------------------------------------------------------------
// .env loader (mirrors scripts/topup-user.mjs)
// -----------------------------------------------------------------------------
async function loadEnv() {
  const text = await readFile(resolve(REPO_ROOT, '.env'), 'utf8');
  const env = Object.fromEntries(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const idx = line.indexOf('=');
        return [line.slice(0, idx), line.slice(idx + 1).replace(/^"|"$/g, '')];
      }),
  );
  for (const v of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'REVIEWER_PASSWORD']) {
    if (!env[v] && !process.env[v]) {
      throw new Error(`missing ${v} in .env or process.env`);
    }
    process.env[v] ||= env[v];
  }
}

// -----------------------------------------------------------------------------
// Fixture generator — solid-color portrait with "Sample 0N" label.
// Only runs for files that don't exist; real portraits dropped in by hand
// are preserved.
// -----------------------------------------------------------------------------
function svgPortrait(label, palette) {
  const w = PORTRAIT_W;
  const h = PORTRAIT_H;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="100%" height="100%" fill="${palette.bg}" />
    <circle cx="${w / 2}" cy="${h * 0.4}" r="${w * 0.18}" fill="${palette.fg}" opacity="0.18" />
    <text x="${w / 2}" y="${h * 0.55}" font-family="Georgia, serif"
          font-size="${w * 0.08}" fill="${palette.fg}" opacity="0.85"
          text-anchor="middle" font-weight="600">${label}</text>
  </svg>`;
}

async function ensureFixtures() {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  for (let i = 0; i < 4; i++) {
    const filename = `0${i + 1}.jpg`;
    const filePath = resolve(FIXTURES_DIR, filename);
    if (existsSync(filePath)) continue;
    const label = `Sample 0${i + 1}`;
    const buf = await sharp(Buffer.from(svgPortrait(label, PALETTE[i])))
      .jpeg({ quality: 80 })
      .toBuffer();
    writeFileSync(filePath, buf);
    console.log(`[seed] generated placeholder ${filename}`);
  }
}

// -----------------------------------------------------------------------------
// Account + state
// -----------------------------------------------------------------------------
async function ensureUser(supa) {
  // listUsers paginates; reviewer is in the first page on a fresh project.
  const { data, error } = await supa.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const existing = data?.users.find((u) => u.email === REVIEWER_EMAIL);
  if (existing) {
    console.log('[seed] reviewer exists:', existing.id);
    return existing;
  }
  const created = await supa.auth.admin.createUser({
    email: REVIEWER_EMAIL,
    password: process.env.REVIEWER_PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  console.log('[seed] created reviewer:', created.data.user.id);
  return created.data.user;
}

async function ensureCredits(supa, userId) {
  // Direct UPDATE (not grant_credits RPC) so re-runs are idempotent —
  // SET overrides the value rather than incrementing. Skips ledger row,
  // which is fine for a synthetic reviewer account.
  //
  // enhance_used + merge_used come from migration 20260421000001 which may
  // not be applied yet on a given environment; falls back to credits-only
  // (mirrors scripts/topup-user.mjs).
  const baseUpdate = {
    topup_credits_remaining: REVIEWER_CREDITS,
    topup_expires_at: null,
  };
  const withFlags = { ...baseUpdate, enhance_used: false, merge_used: false };

  let { error } = await supa.from('profiles').update(withFlags).eq('id', userId);
  if (error && /Could not find|does not exist/i.test(error.message ?? '')) {
    console.warn('[seed] enhance_used/merge_used columns missing — skipping flag reset');
    ({ error } = await supa.from('profiles').update(baseUpdate).eq('id', userId));
  }
  if (error) throw error;
  console.log(`[seed] credits set to ${REVIEWER_CREDITS} (no expiry)`);
}

async function ensurePhotos(supa, userId) {
  for (let i = 1; i <= 4; i++) {
    const filename = `0${i}.jpg`;
    const buf = readFileSync(resolve(FIXTURES_DIR, filename));
    // Path matches storage RLS policy (<user_id>/<...>/<filename>); service
    // role bypasses RLS, but keeping the convention so signed-URL reads
    // work the same way as user uploads.
    const bucketPath = `${userId}/seed/${filename}`;
    const { error } = await supa.storage
      .from('tributes-source')
      .upload(bucketPath, buf, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
  }
  console.log('[seed] uploaded 4 sample photos to tributes-source/<userId>/seed/');
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  await loadEnv();
  await ensureFixtures();

  const supa = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const user = await ensureUser(supa);
  await ensureCredits(supa, user.id);
  await ensurePhotos(supa, user.id);

  console.log('\nReviewer account ready:');
  console.log(`  email:    ${REVIEWER_EMAIL}`);
  console.log(`  password: (from REVIEWER_PASSWORD env)`);
  console.log(`  credits:  ${REVIEWER_CREDITS} (top-up, ${TOPUP_TTL_DAYS}-day window)`);
  console.log(`  user_id:  ${user.id}`);
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
