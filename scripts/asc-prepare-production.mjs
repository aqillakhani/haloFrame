// ASC App Store production-submit prep (listing copy + age rating +
// App Review Information + build attach). Idempotent: every write is a
// PATCH or a check-then-POST, so it's safe to re-run.
//
// Reads creds from .env.codemagic.local; ES256-JWT auth shared with the
// rest of the asc-*.mjs scripts. Resolves all ASC object IDs at runtime
// (no hard-coded ids) so it keeps working if the version is recreated.
//
//   node scripts/asc-prepare-production.mjs
//
// Pairs with scripts/asc-create-iap.mjs (the 5 in-app purchases) and the
// read-only readiness check at the end of this file's run.
//
// Source of truth for copy: docs/STORE_LISTINGS.md (1.2/1.3/1.4) and
// docs/BETA_REVIEW_NOTES.md (## en-US notes). The latter is the trimmed
// <=4000ch reviewer notes block; docs/REVIEWER_NOTES.md is intentionally
// longer than the App Review Notes field allows.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, createSign } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envPath = resolve(repoRoot, '.env.codemagic.local');

const APP_ID = '6768356716';
const REVIEWER_EMAIL = 'reviewer@gethaloframe.com';
const CONTACT_FIRST = 'Aqil';
const CONTACT_LAST = 'Lakhani';
const CONTACT_EMAIL = 'aqil.lakhani8@gmail.com';
const SUPPORT_URL = 'https://gethaloframe.com/support';
const MARKETING_URL = 'https://gethaloframe.com';
const PRIVACY_URL = 'https://gethaloframe.com/privacy';
const SUBTITLE = 'Honor loved ones in one photo';
const EDITABLE_STATES = new Set([
  'PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED',
  'METADATA_REJECTED', 'INVALID_BINARY', 'WAITING_FOR_REVIEW',
]);

// ---- .env loader (matches asc-build-status.mjs) -------------------------
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
      while (i + 1 < lines.length && !lines[i + 1].endsWith('"')) { i++; val += '\n' + lines[i]; }
      if (i + 1 < lines.length) { i++; val += '\n' + lines[i]; }
    }
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
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

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function derToJose(der) {
  if (der[0] !== 0x30) throw new Error('Bad DER ECDSA signature');
  let offset = 2;
  if (der[1] & 0x80) offset = 2 + (der[1] & 0x7f);
  if (der[offset++] !== 0x02) throw new Error('Bad DER R tag');
  const rLen = der[offset++]; let r = der.slice(offset, offset + rLen); offset += rLen;
  if (der[offset++] !== 0x02) throw new Error('Bad DER S tag');
  const sLen = der[offset++]; let s = der.slice(offset, offset + sLen);
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
  const key = createPrivateKey(PRIVATE_KEY);
  const signer = createSign('SHA256'); signer.update(`${head}.${body}`); signer.end();
  return `${head}.${body}.${b64url(derToJose(signer.sign(key)))}`;
}
const TOKEN = makeJwt();

async function api(method, path, body) {
  const resp = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await resp.text();
  let json = null; if (text) { try { json = JSON.parse(text); } catch {} }
  return { ok: resp.ok, status: resp.status, text, json };
}

// ---- copy extraction (matches asc-build-status.mjs) ---------------------
const ASC_EMOJI_BLOCKS = new RegExp('[' +
  '\\u{1F000}-\\u{1FFFF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}' +
  '\\u{2300}-\\u{23FF}\\u{2B00}-\\u{2BFF}\\u{FE00}-\\u{FE0F}\\u{200D}' + ']', 'gu');
function sanitizeForAsc(text) {
  return text.replace(/\r/g, '').replace(ASC_EMOJI_BLOCKS, '')
    .replace(/[ \t]+/g, ' ').replace(/ \n/g, '\n').trim();
}
function extractFirstFencedBlock(md, headerRegex) {
  const idx = md.search(headerRegex);
  if (idx < 0) throw new Error(`could not find section header matching ${headerRegex}`);
  const m = md.slice(idx).match(/```[a-z]*\s*\n([\s\S]*?)\n```/);
  if (!m) throw new Error(`no fenced block after header ${headerRegex}`);
  return m[1].trim();
}
function listingMd() { return readFileSync(resolve(repoRoot, 'docs/STORE_LISTINGS.md'), 'utf8'); }
function readPromo() {
  const v = sanitizeForAsc(extractFirstFencedBlock(listingMd(), /^### 1\.2 Promotional Text.*$/m));
  if (v.length > 170) throw new Error(`promotional text ${v.length} > 170`);
  return v;
}
function readDescription() {
  const v = sanitizeForAsc(extractFirstFencedBlock(listingMd(), /^### 1\.3 Description.*$/m));
  if (v.length > 4000) throw new Error(`description ${v.length} > 4000`);
  return v;
}
function readKeywords() {
  const v = sanitizeForAsc(extractFirstFencedBlock(listingMd(), /^### 1\.4 Keywords.*$/m));
  if (v.length > 100) throw new Error(`keywords ${v.length} > 100`);
  return v;
}
function readProductionNotes() {
  const md = readFileSync(resolve(repoRoot, 'docs/BETA_REVIEW_NOTES.md'), 'utf8');
  const v = sanitizeForAsc(extractFirstFencedBlock(md, /^## en-US notes/m));
  if (v.length > 4000) throw new Error(`review notes ${v.length} > 4000`);
  return v;
}

// ---- run ----------------------------------------------------------------
const results = [];
function ok(step, msg) { results.push({ step, ok: true, msg }); console.log(`  ✓ ${msg}`); }
function bad(step, msg) { results.push({ step, ok: false, msg }); console.log(`  ✗ ${msg}`); }

// Resolve IDs
console.log('== Resolving ASC object IDs ==');
const vResp = await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?include=appStoreVersionLocalizations&limit=10`);
if (!vResp.ok) { console.error('cannot list appStoreVersions', vResp.status, vResp.text.slice(0, 300)); process.exit(1); }
const version = (vResp.json.data || []).find((v) => EDITABLE_STATES.has(v.attributes.appStoreState || v.attributes.appVersionState)) || vResp.json.data?.[0];
const versionState = version?.attributes.appStoreState || version?.attributes.appVersionState;
const versionLocId = (version?.relationships?.appStoreVersionLocalizations?.data || [])
  .map((d) => (vResp.json.included || []).find((x) => x.id === d.id))
  .find((x) => x?.attributes?.locale === 'en-US')?.id
  || (vResp.json.included || []).find((x) => x.type === 'appStoreVersionLocalizations' && x.attributes.locale === 'en-US')?.id;

const aiResp = await api('GET', `/v1/apps/${APP_ID}/appInfos?include=appInfoLocalizations,ageRatingDeclaration`);
if (!aiResp.ok) { console.error('cannot list appInfos', aiResp.status); process.exit(1); }
const appInfo = (aiResp.json.data || []).find((a) => EDITABLE_STATES.has(a.attributes.state || a.attributes.appStoreState)) || aiResp.json.data?.[0];
const appInfoLocId = (aiResp.json.included || []).find((x) => x.type === 'appInfoLocalizations' && x.attributes.locale === 'en-US')?.id;
const ageDeclObj = (aiResp.json.included || []).find((x) => x.type === 'ageRatingDeclarations');
const ageDeclId = appInfo?.relationships?.ageRatingDeclaration?.data?.id || ageDeclObj?.id;
const ageDeclAttrs = ageDeclObj?.attributes || {};

const bResp = await api('GET', `/v1/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=1`);
if (!bResp.ok) console.error('  ! builds query failed', bResp.status, bResp.text.slice(0, 200));
const build = bResp.json?.data?.[0];

console.log(`  version       ${version?.id} (v${version?.attributes.versionString}, state=${versionState})`);
console.log(`  versionLoc    ${versionLocId} (en-US)`);
console.log(`  appInfoLoc    ${appInfoLocId} (en-US)`);
console.log(`  ageRatingDecl ${ageDeclId}`);
console.log(`  build         ${build?.id} (build #${build?.attributes.version})`);
if (!version || !versionLocId || !appInfoLocId || !ageDeclId || !build) {
  console.error('\n❌ Could not resolve all IDs — aborting before any write.'); process.exit(1);
}

// Step 1 — listing copy
console.log('\n== Step 1: listing copy ==');
try {
  const description = readDescription(), keywords = readKeywords(), promotionalText = readPromo();
  console.log(`  description=${description.length}ch keywords=${keywords.length}ch promo=${promotionalText.length}ch`);
  let r = await api('PATCH', `/v1/appStoreVersionLocalizations/${versionLocId}`, {
    data: { type: 'appStoreVersionLocalizations', id: versionLocId,
      attributes: { description, keywords, promotionalText, supportUrl: SUPPORT_URL, marketingUrl: MARKETING_URL } },
  });
  r.ok ? ok(1, 'version localization (description/keywords/promo/support/marketing) set') : bad(1, `version loc PATCH ${r.status}: ${r.text.slice(0, 300)}`);
  r = await api('PATCH', `/v1/appInfoLocalizations/${appInfoLocId}`, {
    data: { type: 'appInfoLocalizations', id: appInfoLocId, attributes: { subtitle: SUBTITLE, privacyPolicyUrl: PRIVACY_URL } },
  });
  r.ok ? ok(1, 'app-info localization (subtitle + privacy URL) set') : bad(1, `appInfo loc PATCH ${r.status}: ${r.text.slice(0, 300)}`);
} catch (e) { bad(1, `listing copy: ${e.message}`); }

// Step 2 — age rating (adaptive: strings->NONE, booleans->false)
console.log('\n== Step 2: age rating (4+) ==');
try {
  const cur = ageDeclAttrs;
  if (!Object.keys(cur).length) throw new Error('no age rating attributes available from appInfos include');
  // Seed: every content descriptor = NONE, kidsAgeBand = null. Booleans get
  // flipped to false below. Fields whose current value is null can't be typed
  // by inspection, so the PATCH loop self-corrects from Apple's type errors.
  const attrs = {};
  for (const [k, v] of Object.entries(cur)) {
    if (typeof v === 'boolean') attrs[k] = false;
    else if (k === 'kidsAgeBand') attrs[k] = null;
    else attrs[k] = 'NONE';
  }
  const KNOWN_BOOL = ['gambling', 'unrestrictedWebAccess', 'messagingAndChat', 'lootBox', 'seventeenPlus', 'gamblingAndContests'];
  for (const k of KNOWN_BOOL) if (k in attrs) attrs[k] = false;
  let r, tries = 0;
  while (tries++ < 20) {
    r = await api('PATCH', `/v1/ageRatingDeclarations/${ageDeclId}`, { data: { type: 'ageRatingDeclarations', id: ageDeclId, attributes: attrs } });
    if (r.ok) break;
    let fixed = false;
    for (const e of (r.json?.errors || [])) {
      let f = (e.source?.pointer || '').match(/attributes\/(\w+)/)?.[1];
      if (!f) f = (e.detail || '').match(/'(\w+)'/)?.[1]; // field named in the message, not the pointer
      if (!f || !(f in attrs)) continue;
      if (/Expected a BOOLEAN/i.test(e.detail)) { attrs[f] = false; fixed = true; }
      else if (/Expected a STRING/i.test(e.detail)) { attrs[f] = 'NONE'; fixed = true; }
      else if (/Expected.*NULL/i.test(e.detail)) { attrs[f] = null; fixed = true; }
      else if (/uri|URI/i.test(e.detail)) { attrs[f] = null; fixed = true; }
      else { delete attrs[f]; fixed = true; } // non-questionnaire field — leave at default
    }
    if (!fixed) break;
  }
  r.ok ? ok(2, `age rating questionnaire set (${Object.keys(attrs).length} fields, ${tries} attempt(s) → 4+)`) : bad(2, `age rating PATCH ${r.status}: ${r.text.slice(0, 400)}`);
} catch (e) { bad(2, `age rating: ${e.message}`); }

// Step 4 — production App Review Information (POST or PATCH)
console.log('\n== Step 4: App Review Information ==');
try {
  const password = env.REVIEWER_PASSWORD;
  if (!password) throw new Error('REVIEWER_PASSWORD missing from .env.codemagic.local');
  const notes = readProductionNotes();
  const attrs = {
    contactFirstName: CONTACT_FIRST, contactLastName: CONTACT_LAST, contactEmail: CONTACT_EMAIL,
    demoAccountRequired: true, demoAccountName: REVIEWER_EMAIL, demoAccountPassword: password, notes,
  };
  if (env.REVIEWER_CONTACT_PHONE) attrs.contactPhone = env.REVIEWER_CONTACT_PHONE;
  const existing = await api('GET', `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`);
  if (existing.ok && existing.json?.data?.id) {
    const r = await api('PATCH', `/v1/appStoreReviewDetails/${existing.json.data.id}`, { data: { type: 'appStoreReviewDetails', id: existing.json.data.id, attributes: attrs } });
    r.ok ? ok(4, `review detail updated (notes ${notes.length}ch, demo ${REVIEWER_EMAIL})`) : bad(4, `review detail PATCH ${r.status}: ${r.text.slice(0, 300)}`);
  } else {
    const r = await api('POST', '/v1/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails', attributes: attrs, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } } });
    r.ok ? ok(4, `review detail created (notes ${notes.length}ch, demo ${REVIEWER_EMAIL})`) : bad(4, `review detail POST ${r.status}: ${r.text.slice(0, 300)}`);
  }
} catch (e) { bad(4, `review info: ${e.message}`); }

// Step 5 — attach build
console.log('\n== Step 5: attach build ==');
try {
  const r = await api('PATCH', `/v1/appStoreVersions/${version.id}/relationships/build`, { data: { type: 'builds', id: build.id } });
  r.ok ? ok(5, `build #${build.attributes.version} attached to v${version.attributes.versionString}`) : bad(5, `attach build ${r.status}: ${r.text.slice(0, 300)}`);
} catch (e) { bad(5, `attach build: ${e.message}`); }

// Step 6 — app price (Free)
console.log('\n== Step 6: app price (Free) ==');
try {
  const sched = await api('GET', `/v1/apps/${APP_ID}/appPriceSchedule`);
  if (sched.ok && sched.json?.data) { ok(6, 'app price schedule already set'); }
  else {
    let path = `/v1/apps/${APP_ID}/appPricePoints?filter[territory]=USA&limit=200`, freeId = null;
    for (let i = 0; i < 10 && path && !freeId; i++) {
      const r = await api('GET', path);
      if (!r.ok) throw new Error(`appPricePoints ${r.status}: ${r.text.slice(0, 200)}`);
      freeId = (r.json.data || []).find((p) => parseFloat(p.attributes.customerPrice) === 0)?.id;
      path = r.json.links?.next ? r.json.links.next.replace('https://api.appstoreconnect.apple.com', '') : null;
    }
    if (!freeId) throw new Error('no Free ($0.00) app price point found');
    const tmp = '${appprice}';
    const r = await api('POST', '/v1/appPriceSchedules', {
      data: { type: 'appPriceSchedules', relationships: { app: { data: { type: 'apps', id: APP_ID } }, baseTerritory: { data: { type: 'territories', id: 'USA' } }, manualPrices: { data: [{ type: 'appPrices', id: tmp }] } } },
      included: [{ type: 'appPrices', id: tmp, attributes: {}, relationships: { appPricePoint: { data: { type: 'appPricePoints', id: freeId } } } }],
    });
    r.ok ? ok(6, 'app price set to Free (USA base)') : bad(6, `app price ${r.status}: ${r.text.slice(0, 300)}`);
  }
} catch (e) { bad(6, `app price: ${e.message}`); }

// Summary
console.log('\n===== SUMMARY =====');
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} step ${r.step}: ${r.msg}`);
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n❌ ${failed.length} write(s) failed.` : '\n✅ All metadata writes succeeded.');
process.exit(failed.length ? 1 : 0);
