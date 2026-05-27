// Set USD prices on the 5 IAP products created by asc-create-iap.mjs.
// Idempotent: skips a product that already has a price. Verbose on failure.
//   node scripts/asc-fix-iap-prices.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, createSign } from 'node:crypto';
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.codemagic.local');
const APP_ID = '6768356716';
function loadEnv(text){const out={};const lines=text.split('\n');for(let i=0;i<lines.length;i++){const line=lines[i];if(!line||line.startsWith('#'))continue;const m=line.match(/^([A-Z_]+)=(.*)$/);if(!m)continue;const[,k,rv]=m;let v=rv;if(v.startsWith('"')&&!v.endsWith('"')){while(i+1<lines.length&&!lines[i+1].endsWith('"')){i++;v+='\n'+lines[i];}if(i+1<lines.length){i++;v+='\n'+lines[i];}}if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);out[k]=v;}return out;}
const env=loadEnv(readFileSync(envPath,'utf8'));
const KEY_ID=env.APP_STORE_CONNECT_KEY_IDENTIFIER,ISSUER_ID=env.APP_STORE_CONNECT_ISSUER_ID,PRIVATE_KEY=env.APP_STORE_CONNECT_PRIVATE_KEY;
const b64=(b)=>Buffer.from(b).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
function d2j(d){let o=2;if(d[1]&0x80)o=2+(d[1]&0x7f);o++;const rl=d[o++];let r=d.slice(o,o+rl);o+=rl;o++;const sl=d[o++];let s=d.slice(o,o+sl);while(r.length&&r[0]===0)r=r.slice(1);while(s.length&&s[0]===0)s=s.slice(1);const p=(x)=>Buffer.concat([Buffer.alloc(32-x.length),x]);return Buffer.concat([p(r),p(s)]);}
function jwt(){const n=Math.floor(Date.now()/1000);const h=b64(JSON.stringify({alg:'ES256',kid:KEY_ID,typ:'JWT'}));const bd=b64(JSON.stringify({iss:ISSUER_ID,iat:n,exp:n+1080,aud:'appstoreconnect-v1'}));const sg=createSign('SHA256');sg.update(`${h}.${bd}`);sg.end();return `${h}.${bd}.${b64(d2j(sg.sign(createPrivateKey(PRIVATE_KEY))))}`;}
const T=jwt();
async function api(method,path,body){const r=await fetch(`https://api.appstoreconnect.apple.com${path}`,{method,headers:{Authorization:`Bearer ${T}`,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const t=await r.text();let j=null;if(t){try{j=JSON.parse(t);}catch{}}return{ok:r.ok,status:r.status,text:t,json:j};}

const SUB_PRICES = { haloframe_keepsake_monthly: '9.99', haloframe_heritage_monthly: '24.99', haloframe_heritage_annual: '199.00' };
const ONE_PRICES = { haloframe_topup_4pack: '7.99', haloframe_topup_single: '2.49' };

async function findPricePoint(basePath, usd) {
  let path = `${basePath}?filter[territory]=USA&limit=200`;
  for (let p = 0; p < 10 && path; p++) {
    const r = await api('GET', path);
    if (!r.ok) throw new Error(`pricePoints ${r.status}`);
    const hit = (r.json.data || []).find((x) => parseFloat(x.attributes.customerPrice) === parseFloat(usd));
    if (hit) return hit.id;
    path = r.json.links?.next ? r.json.links.next.replace('https://api.appstoreconnect.apple.com', '') : null;
  }
  return null;
}

// map productId -> object id
const subMap = {}, oneMap = {};
{
  const g = await api('GET', `/v1/apps/${APP_ID}/subscriptionGroups?include=subscriptions&limit=50`);
  for (const x of (g.json?.included || [])) if (x.type === 'subscriptions') subMap[x.attributes.productId] = x.id;
  const o = await api('GET', `/v1/apps/${APP_ID}/inAppPurchasesV2?limit=200`);
  for (const x of (o.json?.data || [])) oneMap[x.attributes.productId] = x.id;
}

console.log('== Subscriptions ==');
for (const [pid, usd] of Object.entries(SUB_PRICES)) {
  const id = subMap[pid];
  if (!id) { console.log(`  ✗ ${pid}: subscription not found`); continue; }
  const existing = await api('GET', `/v1/subscriptions/${id}/prices?limit=1`);
  if (existing.ok && (existing.json.data || []).length) { console.log(`  = ${pid}: already priced`); continue; }
  const point = await findPricePoint(`/v1/subscriptions/${id}/pricePoints`, usd);
  if (!point) { console.log(`  ✗ ${pid}: no $${usd} USA point`); continue; }
  // subscription initial price: relationships only, no attributes
  const r = await api('POST', '/v1/subscriptionPrices', {
    data: { type: 'subscriptionPrices',
      relationships: { subscription: { data: { type: 'subscriptions', id } }, subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: point } } } },
  });
  if (r.ok) console.log(`  ✓ ${pid}: $${usd} set`);
  else console.log(`  ✗ ${pid}: ${r.status} ${JSON.stringify(r.json?.errors || r.text).slice(0, 600)}`);
}

console.log('\n== One-time ==');
for (const [pid, usd] of Object.entries(ONE_PRICES)) {
  const id = oneMap[pid];
  if (!id) { console.log(`  ✗ ${pid}: IAP not found`); continue; }
  const existing = await api('GET', `/v2/inAppPurchases/${id}/iapPriceSchedule`);
  if (existing.ok && existing.json?.data) { console.log(`  = ${pid}: already priced`); continue; }
  const point = await findPricePoint(`/v2/inAppPurchases/${id}/pricePoints`, usd);
  if (!point) { console.log(`  ✗ ${pid}: no $${usd} USA point`); continue; }
  const r = await api('POST', '/v1/inAppPurchasePriceSchedules', {
    data: { type: 'inAppPurchasePriceSchedules',
      relationships: { inAppPurchase: { data: { type: 'inAppPurchases', id } }, manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${price}' }] }, baseTerritory: { data: { type: 'territories', id: 'USA' } } } },
    included: [{ type: 'inAppPurchasePrices', id: '${price}', attributes: { startDate: null }, relationships: { inAppPurchasePricePoint: { data: { type: 'inAppPurchasePricePoints', id: point } } } }],
  });
  if (r.ok) console.log(`  ✓ ${pid}: $${usd} set`);
  else console.log(`  ✗ ${pid}: ${r.status} ${JSON.stringify(r.json?.errors || r.text).slice(0, 600)}`);
}
