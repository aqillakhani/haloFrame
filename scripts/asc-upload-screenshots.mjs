// Upload App Store listing screenshots (iPhone 6.7", APP_IPHONE_67) to the
// editable version's en-US localization. Idempotent: skips if the set
// already has screenshots.
//   node scripts/asc-upload-screenshots.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, createSign, createHash } from 'node:crypto';
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envPath = resolve(repoRoot, '.env.codemagic.local');
const APP_ID = '6768356716';
const DISPLAY_TYPE = 'APP_IPHONE_67';
const SHOT_DIR = resolve(repoRoot, 'docs/screenshots/apple-6.7');
const SHOT_FILES = ['02.png', '03.png', '04.png', '05.png', '06.png', '07.png']; // 01.png is mislabeled (landscape); 02-07 are 1290x2796
function loadEnv(text){const out={};const lines=text.split('\n');for(let i=0;i<lines.length;i++){const line=lines[i];if(!line||line.startsWith('#'))continue;const m=line.match(/^([A-Z_]+)=(.*)$/);if(!m)continue;const[,k,rv]=m;let v=rv;if(v.startsWith('"')&&!v.endsWith('"')){while(i+1<lines.length&&!lines[i+1].endsWith('"')){i++;v+='\n'+lines[i];}if(i+1<lines.length){i++;v+='\n'+lines[i];}}if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);out[k]=v;}return out;}
const env=loadEnv(readFileSync(envPath,'utf8'));
const KEY_ID=env.APP_STORE_CONNECT_KEY_IDENTIFIER,ISSUER_ID=env.APP_STORE_CONNECT_ISSUER_ID,PK=env.APP_STORE_CONNECT_PRIVATE_KEY;
const b64=(b)=>Buffer.from(b).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
function d2j(d){let o=2;if(d[1]&0x80)o=2+(d[1]&0x7f);o++;const rl=d[o++];let r=d.slice(o,o+rl);o+=rl;o++;const sl=d[o++];let s=d.slice(o,o+sl);while(r.length&&r[0]===0)r=r.slice(1);while(s.length&&s[0]===0)s=s.slice(1);const p=(x)=>Buffer.concat([Buffer.alloc(32-x.length),x]);return Buffer.concat([p(r),p(s)]);}
function jwt(){const n=Math.floor(Date.now()/1000);const h=b64(JSON.stringify({alg:'ES256',kid:KEY_ID,typ:'JWT'}));const bd=b64(JSON.stringify({iss:ISSUER_ID,iat:n,exp:n+1080,aud:'appstoreconnect-v1'}));const sg=createSign('SHA256');sg.update(`${h}.${bd}`);sg.end();return `${h}.${bd}.${b64(d2j(sg.sign(createPrivateKey(PK))))}`;}
const T=jwt();
async function api(m,p,b){const r=await fetch('https://api.appstoreconnect.apple.com'+p,{method:m,headers:{Authorization:'Bearer '+T,Accept:'application/json',...(b?{'Content-Type':'application/json'}:{})},body:b?JSON.stringify(b):undefined});const t=await r.text();let j=null;try{j=JSON.parse(t);}catch{}return{ok:r.ok,status:r.status,json:j,text:t};}
const errText=(r)=>(r.json?.errors?.map(e=>e.detail||e.title).join('; ')||r.text||'').slice(0,300);

// resolve en-US version localization
const EDITABLE = new Set(['PREPARE_FOR_SUBMISSION','DEVELOPER_REJECTED','REJECTED','METADATA_REJECTED','INVALID_BINARY','WAITING_FOR_REVIEW']);
const vr = await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?include=appStoreVersionLocalizations&limit=10`);
const version = (vr.json.data||[]).find(v=>EDITABLE.has(v.attributes.appStoreState||v.attributes.appVersionState)) || vr.json.data?.[0];
const locId = (vr.json.included||[]).find(x=>x.type==='appStoreVersionLocalizations'&&x.attributes.locale==='en-US')?.id;
if (!locId){console.error('no en-US version localization');process.exit(1);}
console.log(`version ${version.id} (v${version.attributes.versionString}) en-US loc ${locId}`);

// ensure screenshot set
const setsResp = await api('GET', `/v1/appStoreVersionLocalizations/${locId}/appScreenshotSets?include=appScreenshots`);
let set = (setsResp.json.data||[]).find(s=>s.attributes.screenshotDisplayType===DISPLAY_TYPE);
let existing = 0;
if (set) {
  existing = (set.relationships?.appScreenshots?.data||[]).length;
  console.log(`set ${set.id} (${DISPLAY_TYPE}) exists with ${existing} screenshot(s)`);
} else {
  const r = await api('POST', '/v1/appScreenshotSets', { data:{ type:'appScreenshotSets', attributes:{ screenshotDisplayType:DISPLAY_TYPE }, relationships:{ appStoreVersionLocalization:{ data:{ type:'appStoreVersionLocalizations', id:locId } } } } });
  if (!r.ok){console.error('create set failed:', errText(r));process.exit(1);}
  set = r.json.data; console.log(`created set ${set.id} (${DISPLAY_TYPE})`);
}
if (existing >= SHOT_FILES.length) { console.log(`\n✅ set already has ${existing} screenshots — nothing to do.`); process.exit(0); }

// upload each
let done = 0;
for (const f of SHOT_FILES) {
  const bytes = readFileSync(resolve(SHOT_DIR, f));
  const reserve = await api('POST', '/v1/appScreenshots', { data:{ type:'appScreenshots', attributes:{ fileName:f, fileSize:bytes.length }, relationships:{ appScreenshotSet:{ data:{ type:'appScreenshotSets', id:set.id } } } } });
  if (!reserve.ok){console.log(`  ✗ ${f}: reserve ${reserve.status} ${errText(reserve)}`);continue;}
  const asset = reserve.json.data;
  let putOk = true;
  for (const op of asset.attributes.uploadOperations||[]) {
    const headers={}; for (const h of op.requestHeaders||[]) headers[h.name]=h.value;
    const up = await fetch(op.url, { method:op.method||'PUT', headers, body:bytes.subarray(op.offset, op.offset+op.length) });
    if (!up.ok){putOk=false;console.log(`  ✗ ${f}: PUT ${up.status}`);break;}
  }
  if (!putOk) continue;
  const checksum = createHash('md5').update(bytes).digest('hex');
  const commit = await api('PATCH', `/v1/appScreenshots/${asset.id}`, { data:{ type:'appScreenshots', id:asset.id, attributes:{ uploaded:true, sourceFileChecksum:checksum } } });
  if (commit.ok){done++;console.log(`  ✓ ${f} uploaded`);} else console.log(`  ✗ ${f}: commit ${commit.status} ${errText(commit)}`);
}
console.log(done===SHOT_FILES.length ? `\n✅ ${done} screenshots uploaded.` : `\n⚠ ${done}/${SHOT_FILES.length} uploaded.`);
process.exit(done===SHOT_FILES.length?0:1);
