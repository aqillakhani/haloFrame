// ASC TestFlight build status + submission helper.
//
// Reads creds from .env.codemagic.local; ES256-JWT auth shared with
// the rest of the asc-*.mjs scripts.
//
// Subcommands:
//   (default)                — list builds for app 6768356716,
//                              newest first, with processing + beta state.
//   set-compliance <buildId> [yes|no]
//                            — PATCH /builds/{id} with
//                              usesNonExemptEncryption (default no).
//                              Clears the "Missing Compliance" gate.
//   set-test-notes <buildId> — POST or PATCH the en-US
//                              betaBuildLocalization for this build,
//                              using whatToTest copy from
//                              docs/TESTFLIGHT_NOTES.md.
//   set-app-beta-info        — PATCH BetaAppReviewDetail (contact +
//                              demo account + reviewer notes) and
//                              POST/PATCH en-US BetaAppLocalization
//                              (description + URLs). Reads
//                              REVIEWER_PASSWORD and (optional)
//                              REVIEWER_CONTACT_PHONE from
//                              .env.codemagic.local. Required once
//                              per app before the first external
//                              submission.
//   submit-external <buildId>
//                            — POST /betaAppReviewSubmissions to send
//                              the build to Apple's external-beta
//                              review queue.
//   review-status [buildId]  — GET /betaAppReviewSubmissions for the
//                              build (defaults to newest).
//
// Notes
// -----
// * Apple's beta API treats internal vs external testing differently:
//     - internal: the build is auto-available to App Store Connect
//       team members as soon as `processingState=VALID` AND
//       compliance is answered.
//     - external: needs an explicit BetaAppReviewSubmission *and*
//       at least one external beta group association on the build.
//       The first external submission triggers a Beta App Review
//       (Apple human review, queue is 24h-7d in 2026).
// * `betaBuildLocalizations` for "What to Test" copy is required on
//   the *first* external submission for a given marketing version.
//   Use the `set-test-notes` subcommand to push the copy from
//   `docs/TESTFLIGHT_NOTES.md`; `submit-external` runs this check and
//   refuses to submit if the en-US localization is missing.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, createSign } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envPath = resolve(repoRoot, '.env.codemagic.local');

const APP_ID = '6768356716';
const BETA_GROUP_NAME = 'external testers';

// ---- .env loader (matches asc-bootstrap-testflight.mjs) -----------------
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
  console.error((r.text || '').slice(0, 1500));
  process.exit(1);
}

// ---- helpers ------------------------------------------------------------

async function listBuilds(limit = 5) {
  const include = [
    'preReleaseVersion',
    'buildBetaDetail',
    'betaBuildLocalizations',
    'betaGroups',
    'individualTesters',
  ].join(',');
  const url =
    `/v1/builds?filter[app]=${APP_ID}` +
    `&include=${include}` +
    `&sort=-uploadedDate&limit=${limit}`;
  const r = await api('GET', url);
  if (!r.ok) fail('list builds', r);
  return r.json;
}

function fmtDuration(ms) {
  if (ms < 0) return `${Math.abs(Math.round(ms / 1000))}s ahead`;
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  if (min < 1) return `${sec}s ago`;
  if (min < 60) return `${min}m ${sec}s ago`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m ago`;
}

function findIncluded(payload, type, id) {
  return (payload.included || []).find((x) => x.type === type && x.id === id) || null;
}

function summarizeBuild(b, payload) {
  const a = b.attributes || {};
  const rels = b.relationships || {};

  const preRelId = rels.preReleaseVersion?.data?.id;
  const preRel = preRelId ? findIncluded(payload, 'preReleaseVersions', preRelId) : null;
  const version = preRel?.attributes?.version || a.version || '?';

  const detailId = rels.buildBetaDetail?.data?.id;
  const detail = detailId ? findIncluded(payload, 'buildBetaDetails', detailId) : null;
  const intState = detail?.attributes?.internalBuildState || '—';
  const extState = detail?.attributes?.externalBuildState || '—';

  const groupIds = (rels.betaGroups?.data || []).map((d) => d.id);
  const groupNames = groupIds
    .map((gid) => findIncluded(payload, 'betaGroups', gid)?.attributes?.name)
    .filter(Boolean);

  const uploadedMs = a.uploadedDate ? Date.parse(a.uploadedDate) : null;
  const ago = uploadedMs ? fmtDuration(Date.now() - uploadedMs) : '?';

  return {
    id: b.id,
    version,
    buildNumber: a.version, // confusingly: builds.attributes.version IS the build number
    processingState: a.processingState,
    expired: a.expired,
    usesNonExemptEncryption: a.usesNonExemptEncryption,
    minOsVersion: a.minOsVersion,
    uploaded: a.uploadedDate,
    uploadedAgo: ago,
    expiresAt: a.expirationDate,
    internalBuildState: intState,
    externalBuildState: extState,
    betaGroups: groupNames,
  };
}

function printBuild(s) {
  console.log(`Build ${s.id}`);
  console.log(`  version:                    ${s.version} (build #${s.buildNumber})`);
  console.log(`  uploaded:                   ${s.uploaded}  (${s.uploadedAgo})`);
  console.log(`  processingState:            ${s.processingState}`);
  console.log(`  usesNonExemptEncryption:    ${s.usesNonExemptEncryption}`);
  console.log(`  expired:                    ${s.expired}`);
  console.log(`  minOsVersion:               ${s.minOsVersion}`);
  console.log(`  internalBuildState:         ${s.internalBuildState}`);
  console.log(`  externalBuildState:         ${s.externalBuildState}`);
  console.log(`  betaGroups:                 ${s.betaGroups.length ? s.betaGroups.join(', ') : '(none)'}`);
  console.log(`  expiresAt:                  ${s.expiresAt}`);
}

// ---- commands -----------------------------------------------------------

async function cmdList() {
  const payload = await listBuilds(5);
  if (!payload.data?.length) {
    console.log('No builds visible for app ' + APP_ID + '.');
    console.log('If rc4 just uploaded, Apple typically takes 5-30 min to index it.');
    return;
  }
  console.log(`== Builds (newest first, ${payload.data.length} shown) ==\n`);
  for (const b of payload.data) {
    printBuild(summarizeBuild(b, payload));
    console.log();
  }
  // Readiness verdict on the newest
  const newest = summarizeBuild(payload.data[0], payload);
  console.log('== Verdict (newest build) ==');
  const blockers = [];
  if (newest.processingState !== 'VALID') blockers.push(`processingState=${newest.processingState} (need VALID)`);
  if (newest.expired) blockers.push('expired=true');
  if (newest.usesNonExemptEncryption == null) blockers.push('usesNonExemptEncryption=null (Missing Compliance)');
  if (blockers.length === 0) {
    console.log('  ✓ Eligible for internal TestFlight distribution.');
    if (newest.betaGroups.includes(BETA_GROUP_NAME)) {
      console.log(`  ✓ Already associated with "${BETA_GROUP_NAME}".`);
      console.log(`  → next: node scripts/asc-build-status.mjs submit-external ${newest.id}`);
    } else {
      console.log(`  ⓘ Not yet associated with "${BETA_GROUP_NAME}".`);
      console.log('     Submitting for external review will need that group attached. The');
      console.log('     submit-external command attaches it automatically.');
    }
  } else {
    console.log('  ❌ Blockers:');
    for (const b of blockers) console.log('     - ' + b);
    if (blockers.some((b) => b.includes('usesNonExemptEncryption'))) {
      console.log(`     → fix: node scripts/asc-build-status.mjs set-compliance ${newest.id} no`);
    }
  }
}

function readWhatToTest() {
  const notesPath = resolve(repoRoot, 'docs/TESTFLIGHT_NOTES.md');
  const md = readFileSync(notesPath, 'utf8');
  const m = md.match(/```whatToTest\s*\n([\s\S]*?)\n```/);
  if (!m) {
    console.error('docs/TESTFLIGHT_NOTES.md is missing a ```whatToTest fenced block.');
    process.exit(1);
  }
  // Sanitize before length-checking so we measure what actually hits Apple.
  // ASC_EMOJI_BLOCKS is declared further down the file but JS function
  // hoisting makes this safe at call time.
  const text = sanitizeForAsc(m[1]);
  if (text.length === 0) {
    console.error('whatToTest block in docs/TESTFLIGHT_NOTES.md is empty.');
    process.exit(1);
  }
  if (text.length > 4000) {
    console.error(`whatToTest is ${text.length} chars; Apple's limit is 4000.`);
    process.exit(1);
  }
  return text;
}

async function getEnUsLocalization(buildId) {
  const r = await api('GET', `/v1/builds/${buildId}/betaBuildLocalizations?limit=50`);
  if (!r.ok) fail('list betaBuildLocalizations', r);
  return (r.json.data || []).find((d) => d.attributes?.locale === 'en-US') || null;
}

async function cmdSetTestNotes(buildId) {
  if (!buildId) {
    console.error('usage: set-test-notes <buildId>');
    process.exit(2);
  }
  const whatToTest = readWhatToTest();
  console.log(`whatToTest length: ${whatToTest.length} chars`);

  // ASC API exposes this as `whatsNew`, not `whatToTest`. The UI label
  // ("What to Test") is unchanged but the JSON attribute is `whatsNew`.
  let existing = await getEnUsLocalization(buildId);
  if (!existing) {
    console.log('creating en-US localization');
    const r = await api('POST', '/v1/betaBuildLocalizations', {
      data: {
        type: 'betaBuildLocalizations',
        attributes: { locale: 'en-US', whatsNew: whatToTest },
        relationships: { build: { data: { type: 'builds', id: buildId } } },
      },
    });
    if (!r.ok) fail('POST betaBuildLocalization', r);
    existing = r.json.data;
    console.log(`  ✓ created · id=${existing.id}`);
  } else {
    console.log(`updating existing en-US localization ${existing.id}`);
    const r = await api('PATCH', `/v1/betaBuildLocalizations/${existing.id}`, {
      data: {
        type: 'betaBuildLocalizations',
        id: existing.id,
        attributes: { whatsNew: whatToTest },
      },
    });
    if (!r.ok) fail('PATCH betaBuildLocalization', r);
    console.log('✓ updated.');
  }
}

// ---- App-level beta metadata helpers ------------------------------------

const REVIEWER_EMAIL = 'reviewer@gethaloframe.com';
const CONTACT_FIRST = 'Aqil';
const CONTACT_LAST = 'Lakhani';
const CONTACT_EMAIL = 'aqil.lakhani8@gmail.com';
const SUPPORT_EMAIL = 'support@gethaloframe.com';
const MARKETING_URL = 'https://gethaloframe.com';
const PRIVACY_URL = 'https://gethaloframe.com/privacy';

// Apple's text validator rejects emoji + most pictograph unicode (the
// build-localization PATCH explicitly rejected ✨ U+2728). Strip the
// common offender blocks and collapse the whitespace that opens up.
const ASC_EMOJI_BLOCKS = new RegExp(
  '[' +
    '\\u{1F000}-\\u{1FFFF}' + // Mahjong / Domino / Playing Cards / Symbols & Pictographs / Emoticons / Transport & Map / Supplemental Symbols / Chess / Symbols For Legacy / Symbols And Pictographs Extended-A
    '\\u{2600}-\\u{26FF}' +   // Miscellaneous Symbols (includes ☀ ⚡ ⛰ etc.)
    '\\u{2700}-\\u{27BF}' +   // Dingbats (includes ✨ ✅ ❌ etc.)
    '\\u{2300}-\\u{23FF}' +   // Miscellaneous Technical (⏰ ⌛ etc.)
    '\\u{2B00}-\\u{2BFF}' +   // Miscellaneous Symbols and Arrows
    '\\u{FE00}-\\u{FE0F}' +   // Variation Selectors (text-vs-emoji)
    '\\u{200D}' +              // Zero Width Joiner used in compound emoji
  ']',
  'gu',
);

function sanitizeForAsc(text) {
  return text
    .replace(ASC_EMOJI_BLOCKS, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ \n/g, '\n')
    .trim();
}

function extractFirstFencedBlock(md, headerRegex) {
  // Find the header, then the first triple-backtick fenced block after it.
  const idx = md.search(headerRegex);
  if (idx < 0) throw new Error(`could not find section header matching ${headerRegex}`);
  const after = md.slice(idx);
  const m = after.match(/```[a-z]*\s*\n([\s\S]*?)\n```/);
  if (!m) throw new Error(`no fenced block after header ${headerRegex}`);
  return m[1].trim();
}

function readDescription() {
  const md = readFileSync(resolve(repoRoot, 'docs/STORE_LISTINGS.md'), 'utf8');
  const raw = extractFirstFencedBlock(md, /^### 1\.3 Description.*$/m);
  const clean = sanitizeForAsc(raw);
  if (clean.length > 4000) throw new Error(`description ${clean.length} > 4000 chars`);
  return clean;
}

function readReviewerNotes() {
  // BETA_REVIEW_NOTES.md is the trimmed-to-4000ch version targeted at the
  // beta-review team. REVIEWER_NOTES.md is the longer App-Store-review
  // version and exceeds the beta-notes limit.
  const md = readFileSync(resolve(repoRoot, 'docs/BETA_REVIEW_NOTES.md'), 'utf8');
  const raw = extractFirstFencedBlock(md, /^## en-US notes/m);
  const clean = sanitizeForAsc(raw);
  if (clean.length > 4000) throw new Error(`reviewer notes ${clean.length} > 4000 chars`);
  return clean;
}

async function cmdSetAppBetaInfo() {
  const password = env.REVIEWER_PASSWORD;
  if (!password) {
    console.error('❌ REVIEWER_PASSWORD missing from .env.codemagic.local.');
    console.error('   Add a line like: REVIEWER_PASSWORD=<paste-from-1Password>');
    process.exit(2);
  }
  const phone = env.REVIEWER_CONTACT_PHONE || null;

  const description = readDescription();
  const notes = readReviewerNotes();
  console.log(`description: ${description.length} chars`);
  console.log(`notes:       ${notes.length} chars`);
  console.log(`phone:       ${phone || '(not provided — email-only contact)'}`);

  // 1. PATCH /v1/betaAppReviewDetails/{appId}
  console.log('\n== PATCH BetaAppReviewDetail ==');
  const detailAttrs = {
    contactFirstName: CONTACT_FIRST,
    contactLastName: CONTACT_LAST,
    contactEmail: CONTACT_EMAIL,
    demoAccountRequired: true,
    demoAccountName: REVIEWER_EMAIL,
    demoAccountPassword: password,
    notes,
  };
  if (phone) detailAttrs.contactPhone = phone;
  const detailResp = await api('PATCH', `/v1/betaAppReviewDetails/${APP_ID}`, {
    data: {
      type: 'betaAppReviewDetails',
      id: APP_ID,
      attributes: detailAttrs,
    },
  });
  if (!detailResp.ok) fail('PATCH betaAppReviewDetail', detailResp);
  console.log('  ✓ contact + demo account + notes set');

  // 2. POST or PATCH /v1/betaAppLocalizations en-US
  console.log('\n== Ensure en-US BetaAppLocalization ==');
  const listResp = await api('GET', `/v1/apps/${APP_ID}/betaAppLocalizations`);
  if (!listResp.ok) fail('list betaAppLocalizations', listResp);
  const enUs = (listResp.json.data || []).find((d) => d.attributes?.locale === 'en-US');
  const locAttrs = {
    description,
    feedbackEmail: SUPPORT_EMAIL,
    marketingUrl: MARKETING_URL,
    privacyPolicyUrl: PRIVACY_URL,
  };
  if (enUs) {
    console.log(`  updating existing en-US localization ${enUs.id}`);
    const r = await api('PATCH', `/v1/betaAppLocalizations/${enUs.id}`, {
      data: {
        type: 'betaAppLocalizations',
        id: enUs.id,
        attributes: locAttrs,
      },
    });
    if (!r.ok) fail('PATCH betaAppLocalization', r);
    console.log('  ✓ updated');
  } else {
    console.log('  creating en-US localization');
    const r = await api('POST', '/v1/betaAppLocalizations', {
      data: {
        type: 'betaAppLocalizations',
        attributes: { locale: 'en-US', ...locAttrs },
        relationships: { app: { data: { type: 'apps', id: APP_ID } } },
      },
    });
    if (!r.ok) fail('POST betaAppLocalization', r);
    console.log('  ✓ created');
  }
  console.log('\n== Done. Re-check submit eligibility with:');
  console.log('   node scripts/asc-build-status.mjs');
}

async function cmdSetCompliance(buildId, answer) {
  if (!buildId) {
    console.error('usage: set-compliance <buildId> [yes|no]');
    process.exit(2);
  }
  const useEncryption = (answer || 'no').toLowerCase() === 'yes';
  const r = await api('PATCH', `/v1/builds/${buildId}`, {
    data: {
      type: 'builds',
      id: buildId,
      attributes: { usesNonExemptEncryption: useEncryption },
    },
  });
  if (!r.ok) fail('PATCH build compliance', r);
  console.log(`✓ Set usesNonExemptEncryption=${useEncryption} on build ${buildId}`);
}

async function ensureExternalGroupAttached(buildId) {
  // Get group id by name.
  const groupsResp = await api('GET', `/v1/betaGroups?filter[app]=${APP_ID}&limit=50`);
  if (!groupsResp.ok) fail('list beta groups', groupsResp);
  const group = groupsResp.json.data.find((g) => g.attributes?.name === BETA_GROUP_NAME);
  if (!group) {
    console.error(`No beta group named "${BETA_GROUP_NAME}". Run scripts/asc-bootstrap-testflight.mjs first.`);
    process.exit(1);
  }
  // Already attached?
  const buildsInGroup = await api(
    'GET',
    `/v1/betaGroups/${group.id}/relationships/builds?limit=200`,
  );
  if (!buildsInGroup.ok) fail('list builds in group', buildsInGroup);
  const already = buildsInGroup.json.data?.some((d) => d.id === buildId);
  if (already) {
    console.log(`  ✓ build already attached to group "${BETA_GROUP_NAME}"`);
    return group.id;
  }
  // Attach.
  const attach = await api(
    'POST',
    `/v1/betaGroups/${group.id}/relationships/builds`,
    { data: [{ type: 'builds', id: buildId }] },
  );
  if (!attach.ok) fail('attach build to group', attach);
  console.log(`  ✓ attached build ${buildId} to "${BETA_GROUP_NAME}"`);
  return group.id;
}

async function cmdSubmitExternal(buildId) {
  if (!buildId) {
    console.error('usage: submit-external <buildId>');
    process.exit(2);
  }

  // Re-fetch the build to verify processing + compliance before the submit.
  const r = await api('GET', `/v1/builds/${buildId}?include=buildBetaDetail`);
  if (!r.ok) fail('GET build', r);
  const b = r.json.data;
  const a = b.attributes || {};
  console.log(`== Build ${buildId} state ==`);
  console.log(`  processingState: ${a.processingState}`);
  console.log(`  usesNonExemptEncryption: ${a.usesNonExemptEncryption}`);
  console.log(`  expired: ${a.expired}`);
  if (a.processingState !== 'VALID') {
    console.error(`\n❌ refuse: processingState=${a.processingState} (need VALID).`);
    process.exit(1);
  }
  if (a.usesNonExemptEncryption == null) {
    console.error('\n❌ refuse: compliance not answered. Run set-compliance first.');
    process.exit(1);
  }
  if (a.expired) {
    console.error('\n❌ refuse: build is expired.');
    process.exit(1);
  }

  console.log('\n== Verify en-US "What to Test" copy ==');
  const enUs = await getEnUsLocalization(buildId);
  if (!enUs || !enUs.attributes?.whatsNew) {
    console.error('❌ refuse: no en-US betaBuildLocalization with whatsNew set.');
    console.error(`   → fix: node scripts/asc-build-status.mjs set-test-notes ${buildId}`);
    process.exit(1);
  }
  console.log(`  ✓ en-US notes present (${enUs.attributes.whatsNew.length} chars)`);

  console.log('\n== Attach beta group ==');
  await ensureExternalGroupAttached(buildId);

  console.log('\n== Submit for Beta App Review ==');
  const submit = await api('POST', '/v1/betaAppReviewSubmissions', {
    data: {
      type: 'betaAppReviewSubmissions',
      relationships: { build: { data: { type: 'builds', id: buildId } } },
    },
  });
  if (!submit.ok) {
    // 409 = already submitted. That's a no-op success.
    if (submit.status === 409) {
      console.log('  ✓ already submitted (409 conflict).');
      return;
    }
    fail('create betaAppReviewSubmission', submit);
  }
  const sub = submit.json.data;
  console.log(`  ✓ submitted · id=${sub.id}`);
  console.log(`     state: ${sub.attributes?.betaReviewState || '(unknown)'}`);
  console.log('     Apple beta-review queue is 24h-7d in 2026.');
}

async function cmdReviewStatus(buildId) {
  if (!buildId) {
    const payload = await listBuilds(1);
    buildId = payload.data?.[0]?.id;
    if (!buildId) {
      console.error('no builds visible');
      process.exit(1);
    }
    console.log(`(using newest build: ${buildId})`);
  }
  const r = await api(
    'GET',
    `/v1/betaAppReviewSubmissions?filter[build]=${buildId}`,
  );
  if (!r.ok) fail('list submissions', r);
  if (!r.json.data?.length) {
    console.log('No beta-review submission exists for that build yet.');
    return;
  }
  for (const s of r.json.data) {
    console.log(`Submission ${s.id}`);
    for (const [k, v] of Object.entries(s.attributes || {})) {
      console.log(`  ${k}: ${v}`);
    }
  }
}

// ---- entry --------------------------------------------------------------
const [, , sub, ...rest] = process.argv;
try {
  switch (sub) {
    case undefined:
    case 'list':
      await cmdList();
      break;
    case 'set-compliance':
      await cmdSetCompliance(rest[0], rest[1]);
      break;
    case 'set-test-notes':
      await cmdSetTestNotes(rest[0]);
      break;
    case 'set-app-beta-info':
      await cmdSetAppBetaInfo();
      break;
    case 'submit-external':
      await cmdSubmitExternal(rest[0]);
      break;
    case 'review-status':
      await cmdReviewStatus(rest[0]);
      break;
    default:
      console.error(`unknown subcommand: ${sub}`);
      console.error('subcommands: list | set-compliance <buildId> [yes|no] | set-test-notes <buildId> | set-app-beta-info | submit-external <buildId> | review-status [buildId]');
      process.exit(2);
  }
} catch (err) {
  console.error('uncaught:', err);
  process.exit(1);
}
