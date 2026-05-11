// List signing certificates on the Apple Developer team via ASC API.
// Used to diagnose Codemagic's "Cannot save Signing Certificates without
// certificate private key" error — if a distribution cert already exists
// on Apple's side and Codemagic doesn't have the private key, builds fail.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, createSign } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.codemagic.local');

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
        i++; val += '\n' + lines[i];
      }
      if (i + 1 < lines.length) { i++; val += '\n' + lines[i]; }
    }
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

const env = loadEnv(readFileSync(envPath, 'utf8'));
const { APP_STORE_CONNECT_KEY_IDENTIFIER: KEY_ID, APP_STORE_CONNECT_ISSUER_ID: ISSUER_ID, APP_STORE_CONNECT_PRIVATE_KEY: PRIVATE_KEY } = env;

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
function derToJose(der) {
  let offset = 2;
  if (der[1] & 0x80) offset = 2 + (der[1] & 0x7f);
  if (der[offset++] !== 0x02) throw new Error('Bad DER R');
  const rLen = der[offset++];
  let r = der.slice(offset, offset+rLen); offset+=rLen;
  if (der[offset++] !== 0x02) throw new Error('Bad DER S');
  const sLen = der[offset++];
  let s = der.slice(offset, offset+sLen);
  while (r.length && r[0]===0) r=r.slice(1);
  while (s.length && s[0]===0) s=s.slice(1);
  const pad = (buf) => Buffer.concat([Buffer.alloc(32-buf.length), buf]);
  return Buffer.concat([pad(r), pad(s)]);
}
const now = Math.floor(Date.now()/1000);
const head = b64url(JSON.stringify({alg:'ES256',kid:KEY_ID,typ:'JWT'}));
const body = b64url(JSON.stringify({iss:ISSUER_ID,iat:now,exp:now+1080,aud:'appstoreconnect-v1'}));
const signingInput = `${head}.${body}`;
const signer = createSign('SHA256');
signer.update(signingInput); signer.end();
const TOKEN = `${signingInput}.${b64url(derToJose(signer.sign(createPrivateKey(PRIVATE_KEY))))}`;

async function api(p) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${p}`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept:'application/json' }});
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${p}\n${t.slice(0,400)}`);
  return JSON.parse(t);
}

console.log('== Distribution + Development certificates on this Apple Developer team ==');
const certs = await api('/v1/certificates?limit=200');
const grouped = {};
for (const c of certs.data) {
  const t = c.attributes.certificateType;
  (grouped[t] ||= []).push(c);
}
for (const [type, list] of Object.entries(grouped)) {
  console.log(`\n${type} (${list.length}):`);
  for (const c of list) {
    const a = c.attributes;
    const isDist = /DISTRIBUTION/.test(type) || /APPLE_DISTRIBUTION/.test(type);
    const marker = isDist ? '⚠️ ' : '  ';
    console.log(`${marker}id=${c.id}  name="${a.name}"  serial=${a.serialNumber?.slice(0,16)}  expires=${a.expirationDate}`);
  }
}
console.log('\n== Provisioning profiles ==');
const profs = await api('/v1/profiles?limit=200&filter[profileState]=ACTIVE');
console.log(`active count: ${profs.data.length}`);
for (const p of profs.data) {
  const a = p.attributes;
  console.log(`  · id=${p.id}  name="${a.name}"  type=${a.profileType}  expires=${a.expirationDate}`);
}
