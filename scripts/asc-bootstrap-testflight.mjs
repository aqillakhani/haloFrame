// One-shot bootstrap: create the `external testers` beta group on app
// 6768356716, invite aqil.lakhani8@gmail.com as the first tester, and
// (optionally) fix the en-US display name capitalization from
// `HaloFrame: Memorial Portraits` → `haloFrame: Memorial Portraits`.
//
// Idempotent — re-running after success will detect the existing group /
// tester and skip. Safe to retry if any sub-step fails.
//
// Reads creds from .env.codemagic.local (gitignored). Reuses the same
// ES256-JWT signing approach as scripts/check-asc-setup.mjs.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, createSign } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envPath = resolve(repoRoot, '.env.codemagic.local');

const APP_ID = '6768356716';
const BETA_GROUP_NAME = 'external testers';
const TESTER_EMAIL = 'aqil.lakhani8@gmail.com';
const TESTER_FIRST = 'Aqil';
const TESTER_LAST = 'Lakhani';
const TARGET_NAME = 'haloFrame: Memorial Portraits';

// ---- .env loader (same parser as check-asc-setup.mjs) -------------------
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
  console.error('missing KEY_IDENTIFIER / ISSUER_ID / PRIVATE_KEY in .env.codemagic.local');
  process.exit(2);
}

// ---- JWT (ES256) --------------------------------------------------------
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

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
  while (r.length > 0 && r[0] === 0x00) r = r.slice(1);
  while (s.length > 0 && s[0] === 0x00) s = s.slice(1);
  const pad = (buf) => Buffer.concat([Buffer.alloc(32 - buf.length), buf]);
  return Buffer.concat([pad(r), pad(s)]);
}

function makeJwt() {
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: ISSUER_ID, iat: now, exp: now + 60 * 18, aud: 'appstoreconnect-v1' };
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

async function api(method, path, body) {
  const url = `https://api.appstoreconnect.apple.com${path}`;
  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch { /* leave null */ }
  }
  return { ok: resp.ok, status: resp.status, text, json };
}

function fail(label, r) {
  console.error(`\n❌ ${label} → ${r.status}`);
  console.error(r.text.slice(0, 1200));
  process.exit(1);
}

// ---- Step 1: ensure `external testers` beta group exists ----------------
console.log(`== 1. Ensure beta group "${BETA_GROUP_NAME}" exists ==`);

const groupsResp = await api('GET', `/v1/betaGroups?filter[app]=${APP_ID}&limit=50`);
if (!groupsResp.ok) fail('list beta groups', groupsResp);

let group = groupsResp.json.data.find((g) => g.attributes?.name === BETA_GROUP_NAME);
if (group) {
  console.log(`  ✓ already exists · id=${group.id}`);
} else {
  console.log(`  + creating...`);
  const createResp = await api('POST', '/v1/betaGroups', {
    data: {
      type: 'betaGroups',
      attributes: {
        name: BETA_GROUP_NAME,
        publicLinkEnabled: false,
      },
      relationships: {
        app: { data: { type: 'apps', id: APP_ID } },
      },
    },
  });
  if (!createResp.ok) fail('create beta group', createResp);
  group = createResp.json.data;
  console.log(`  ✓ created · id=${group.id}`);
}
const groupId = group.id;
const isExternal = group.attributes?.isInternalGroup === false;
console.log(`     type=${isExternal ? 'EXTERNAL' : 'internal'}`);
console.log();

// ---- Step 2: ensure aqil.lakhani8@gmail.com is in the group -------------
console.log(`== 2. Ensure tester ${TESTER_EMAIL} is in the group ==`);

const testersResp = await api(
  'GET',
  `/v1/betaGroups/${groupId}/betaTesters?limit=200`,
);
if (!testersResp.ok) fail('list testers in group', testersResp);

const existing = testersResp.json.data.find(
  (t) => (t.attributes?.email || '').toLowerCase() === TESTER_EMAIL.toLowerCase(),
);
if (existing) {
  console.log(`  ✓ already in group · tester id=${existing.id}`);
} else {
  console.log(`  + inviting...`);
  const inviteResp = await api('POST', '/v1/betaTesters', {
    data: {
      type: 'betaTesters',
      attributes: {
        email: TESTER_EMAIL,
        firstName: TESTER_FIRST,
        lastName: TESTER_LAST,
      },
      relationships: {
        betaGroups: { data: [{ type: 'betaGroups', id: groupId }] },
      },
    },
  });
  if (!inviteResp.ok) {
    // 409 may mean the tester already exists globally but isn't in this
    // group yet. Look them up by email and attach to the group instead.
    if (inviteResp.status === 409 || /already exists/i.test(inviteResp.text)) {
      console.log('  ↻ tester exists globally — attaching to this group');
      const lookupResp = await api(
        'GET',
        `/v1/betaTesters?filter[email]=${encodeURIComponent(TESTER_EMAIL)}&limit=1`,
      );
      if (!lookupResp.ok) fail('lookup existing tester', lookupResp);
      const t = lookupResp.json.data[0];
      if (!t) fail('lookup existing tester (no row returned)', lookupResp);
      const attachResp = await api(
        'POST',
        `/v1/betaGroups/${groupId}/relationships/betaTesters`,
        { data: [{ type: 'betaTesters', id: t.id }] },
      );
      if (!attachResp.ok) fail('attach tester to group', attachResp);
      console.log(`  ✓ attached · tester id=${t.id}`);
    } else {
      fail('invite tester', inviteResp);
    }
  } else {
    console.log(`  ✓ invited · tester id=${inviteResp.json.data.id}`);
  }
}
console.log();

// ---- Step 3: cosmetic display-name fix ----------------------------------
console.log(`== 3. Ensure en-US display name = "${TARGET_NAME}" ==`);

const infosResp = await api(
  'GET',
  `/v1/apps/${APP_ID}/appInfos?include=appInfoLocalizations&limit=10`,
);
if (!infosResp.ok) fail('list appInfos', infosResp);

// Pick an editable appInfo (not READY_FOR_DISTRIBUTION). The first non-
// final one is the draft Apple uses for the next version.
const editable = infosResp.json.data.find(
  (i) => i.attributes?.appStoreState !== 'READY_FOR_DISTRIBUTION',
) || infosResp.json.data[0];

if (!editable) {
  console.log('  ⚠️  no appInfo returned — skipping (app may need to be opened in ASC first)');
} else {
  const appInfoId = editable.id;
  // appInfoLocalizations are in `included`; relate by id
  const locRelIds = (editable.relationships?.appInfoLocalizations?.data || []).map((d) => d.id);
  const locs = (infosResp.json.included || []).filter(
    (x) => x.type === 'appInfoLocalizations' && locRelIds.includes(x.id),
  );
  const enUS = locs.find((l) => l.attributes?.locale === 'en-US');
  if (!enUS) {
    console.log('  ⚠️  no en-US localization on the editable appInfo — skipping');
  } else if (enUS.attributes?.name === TARGET_NAME) {
    console.log(`  ✓ already "${TARGET_NAME}"`);
  } else {
    console.log(`  + renaming "${enUS.attributes?.name}" → "${TARGET_NAME}"`);
    const patchResp = await api(
      'PATCH',
      `/v1/appInfoLocalizations/${enUS.id}`,
      {
        data: {
          type: 'appInfoLocalizations',
          id: enUS.id,
          attributes: { name: TARGET_NAME },
        },
      },
    );
    if (!patchResp.ok) {
      console.log(`  ⚠️  rename failed (${patchResp.status}) — leaving as-is`);
      console.log(`     ${patchResp.text.slice(0, 400)}`);
    } else {
      console.log(`  ✓ renamed`);
    }
  }
}

console.log();
console.log('done. Re-run `node scripts/check-asc-setup.mjs` to verify.');
