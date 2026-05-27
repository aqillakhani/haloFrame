#!/usr/bin/env node
// One-shot Android upload-keystore generator.
//
// Generates a Play upload keystore at apps/web/android/upload.keystore
// (gitignored via the *.keystore rule), persists every secret needed to
// sign an AAB into .env.codemagic.local, and base64-encodes the keystore
// body for Codemagic's secure env-var store.
//
// Why an upload keystore (not the legacy "release" keystore):
//   Google's Play App Signing means we only need to keep this upload key
//   long enough to push new versions to Google. Google holds the real
//   release key. Losing the upload key isn't catastrophic — you can ask
//   Google to reset it via their support form — but we'd rather not.
//
// Idempotency:
//   Refuses to run if apps/web/android/upload.keystore already exists.
//   Delete the file (and the matching keys in .env.codemagic.local) if
//   you intentionally want a fresh one.
//
// Usage:
//   node scripts/generate-android-keystore.mjs

import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const KEYSTORE_PATH = resolve(REPO_ROOT, 'apps/web/android/upload.keystore');
const ENV_PATH = resolve(REPO_ROOT, '.env.codemagic.local');

// keytool is bundled with Android Studio on Windows; falls back to PATH
// for macOS / Linux machines where it's usually on PATH via the JDK.
const KEYTOOL_CANDIDATES = [
  'C:/Program Files/Android/Android Studio/jbr/bin/keytool.exe',
  'C:/Program Files/Java/jdk/bin/keytool.exe',
  'keytool',
];

const ALIAS = 'upload';
const DN = 'CN=haloFrame, O=Keshwani Consultancy Corp, ST=Texas, C=US';
// Google recommends 25+ year validity for upload keys. 10000 days = 27y.
const VALIDITY_DAYS = 10000;

// ---- Pre-flight ---------------------------------------------------------
if (existsSync(KEYSTORE_PATH)) {
  console.error(`Refusing to overwrite existing keystore at:\n  ${KEYSTORE_PATH}`);
  console.error('Delete the file and the matching CM_KEYSTORE_* keys in');
  console.error('.env.codemagic.local before re-running.');
  process.exit(1);
}

function findKeytool() {
  for (const candidate of KEYTOOL_CANDIDATES) {
    const probe = spawnSync(candidate, ['-help'], { stdio: 'ignore' });
    if (probe.status === 0 || probe.status === 1) return candidate;
  }
  console.error('keytool not found in any expected location:');
  for (const c of KEYTOOL_CANDIDATES) console.error('  - ' + c);
  console.error('Install Android Studio (which bundles a JDK) or a standalone JDK first.');
  process.exit(1);
}

const KEYTOOL = findKeytool();
console.log('Using keytool:', KEYTOOL);

// ---- Generate the secrets ----------------------------------------------
// 24-char base64url passwords; same alphabet [A-Za-z0-9_-]. keytool accepts
// these without escaping concerns.
const storePassword = randomBytes(18).toString('base64url');
// PKCS12 (keytool's default store type since JDK 9) protects the private key
// with the STORE password and silently ignores a separate -keypass. Using a
// different keyPassword produces a keystore whose key can only be read with
// the store password — Gradle's signingConfig then fails with "Given final
// block not properly padded". Keep them identical.
const keyPassword = storePassword;

// ---- Run keytool --------------------------------------------------------
console.log('Generating keystore...');
const result = spawnSync(KEYTOOL, [
  '-genkeypair',
  '-v',
  '-keystore', KEYSTORE_PATH,
  '-alias', ALIAS,
  '-keyalg', 'RSA',
  '-keysize', '2048',
  '-validity', String(VALIDITY_DAYS),
  '-storepass', storePassword,
  '-keypass', keyPassword,
  '-dname', DN,
], { stdio: ['ignore', 'pipe', 'pipe'] });

if (result.status !== 0) {
  console.error('keytool failed:');
  console.error('STDOUT:', result.stdout?.toString());
  console.error('STDERR:', result.stderr?.toString());
  process.exit(1);
}
console.log('  ✓ keystore written to', KEYSTORE_PATH);

// ---- Verify it ----------------------------------------------------------
const verify = spawnSync(KEYTOOL, [
  '-list',
  '-keystore', KEYSTORE_PATH,
  '-storepass', storePassword,
], { stdio: ['ignore', 'pipe', 'pipe'] });
if (verify.status !== 0) {
  console.error('keytool verify failed:', verify.stderr?.toString());
  process.exit(1);
}
const verifyOut = verify.stdout.toString();
if (!verifyOut.includes(ALIAS)) {
  console.error('keystore exists but alias "' + ALIAS + '" not present in -list output:');
  console.error(verifyOut);
  process.exit(1);
}
console.log('  ✓ verified · alias=' + ALIAS);

// ---- Base64-encode for Codemagic ---------------------------------------
const keystoreBuf = readFileSync(KEYSTORE_PATH);
const keystoreB64 = keystoreBuf.toString('base64');
const sizeKB = (keystoreBuf.length / 1024).toFixed(1);
console.log('  ✓ encoded · ' + sizeKB + ' KB raw, ' + keystoreB64.length + ' chars base64');

// ---- Upsert .env.codemagic.local ---------------------------------------
function upsert(lines, key, value) {
  let replaced = false;
  const next = lines.map((l) => {
    if (l.startsWith(`${key}=`)) {
      replaced = true;
      return `${key}=${value}`;
    }
    return l;
  });
  if (!replaced) {
    if (next.length && next[next.length - 1] !== '') next.push('');
    next.push(`${key}=${value}`);
    next.push('');
  }
  return next;
}

let envLines = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8').split('\n') : [];
envLines = upsert(envLines, 'CM_KEY_ALIAS', ALIAS);
envLines = upsert(envLines, 'CM_KEYSTORE_PASSWORD', storePassword);
envLines = upsert(envLines, 'CM_KEY_PASSWORD', keyPassword);
envLines = upsert(envLines, 'CM_KEYSTORE_BASE64', keystoreB64);
writeFileSync(ENV_PATH, envLines.join('\n'));
console.log('  ✓ persisted CM_KEY_ALIAS, CM_KEYSTORE_PASSWORD, CM_KEY_PASSWORD, CM_KEYSTORE_BASE64 to .env.codemagic.local');

// ---- Final summary (without echoing the secrets) -----------------------
console.log('');
console.log('Done. Next:');
console.log('  1. Copy the four CM_* values from .env.codemagic.local into');
console.log('     1Password (or your secret manager) as the canonical');
console.log('     "haloFrame Android upload keystore" record. Losing this');
console.log('     keystore means a Play support ticket to reset.');
console.log('  2. Mirror those four variables into the Codemagic env-var');
console.log('     group "haloframe_secrets" (secure=true).');
console.log('  3. Wire an android-internal workflow into codemagic.yaml that');
console.log('     decodes CM_KEYSTORE_BASE64 → upload.keystore on the build');
console.log('     machine and signs the AAB with the other three vars.');
