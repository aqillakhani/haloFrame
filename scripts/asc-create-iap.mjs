// Create haloFrame's 5 in-app purchases in App Store Connect via the API.
//   3 auto-renewable subscriptions in group "tributes"
//   2 NON_RENEWING_SUBSCRIPTION one-time top-ups
//
// IRREVERSIBLE: productId + IAP type are permanent once created. This script
// is idempotent — it skips any productId that already exists, so re-runs only
// fill in missing localizations / prices / review screenshots.
//
//   node scripts/asc-create-iap.mjs
//
// Display names + descriptions come from docs/STORE_LISTINGS.md 1.10 (single
// source). Prices from 3.2. productIds match the canonical matrix (3.1) and
// the RevenueCat config exactly.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, createSign, createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envPath = resolve(repoRoot, '.env.codemagic.local');
const APP_ID = '6768356716';
const GROUP_REF = 'tributes';
const REVIEW_SHOT = resolve(repoRoot, 'docs/screenshots/apple-6.7/01.png');

function loadEnv(text) {
  const out = {}; const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]; if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z_]+)=(.*)$/); if (!m) continue;
    const [, key, rawVal] = m; let val = rawVal;
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
const KEY_ID = env.APP_STORE_CONNECT_KEY_IDENTIFIER, ISSUER_ID = env.APP_STORE_CONNECT_ISSUER_ID, PRIVATE_KEY = env.APP_STORE_CONNECT_PRIVATE_KEY;
const b64url = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function derToJose(der) {
  let o = 2; if (der[1] & 0x80) o = 2 + (der[1] & 0x7f); o++; const rl = der[o++]; let r = der.slice(o, o + rl); o += rl;
  o++; const sl = der[o++]; let s = der.slice(o, o + sl);
  while (r.length && r[0] === 0) r = r.slice(1); while (s.length && s[0] === 0) s = s.slice(1);
  const p = (x) => Buffer.concat([Buffer.alloc(32 - x.length), x]); return Buffer.concat([p(r), p(s)]);
}
function makeJwt() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: ISSUER_ID, iat: now, exp: now + 1080, aud: 'appstoreconnect-v1' }));
  const sg = createSign('SHA256'); sg.update(`${head}.${body}`); sg.end();
  return `${head}.${body}.${b64url(derToJose(sg.sign(createPrivateKey(PRIVATE_KEY))))}`;
}
const TOKEN = makeJwt();
async function api(method, path, body) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text(); let j = null; if (t) { try { j = JSON.parse(t); } catch {} }
  return { ok: r.ok, status: r.status, text: t, json: j };
}
const errText = (r) => (r.json?.errors?.map((e) => e.detail || e.title).join('; ') || r.text || '').slice(0, 300);

// ---- copy from docs/STORE_LISTINGS.md 1.10 ------------------------------
const ASC_EMOJI_BLOCKS = new RegExp('[\\u{1F000}-\\u{1FFFF}\\u{2600}-\\u{26FF}\\u{2700}-\\u{27BF}\\u{2300}-\\u{23FF}\\u{2B00}-\\u{2BFF}\\u{FE00}-\\u{FE0F}\\u{200D}]', 'gu');
const sanitize = (t) => t.replace(/\r/g, '').replace(ASC_EMOJI_BLOCKS, '').replace(/[ \t]+/g, ' ').trim();
const listingMd = readFileSync(resolve(repoRoot, 'docs/STORE_LISTINGS.md'), 'utf8');
function readIapCopy(productId) {
  const re = new RegExp('####\\s+`' + productId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`[\\s\\S]*?Display name:\\*\\*\\s*`([^`]+)`[\\s\\S]*?Description:\\*\\*\\s*`([^`]+)`');
  const m = listingMd.match(re);
  if (!m) throw new Error(`no 1.10 copy for ${productId}`);
  return { display: sanitize(m[1]), description: sanitize(m[2]) };
}
function readReviewNote() {
  const i = listingMd.search(/^### 1\.11/m);
  const m = listingMd.slice(i).match(/```[a-z]*\s*\n([\s\S]*?)\n```/);
  return sanitize(m ? m[1] : '');
}
const REVIEW_NOTE = readReviewNote();

const SUBS = [
  { productId: 'haloframe_keepsake_monthly', ref: 'Keepsake Monthly', period: 'ONE_MONTH', price: '9.99', level: 1 },
  { productId: 'haloframe_heritage_monthly', ref: 'Heritage Monthly', period: 'ONE_MONTH', price: '24.99', level: 2 },
  { productId: 'haloframe_heritage_annual', ref: 'Heritage Annual', period: 'ONE_YEAR', price: '199.00', level: 3 },
];
const ONETIME = [
  { productId: 'haloframe_topup_4pack', ref: '4-Tribute Pack', price: '7.99' },
  { productId: 'haloframe_topup_single', ref: 'Single Tribute', price: '2.49' },
];

// ---- price points (paginated; match USA customerPrice) ------------------
async function findPricePoint(basePath, usd) {
  let path = `${basePath}?filter[territory]=USA&limit=200`;
  for (let page = 0; page < 10 && path; page++) {
    const r = await api('GET', path);
    if (!r.ok) throw new Error(`price points ${r.status}: ${errText(r)}`);
    const hit = (r.json.data || []).find((p) => parseFloat(p.attributes.customerPrice) === parseFloat(usd));
    if (hit) return hit.id;
    const next = r.json.links?.next;
    path = next ? next.replace('https://api.appstoreconnect.apple.com', '') : null;
  }
  return null;
}

// ---- review-screenshot upload (reserve -> PUT -> commit) ----------------
async function uploadReviewScreenshot(reserveType, relKey, productObjId) {
  let bytes;
  try { bytes = readFileSync(REVIEW_SHOT); } catch { return { ok: false, msg: `screenshot file missing (${REVIEW_SHOT})` }; }
  const relType = relKey === 'subscription' ? 'subscriptions' : 'inAppPurchases';
  const reserve = await api('POST', `/v1/${reserveType}`, {
    data: { type: reserveType, attributes: { fileName: 'review.png', fileSize: bytes.length }, relationships: { [relKey]: { data: { type: relType, id: productObjId } } } },
  });
  if (!reserve.ok) return { ok: false, msg: `reserve ${reserve.status}: ${errText(reserve)}` };
  const asset = reserve.json.data;
  for (const op of asset.attributes.uploadOperations || []) {
    const headers = {}; for (const h of op.requestHeaders || []) headers[h.name] = h.value;
    const slice = bytes.subarray(op.offset, op.offset + op.length);
    const up = await fetch(op.url, { method: op.method || 'PUT', headers, body: slice });
    if (!up.ok) return { ok: false, msg: `PUT ${up.status}` };
  }
  const checksum = createHash('md5').update(bytes).digest('hex');
  const commit = await api('PATCH', `/v1/${reserveType}/${asset.id}`, { data: { type: reserveType, id: asset.id, attributes: { uploaded: true, sourceFileChecksum: checksum } } });
  return commit.ok ? { ok: true } : { ok: false, msg: `commit ${commit.status}: ${errText(commit)}` };
}

// ---- run ----------------------------------------------------------------
const summary = [];
function rec(id, status, note) { summary.push({ id, status, note }); console.log(`  [${status}] ${id}${note ? ' — ' + note : ''}`); }

// existing products
const existingSubs = new Set(), existingOne = new Set();
{
  const g = await api('GET', `/v1/apps/${APP_ID}/subscriptionGroups?include=subscriptions&limit=50`);
  for (const x of (g.json?.included || [])) if (x.type === 'subscriptions') existingSubs.add(x.attributes.productId);
  const o = await api('GET', `/v1/apps/${APP_ID}/inAppPurchasesV2?limit=200`);
  for (const x of (o.json?.data || [])) existingOne.add(x.attributes.productId);
}
console.log(`existing subs: [${[...existingSubs].join(', ') || 'none'}]  one-time: [${[...existingOne].join(', ') || 'none'}]`);

// subscription group
console.log('\n== Subscription group "tributes" ==');
let groupId;
{
  const g = await api('GET', `/v1/apps/${APP_ID}/subscriptionGroups?limit=50`);
  groupId = (g.json?.data || []).find((x) => x.attributes.referenceName === GROUP_REF)?.id;
  if (groupId) { rec(GROUP_REF, 'EXISTS', groupId); }
  else {
    const r = await api('POST', '/v1/subscriptionGroups', { data: { type: 'subscriptionGroups', attributes: { referenceName: GROUP_REF }, relationships: { app: { data: { type: 'apps', id: APP_ID } } } } });
    if (!r.ok) { rec(GROUP_REF, 'FAIL', `create group: ${errText(r)}`); process.exit(1); }
    groupId = r.json.data.id; rec(GROUP_REF, 'CREATED', groupId);
  }
  // group localization (customer-facing group name)
  const gl = await api('GET', `/v1/subscriptionGroups/${groupId}/subscriptionGroupLocalizations`);
  if (!(gl.json?.data || []).some((x) => x.attributes.locale === 'en-US')) {
    const r = await api('POST', '/v1/subscriptionGroupLocalizations', { data: { type: 'subscriptionGroupLocalizations', attributes: { locale: 'en-US', name: 'Tributes' }, relationships: { subscriptionGroup: { data: { type: 'subscriptionGroups', id: groupId } } } } });
    console.log(`  group en-US localization: ${r.ok ? 'created' : 'FAIL ' + errText(r)}`);
  }
}

// subscriptions
console.log('\n== Subscriptions ==');
for (const s of SUBS) {
  if (existingSubs.has(s.productId)) { rec(s.productId, 'EXISTS'); continue; }
  const { display, description } = readIapCopy(s.productId);
  const create = await api('POST', '/v1/subscriptions', { data: { type: 'subscriptions', attributes: { name: s.ref, productId: s.productId, subscriptionPeriod: s.period, familySharable: false, groupLevel: s.level, reviewNote: REVIEW_NOTE }, relationships: { group: { data: { type: 'subscriptionGroups', id: groupId } } } } });
  if (!create.ok) { rec(s.productId, 'FAIL', `create: ${errText(create)}`); continue; }
  const subId = create.json.data.id;
  const loc = await api('POST', '/v1/subscriptionLocalizations', { data: { type: 'subscriptionLocalizations', attributes: { locale: 'en-US', name: display, description }, relationships: { subscription: { data: { type: 'subscriptions', id: subId } } } } });
  let priceMsg = 'no price';
  const pp = await findPricePoint(`/v1/subscriptions/${subId}/pricePoints`, s.price).catch((e) => { priceMsg = e.message; return null; });
  if (pp) {
    const pr = await api('POST', '/v1/subscriptionPrices', { data: { type: 'subscriptionPrices', attributes: { startDate: null, preserveCurrentPrice: false }, relationships: { subscription: { data: { type: 'subscriptions', id: subId } }, subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: pp } } } } });
    priceMsg = pr.ok ? `$${s.price} set` : `price FAIL ${errText(pr)}`;
  } else if (priceMsg === 'no price') priceMsg = `no $${s.price} USA price point found`;
  const shot = await uploadReviewScreenshot('subscriptionAppStoreReviewScreenshots', 'subscription', subId);
  rec(s.productId, 'CREATED', `${display} | ${loc.ok ? 'loc ok' : 'loc FAIL'} | ${priceMsg} | screenshot ${shot.ok ? 'ok' : 'MANUAL (' + shot.msg + ')'}`);
}

// one-time
console.log('\n== One-time (NON_RENEWING_SUBSCRIPTION) ==');
for (const o of ONETIME) {
  if (existingOne.has(o.productId)) { rec(o.productId, 'EXISTS'); continue; }
  const { display, description } = readIapCopy(o.productId);
  const create = await api('POST', '/v2/inAppPurchases', { data: { type: 'inAppPurchases', attributes: { name: o.ref, productId: o.productId, inAppPurchaseType: 'NON_RENEWING_SUBSCRIPTION', reviewNote: REVIEW_NOTE, familySharable: false }, relationships: { app: { data: { type: 'apps', id: APP_ID } } } } });
  if (!create.ok) { rec(o.productId, 'FAIL', `create: ${errText(create)}`); continue; }
  const iapId = create.json.data.id;
  const loc = await api('POST', '/v1/inAppPurchaseLocalizations', { data: { type: 'inAppPurchaseLocalizations', attributes: { locale: 'en-US', name: display, description }, relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id: iapId } } } } });
  let priceMsg = 'no price';
  const pp = await findPricePoint(`/v2/inAppPurchases/${iapId}/pricePoints`, o.price).catch((e) => { priceMsg = e.message; return null; });
  if (pp) {
    const tmp = `price-${iapId}`;
    const pr = await api('POST', '/v1/inAppPurchasePriceSchedules', {
      data: { type: 'inAppPurchasePriceSchedules', relationships: { inAppPurchase: { data: { type: 'inAppPurchases', id: iapId } }, manualPrices: { data: [{ type: 'inAppPurchasePrices', id: tmp }] }, baseTerritory: { data: { type: 'territories', id: 'USA' } } } },
      included: [{ type: 'inAppPurchasePrices', id: tmp, attributes: { startDate: null }, relationships: { inAppPurchasePricePoint: { data: { type: 'inAppPurchasePricePoints', id: pp } } } }],
    });
    priceMsg = pr.ok ? `$${o.price} set` : `price FAIL ${errText(pr)}`;
  } else if (priceMsg === 'no price') priceMsg = `no $${o.price} USA price point found`;
  const shot = await uploadReviewScreenshot('inAppPurchaseAppStoreReviewScreenshots', 'inAppPurchaseV2', iapId);
  rec(o.productId, 'CREATED', `${display} | ${loc.ok ? 'loc ok' : 'loc FAIL'} | ${priceMsg} | screenshot ${shot.ok ? 'ok' : 'MANUAL (' + shot.msg + ')'}`);
}

console.log('\n===== SUMMARY =====');
for (const s of summary) console.log(`  ${s.status.padEnd(8)} ${s.id}${s.note ? ' — ' + s.note : ''}`);
const failed = summary.filter((s) => s.status === 'FAIL');
console.log(failed.length ? `\n❌ ${failed.length} product(s) failed — see above.` : '\n✅ All 5 products present (created or pre-existing).');
process.exit(failed.length ? 1 : 0);
