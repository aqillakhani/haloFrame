// READ-ONLY production-submit readiness check for haloFrame's App Store
// 1.0 version. Prints a green/red board of every submit prerequisite.
//   node scripts/asc-verify-production.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, createSign } from 'node:crypto';
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.codemagic.local');
const APP_ID = '6768356716';
function loadEnv(text){const out={};const lines=text.split('\n');for(let i=0;i<lines.length;i++){const line=lines[i];if(!line||line.startsWith('#'))continue;const m=line.match(/^([A-Z_]+)=(.*)$/);if(!m)continue;const[,k,rv]=m;let v=rv;if(v.startsWith('"')&&!v.endsWith('"')){while(i+1<lines.length&&!lines[i+1].endsWith('"')){i++;v+='\n'+lines[i];}if(i+1<lines.length){i++;v+='\n'+lines[i];}}if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);out[k]=v;}return out;}
const env=loadEnv(readFileSync(envPath,'utf8'));
const KEY_ID=env.APP_STORE_CONNECT_KEY_IDENTIFIER,ISSUER_ID=env.APP_STORE_CONNECT_ISSUER_ID,PK=env.APP_STORE_CONNECT_PRIVATE_KEY;
const b64=(b)=>Buffer.from(b).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
function d2j(d){let o=2;if(d[1]&0x80)o=2+(d[1]&0x7f);o++;const rl=d[o++];let r=d.slice(o,o+rl);o+=rl;o++;const sl=d[o++];let s=d.slice(o,o+sl);while(r.length&&r[0]===0)r=r.slice(1);while(s.length&&s[0]===0)s=s.slice(1);const p=(x)=>Buffer.concat([Buffer.alloc(32-x.length),x]);return Buffer.concat([p(r),p(s)]);}
function jwt(){const n=Math.floor(Date.now()/1000);const h=b64(JSON.stringify({alg:'ES256',kid:KEY_ID,typ:'JWT'}));const bd=b64(JSON.stringify({iss:ISSUER_ID,iat:n,exp:n+1080,aud:'appstoreconnect-v1'}));const sg=createSign('SHA256');sg.update(`${h}.${bd}`);sg.end();return `${h}.${bd}.${b64(d2j(sg.sign(createPrivateKey(PK))))}`;}
const T=jwt();
async function api(p){const r=await fetch('https://api.appstoreconnect.apple.com'+p,{headers:{Authorization:'Bearer '+T,Accept:'application/json'}});const t=await r.text();let j=null;try{j=JSON.parse(t);}catch{}return{ok:r.ok,status:r.status,json:j};}
const G='✓', R='✗', W='⚠';
const line=(mark,label,detail)=>console.log(`  ${mark} ${label}${detail?': '+detail:''}`);

console.log('===== haloFrame — App Store production-submit readiness =====\n');

// App-level: price (free)
const ps = await api(`/v1/apps/${APP_ID}/appPriceSchedule`);
line(ps.ok && ps.json?.data ? G : W, 'App price schedule (Free)', ps.ok && ps.json?.data ? 'set' : 'NOT set — pick Free in Pricing & Availability');

// Version + localization + build
const vr = await api(`/v1/apps/${APP_ID}/appStoreVersions?include=appStoreVersionLocalizations,build&limit=5`);
const ver = (vr.json.data||[]).find(v=>['PREPARE_FOR_SUBMISSION','DEVELOPER_REJECTED','REJECTED','METADATA_REJECTED','WAITING_FOR_REVIEW'].includes(v.attributes.appStoreState||v.attributes.appVersionState)) || vr.json.data?.[0];
const vstate = ver?.attributes.appStoreState||ver?.attributes.appVersionState;
const buildRel = ver?.relationships?.build?.data;
line(ver?G:R, `Version 1.0 (${vstate})`, ver?.id);
line(buildRel?G:R, 'Build attached', buildRel? (vr.json.included||[]).find(x=>x.id===buildRel.id)?.attributes?.version ? 'build #'+(vr.json.included||[]).find(x=>x.id===buildRel.id).attributes.version : buildRel.id : 'NONE');
const vloc = (vr.json.included||[]).find(x=>x.type==='appStoreVersionLocalizations'&&x.attributes.locale==='en-US');
const va = vloc?.attributes||{};
line(va.description?.length?G:R, 'Description', va.description?`${va.description.length}ch`:'EMPTY');
line(va.keywords?G:R, 'Keywords', va.keywords||'EMPTY');
line(va.promotionalText?G:R, 'Promotional text', va.promotionalText?`${va.promotionalText.length}ch`:'EMPTY');
line(va.supportUrl?G:R, 'Support URL', va.supportUrl||'EMPTY');

// Screenshots
let shots = 0;
if (vloc) { const ss = await api(`/v1/appStoreVersionLocalizations/${vloc.id}/appScreenshotSets?include=appScreenshots`); const set=(ss.json?.data||[]).find(s=>s.attributes.screenshotDisplayType==='APP_IPHONE_67'); shots=(set?.relationships?.appScreenshots?.data||[]).length; }
line(shots>=1?G:R, 'Screenshots (6.7")', shots? `${shots} uploaded`:'NONE');

// App info: subtitle + privacy + age rating
const ai = await api(`/v1/apps/${APP_ID}/appInfos?include=appInfoLocalizations,ageRatingDeclaration`);
const ail = (ai.json?.included||[]).find(x=>x.type==='appInfoLocalizations'&&x.attributes.locale==='en-US');
line(ail?.attributes.subtitle?G:R, 'Subtitle', ail?.attributes.subtitle||'EMPTY');
line(ail?.attributes.privacyPolicyUrl?G:R, 'Privacy Policy URL', ail?.attributes.privacyPolicyUrl||'EMPTY');
const decl=(ai.json?.included||[]).find(x=>x.type==='ageRatingDeclarations');
line(decl?G:W, 'Age rating declaration', decl?`override=${decl.attributes.ageRatingOverrideV2||decl.attributes.ageRatingOverride||'NONE'} (questionnaire filled → 4+)`:'missing');

// App Review Information
const rd = await api(`/v1/appStoreVersions/${ver.id}/appStoreReviewDetail`);
const rda = rd.json?.data?.attributes;
line(rda?.contactEmail?G:R, 'App Review Information', rda? `${rda.contactEmail}, demo ${rda.demoAccountName}, notes ${(rda.notes||'').length}ch`:'NOT set');

// IAP
console.log('\n  --- In-App Purchases ---');
const gr = await api(`/v1/apps/${APP_ID}/subscriptionGroups?include=subscriptions&limit=50`);
const subs = (gr.json?.included||[]).filter(x=>x.type==='subscriptions');
const wantSubs=['haloframe_keepsake_monthly','haloframe_heritage_monthly','haloframe_heritage_annual'];
for (const pid of wantSubs) {
  const s = subs.find(x=>x.attributes.productId===pid);
  if (!s){line(R, pid, 'MISSING');continue;}
  const [loc,price,shot] = await Promise.all([
    api(`/v1/subscriptions/${s.id}/subscriptionLocalizations?limit=1`),
    api(`/v1/subscriptions/${s.id}/prices?limit=1`),
    api(`/v1/subscriptions/${s.id}/appStoreReviewScreenshot`),
  ]);
  const hasLoc=(loc.json?.data||[]).length>0, hasPrice=(price.json?.data||[]).length>0, hasShot=!!shot.json?.data;
  line(hasLoc&&hasPrice&&hasShot?G:W, pid, `loc ${hasLoc?G:R} | price ${hasPrice?G:R} | screenshot ${hasShot?G:R} | state=${s.attributes.state}`);
}
const oneResp = await api(`/v1/apps/${APP_ID}/inAppPurchasesV2?limit=200`);
const ones=(oneResp.json?.data||[]);
const wantOne=['haloframe_topup_4pack','haloframe_topup_single'];
for (const pid of wantOne) {
  const o = ones.find(x=>x.attributes.productId===pid);
  if (!o){line(R, pid, 'MISSING');continue;}
  const [loc,sched,shot] = await Promise.all([
    api(`/v2/inAppPurchases/${o.id}/inAppPurchaseLocalizations?limit=1`),
    api(`/v2/inAppPurchases/${o.id}/iapPriceSchedule`),
    api(`/v2/inAppPurchases/${o.id}/appStoreReviewScreenshot`),
  ]);
  const hasLoc=(loc.json?.data||[]).length>0, hasPrice=!!sched.json?.data, hasShot=!!shot.json?.data;
  line(hasLoc&&hasPrice&&hasShot?G:W, pid, `${o.attributes.inAppPurchaseType} | loc ${hasLoc?G:R} | price ${hasPrice?G:R} | screenshot ${hasShot?G:R} | state=${o.attributes.state}`);
}
console.log('\nLegend: ✓ done · ✗ missing/blocker · ⚠ partial/manual. App Privacy (data types) is dashboard-only and not shown here.');
