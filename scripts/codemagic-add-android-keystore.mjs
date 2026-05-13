// scripts/codemagic-add-android-keystore.mjs
//
// Mirrors the four Android upload-keystore secrets from
// .env.codemagic.local into Codemagic's `haloframe_secrets` env-var
// group (secure=true). After this runs, the `android-internal`
// workflow in codemagic.yaml has everything it needs to sign an AAB.
//
// Idempotent: if a given variable already exists in Codemagic, this
// prints "already exists" and skips it. To rotate one of the keys,
// delete it from the Codemagic dashboard first, then re-run.
//
// Prerequisite: run `node scripts/generate-android-keystore.mjs` first
// so the four CM_* values are present in .env.codemagic.local.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENV_FILE = resolve(ROOT, '.env.codemagic.local');
const APP_ID = '69f50db033172bbb569e2285';
const GROUP = 'haloframe_secrets';

// Order matters only for readability — Codemagic stores them flat.
const VARS = [
  'CM_KEY_ALIAS',
  'CM_KEYSTORE_PASSWORD',
  'CM_KEY_PASSWORD',
  'CM_KEYSTORE_BASE64',
];

function loadEnv() {
  const out = {};
  const text = readFileSync(ENV_FILE, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    let val = rawVal;
    if (val.startsWith('"') && !val.endsWith('"')) {
      while (i + 1 < lines.length && !lines[i + 1].endsWith('"')) {
        i++; val += '\n' + lines[i];
      }
      if (i + 1 < lines.length) { i++; val += '\n' + lines[i]; }
    }
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

const env = loadEnv();
const token = env.CODEMAGIC_API_TOKEN;
if (!token) {
  console.error('CODEMAGIC_API_TOKEN not found in .env.codemagic.local');
  process.exit(2);
}
for (const v of VARS) {
  if (!env[v]) {
    console.error(`${v} not found in .env.codemagic.local`);
    console.error('Run `node scripts/generate-android-keystore.mjs` first.');
    process.exit(2);
  }
}

async function cm(path, init = {}) {
  const r = await fetch(`https://api.codemagic.io${path}`, {
    ...init,
    headers: { 'x-auth-token': token, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${path}\n${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

const existingVars = await cm(`/apps/${APP_ID}/variables`);
const existingMap = new Map(existingVars.map((v) => [v.key, v]));

for (const key of VARS) {
  const existing = existingMap.get(key);
  if (existing) {
    console.log(`✓ ${key} already exists (id=${existing.id}, group=${existing.group}, secure=${existing.secure})`);
    continue;
  }
  console.log(`  + creating ${key}...`);
  const created = await cm(`/apps/${APP_ID}/variables`, {
    method: 'POST',
    body: JSON.stringify({
      key,
      value: env[key],
      secure: true,
      group: GROUP,
    }),
  });
  console.log(`  ✓ ${key} created (id=${created.id})`);
}

console.log('\nDone. The android-internal workflow can now sign AABs.');
console.log('Trigger a test build with: node scripts/codemagic-probe.mjs trigger <tag-or-branch>');
console.log('(But first: ensure the Play Console app record exists — Task 19 — and a service account is wired if you want auto-publish — Task 24.)');
