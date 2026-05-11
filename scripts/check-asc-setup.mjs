// Probe App Store Connect API to verify launch prereqs:
//   1. Bundle ID `com.haloframe.app` is registered + has IAP capability
//   2. An ASC app record exists referencing that bundle ID
//   3. Read which TestFlight beta groups exist (need "external testers")
//
// Reads creds from .env.codemagic.local (gitignored). The .p8 private key
// is ES256; we sign a JWT manually with Node's built-in crypto.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, createSign } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envPath = resolve(repoRoot, '.env.codemagic.local');

// Tiny .env parser that handles quoted multi-line values.
function loadEnv(text) {
  const out = {};
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    let val = rawVal;
    if (val.startsWith('"') && !val.endsWith('"')) {
      // Multi-line — accumulate until we hit the closing quote.
      while (i + 1 < lines.length && !lines[i + 1].endsWith('"')) {
        i++;
        val += '\n' + lines[i];
      }
      if (i + 1 < lines.length) {
        i++;
        val += '\n' + lines[i];
      }
    }
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = loadEnv(readFileSync(envPath, 'utf8'));

const KEY_ID = env.APP_STORE_CONNECT_KEY_IDENTIFIER;
const ISSUER_ID = env.APP_STORE_CONNECT_ISSUER_ID;
const PRIVATE_KEY = env.APP_STORE_CONNECT_PRIVATE_KEY;
if (!KEY_ID || !ISSUER_ID || !PRIVATE_KEY) {
  console.error('missing one of KEY_IDENTIFIER / ISSUER_ID / PRIVATE_KEY');
  process.exit(2);
}

// ---- JWT (ES256) ---------------------------------------------------------
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function asn1Length(n) {
  if (n < 0x80) return Buffer.from([n]);
  if (n <= 0xff) return Buffer.from([0x81, n]);
  return Buffer.from([0x82, (n >> 8) & 0xff, n & 0xff]);
}

// Node's crypto.sign emits an ASN.1 DER signature for ECDSA. ASC wants the
// raw r||s concat (JWS format). Convert.
function derToJose(der) {
  if (der[0] !== 0x30) throw new Error('Bad DER ECDSA signature');
  let offset = 2;
  if (der[1] & 0x80) offset = 2 + (der[1] & 0x7f);
  if (der[offset++] !== 0x02) throw new Error('Bad DER R tag');
  const rLen = der[offset++];
  let r = der.slice(offset, offset + rLen);
  offset += rLen;
  if (der[offset++] !== 0x02) throw new Error('Bad DER S tag');
  const sLen = der[offset++];
  let s = der.slice(offset, offset + sLen);
  // Strip leading zero, then left-pad to 32 bytes (P-256 component size).
  while (r.length > 0 && r[0] === 0x00) r = r.slice(1);
  while (s.length > 0 && s[0] === 0x00) s = s.slice(1);
  const pad = (buf) => Buffer.concat([Buffer.alloc(32 - buf.length), buf]);
  return Buffer.concat([pad(r), pad(s)]);
}

function makeJwt() {
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: ISSUER_ID,
    iat: now,
    exp: now + 60 * 18, // ASC allows up to 20 min
    aud: 'appstoreconnect-v1',
  };
  const head = b64url(JSON.stringify(header));
  const body = b64url(JSON.stringify(claims));
  const signingInput = `${head}.${body}`;
  const key = createPrivateKey(PRIVATE_KEY);
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const der = signer.sign(key);
  const jose = derToJose(der);
  return `${signingInput}.${b64url(jose)}`;
}

const TOKEN = makeJwt();

async function api(path) {
  const url = `https://api.appstoreconnect.apple.com${path}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`${resp.status} ${url}\n${text.slice(0, 600)}`);
  }
  return JSON.parse(text);
}

// ---- Probe ---------------------------------------------------------------

console.log('== 1. Auth check ==');
const profile = await api('/v1/apps?limit=1');
console.log(`auth OK · ${profile.data?.length ?? 0} app(s) visible to this key\n`);

console.log('== 2. Looking for App ID `com.haloframe.app` ==');
const bundleIds = await api(
  '/v1/bundleIds?filter[identifier]=com.haloframe.app&include=bundleIdCapabilities&limit=10',
);
if (bundleIds.data.length === 0) {
  console.log('  ❌ NOT FOUND — bundle ID not yet registered on Apple Developer.');
  console.log('     Register at https://developer.apple.com/account/resources/identifiers');
  console.log('     then re-run this script.');
} else {
  const bid = bundleIds.data[0];
  console.log(`  ✅ found · id=${bid.id} · name=${bid.attributes?.name}`);
  // Capabilities are returned in `included` with type `bundleIdCapabilities`.
  const caps = (bundleIds.included ?? []).filter((x) => x.type === 'bundleIdCapabilities');
  const capTypes = caps.map((c) => c.attributes?.capabilityType).filter(Boolean);
  console.log(`     capabilities: ${capTypes.join(', ') || '(none)'}`);
  if (capTypes.includes('IN_APP_PURCHASE')) {
    console.log('     ✅ In-App Purchase capability enabled');
  } else {
    console.log('     ⚠️  In-App Purchase NOT enabled — toggle it on at');
    console.log('         https://developer.apple.com/account/resources/identifiers');
    console.log('         (required since the app uses RC/IAP)');
  }
}
console.log();

console.log('== 3. Looking for an ASC app record on com.haloframe.app ==');
const apps = await api('/v1/apps?filter[bundleId]=com.haloframe.app&limit=10');
if (apps.data.length === 0) {
  console.log('  ❌ NOT FOUND — no App Store Connect app record yet.');
  console.log('     Create at https://appstoreconnect.apple.com/apps');
  console.log('     → My Apps → + → New App');
  console.log('     · Platform: iOS · Bundle ID: com.haloframe.app');
  console.log('     · Name: haloFrame: Memorial Portraits');
  console.log('     · SKU: haloframe-ios-001 (or any unique string)');
  console.log('     · Primary language: English (U.S.)');
} else {
  const a = apps.data[0];
  console.log(`  ✅ found · id=${a.id} · name=${a.attributes?.name} · sku=${a.attributes?.sku}`);
  console.log(`     primary locale: ${a.attributes?.primaryLocale}`);
  console.log(`     content-rights: ${a.attributes?.contentRightsDeclaration ?? '(not set)'}`);

  // While we have an app, list its beta groups — codemagic.yaml publishing
  // step requires `external testers` group to exist.
  console.log();
  console.log(`== 4. Beta groups for this app ==`);
  const groups = await api(`/v1/betaGroups?filter[app]=${a.id}&limit=20`);
  if (groups.data.length === 0) {
    console.log('  ⚠️  no beta groups yet — Codemagic will fail to publish');
    console.log('     to TestFlight unless `external testers` exists. Create');
    console.log('     it at TestFlight → External Testing → + (after first');
    console.log('     build is processed).');
  } else {
    groups.data.forEach((g) => {
      const ext = g.attributes?.isInternalGroup === false ? 'EXTERNAL' : 'internal';
      console.log(`  · ${g.attributes?.name} (${ext})`);
    });
    const hasExternal = groups.data.some((g) => g.attributes?.name === 'external testers');
    if (!hasExternal) {
      console.log(
        '  ⚠️  no group named exactly `external testers` — codemagic.yaml',
      );
      console.log(
        '       publishing section expects that exact name. Either rename',
      );
      console.log('       a group or edit codemagic.yaml beta_groups list.');
    }
  }
}
