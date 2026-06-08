# haloFrame — Lessons

A running log of mistakes and the rules that prevent them. Read this at the
start of a session before touching deploy/verification work.

---

## 2026-06-08 — "Live" production site was dead for its core feature

### What happened
`https://gethaloframe.com` was online and serving the SPA shell (HTTP 200),
but **nothing worked** — you couldn't take a photo or run any AI flow. We had
moved on to App Store / Play Store submission tasks believing the web app was
"done, just needs store deployment." It was not done; the public site had been
broken for the entire core flow.

### Root cause (proven, not guessed)
The web build calls its API over **same-origin** `/api/*`. On Vercel that path
returns **404** — the API is a *separate origin* (`api.gethaloframe.com`, on
Railway) and there is no `/api` reverse-proxy. Evidence:

- `GET https://gethaloframe.com/api/subscription` → **404** (web origin has no API)
- `GET https://api.gethaloframe.com/healthz` → **200 `{"ok":true}`** (backend healthy)
- The live JS bundle contained **zero** references to `api.gethaloframe.com`.

Two compounding bugs:
1. **Code:** `API_BASE` was gated behind `Capacitor.isNativePlatform() &&
   import.meta.env.VITE_API_URL`. That stranded the **web** build on
   same-origin `/api/*`. The native build used the absolute URL; the web build
   never could.
2. **Config:** `VITE_API_URL` was **never set on Vercel** (only the Supabase +
   RC vars were). So even with corrected code, the web build had no API base.
3. **Deploy hygiene:** Vercel's **Production Branch was `main`** (stale). The
   working app lives on `appstore-launch`, only ever deployed as *previews*
   that were never promoted. Production never had the working code.

### Fix
- `apps/web/src/lib/api.ts`: resolve `API_BASE` from `VITE_API_URL` whenever
  it's set (web **and** native); fall back to `''` (same-origin → Vite dev
  proxy) only when unset. Removed the `isNativePlatform()` gate.
- Set `VITE_API_URL=https://api.gethaloframe.com` on Vercel (Production), then
  redeploy the **appstore-launch** code to production.
- CSP already whitelists `connect-src https://api.gethaloframe.com`; backend
  CORS already returns `Access-Control-Allow-Origin: https://gethaloframe.com`
  and answers the preflight `204` — verified by probe. No backend change needed.

### Verified
- Rebuilt bundle now embeds `api.gethaloframe.com` (was absent before).
- Full local end-to-end run (real stack, Playwright, real photo): home →
  upload (200) → segment/3 people (200) → subject select → 8 AI style previews
  (5× `/api/spike/apply` → 200 with image URLs) → **Halo + Wings rendered
  correctly on the subject**. 44/44 unit tests + typecheck green.

### Mistakes we made → rules to prevent them

1. **We treated "it deploys" as "it works."** Vercel 200 on `/`, Railway
   `/healthz` 200, and a smoke matrix of *static* legal pages all passed — none
   of them touch the web→API path, which is the thing that was broken.
   - **RULE:** After ANY production deploy, drive the **real prod URL** through
     the **actual user flow** in a real browser and confirm the cost-bearing
     API calls (`/api/spike/*`, `/api/subscription/status`) return 200. A green
     infra smoke is necessary but NOT sufficient. "Working" = a verified
     end-to-end run on the surface the user actually uses.

2. **A comment asserted infra behavior that was never verified.** `api.ts`
   said "same-origin /api/ already routes via Vercel" — there was no such
   proxy. The false assumption shaped the code.
   - **RULE:** Don't encode "routes via X" in code/comments unless a probe
     proves it. When web and API are separate origins, the web build needs an
     explicit absolute base (`VITE_API_URL`) + the API needs CORS for the web
     origin. Confirm both with a curl/preflight before shipping.

3. **Production was pointed at a stale branch and nobody checked.** The working
   app was only ever preview-deployed; production silently served old code.
   - **RULE:** Verify the live production deployment is built from the
     branch/commit that contains the working app (`vercel list deployments` /
     dashboard). Reconcile the production branch before calling deploy "done."

4. **Env-var drift broke prod silently.** A missing `VITE_API_URL` produced a
   build that fails 100% at runtime with no build error.
   - **RULE:** Build-time env vars that are required for the app to function
     belong in a deploy checklist that is *verified post-deploy* (grep the
     deployed bundle / hit a live endpoint), not assumed from "I set it once."
