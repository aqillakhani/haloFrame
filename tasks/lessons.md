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

---

## 2026-06-08 (cont.) — Deploy-time addendum: three MORE prod-only bugs

Shipping the fix surfaced three additional bugs invisible to local dev and to
every static check — each found ONLY by driving the real `gethaloframe.com`
flow in a browser and reading the console + network. This is rule #1 in action.

1. **BOM injected into env vars by a PowerShell pipe.** `"value" | vercel env
   add NAME production` in Windows PowerShell 5.1 prepends a UTF-8 BOM (U+FEFF)
   to stdin. The build baked `API_BASE = "﻿https://api.gethaloframe.com"`,
   so `fetch("﻿https://…")` resolved same-origin → `308 → 404` (HTML) and
   threw "Invalid value" on others. curl worked because the URL was typed clean.
   - **RULE:** Never pipe a value to a native CLI through a PS 5.1 pipe. Use
     Bash `printf '%s' "$v" | cmd`, or a BOM-less file. After setting a
     build-time env var, GREP THE DEPLOYED BUNDLE for the value and check the
     character right before it (a quote `34`, not the BOM `65279`).

2. **A literal newline inside `VITE_SUPABASE_ANON_KEY`.** The prod anon key had
   an LF at char 131 (set in a prior session). A newline in a header value is
   illegal, so `supabase.auth.signInAnonymously()`'s fetch threw "Invalid
   value" → every visitor silently failed to get an anonymous session (in the
   old bundle too). The minifier rendered the key as a template literal
   (backtick) — the tell that a string contains a newline.
   - **RULE:** Treat "fetch Invalid value" as a corrupted URL/header value
     (BOM, newline, non-Latin-1 char), not a logic bug. Instrument
     `window.fetch` to log the throwing args. Re-set secrets from a known-good
     source with whitespace stripped (`tr -d '\r\n'`).

3. **CSP blocked the AI result images.** `img-src`/`connect-src` allowed
   `https://v3.fal.media`, but fal serves results from `https://v3b.fal.media`
   (and other subdomains). Renders succeeded (`apply` → 200) but the `<img>`s
   were CSP-blocked → blank. Local dev applies no CSP, so this was invisible.
   - **RULE:** Allowlist provider domains by wildcard (`https://*.fal.media`),
     never a single subdomain. CSP only applies on the deployed host — image/
     connect failures must be checked against the live CSP, not local dev.

**Meta-lesson:** API base, BOM, anon-key newline, and CSP were ALL prod-only
failures that local dev, typecheck, unit tests, and the build every one passed.
Only driving the real production URL in a browser caught them. Do that after
EVERY deploy, before saying "it works."

---

## 2026-06-08 (cont.) — A code fix that never shipped to TestFlight

### What happened
User: "the app on TestFlight doesn't let me upload — I thought we already
solved it?" We HAD solved it in code: the native gallery-upload fix
(`Filesystem.readFile` instead of the CapacitorHttp-broken `fetch`) was
committed 2026-06-01 (rc6, `4919206`). But it never reached an installable
build. TestFlight build #9 was uploaded 2026-06-01 **10:49 PDT — five minutes
after** the fix commit (10:44 PDT). An iOS Codemagic build (`npm ci` → web
build → `cap sync` → Xcode → sign → upload) takes far longer than 5 min, so #9
was built from a *pre-fix* commit. rc6 was tagged but no build from it ever
shipped. Every installable build (#7–#9) had the old, broken picker.

### Root cause of the process miss
We treated "committed + tagged" as "shipped." There is no automatic link
between a commit and what testers can install — that needs tag → Codemagic
build → ASC upload → TestFlight, any step of which can silently not happen.

### Rules
1. **Code-fixed ≠ shipped (native).** A fix isn't real until it's in an
   installable build. After a native fix, push a `v*` tag (triggers Codemagic
   `ios-testflight` + `android-internal`) and VERIFY the new build lands:
   `node scripts/asc-build-status.mjs` lists TestFlight builds with numbers +
   upload times. Confirm a build *newer than the fix* exists before claiming
   it's fixed for the user.
2. **Correlate build ⟷ commit by timing, not assumption.** A build that
   uploaded minutes after a commit cannot contain it. When unsure, ship a fresh
   tag rather than assume the latest build has the fix.
3. **Make native failures loud.** On-device flows can't be tested from CI/
   Windows. A silent bail (`if (!photo?.blob) return;`) gives zero signal when
   it fails in the field — surface a visible error so the user can report it.

### Fix shipped
Hardened `photoPicker` (two independent Filesystem read routes: `photo.path`
AND a path derived from `webPath`; + visible error in both Enhance & Reunite),
committed `ee0e522`, tagged `v1.0.0-rc7` → Codemagic build #10 to TestFlight.
46/46 unit + typecheck + web build green; web prod re-verified live (upload +
segment 200, 0 console errors). On-device upload = user confirms on build #10.

---

## 2026-06-09 — Correction + the real diagnosis (upload "still broken")

### Correcting the 2026-06-08 entry above
That entry concluded "every installable build (#7–#9) had the old broken
picker / #9 was built from a pre-fix commit." **That is wrong.** Verified this
session via `codemagic-probe`: ASC build **#9 = Codemagic build `6a1dc50f` =
tag `v1.0.0-rc6` = commit `4919206`**, which **does** contain the basic
Filesystem fix. The earlier "uploaded 5 min after the commit → too fast"
reasoning was a timezone artifact (commit/build/upload were all ~17:45–17:49
UTC = 10:45–10:49 PDT, internally consistent). Lesson: correlate build⟷commit
with the **Codemagic build's own commit field**, not wall-clock subtraction
across timezones.

### The actual mechanism (source-confirmed, not guessed)
`@capacitor/camera` 8.1.0 `returnImages()` (what `pickImages` calls) returns
`path: fileURL.absoluteString` (a **readable `file://…` URL**) and
`webPath: portablePath(...)` (`capacitor://…/_capacitor_file_/…`). So the
ORIGINAL bug was solely `fetch(photo.webPath)` — broken because
`CapacitorHttp.enabled:true` patches global fetch and doesn't grok the
`capacitor://` scheme. Reading bytes via `Filesystem.readFile({path})` (rc6) or
the webPath-derived `file://` route (rc7) both work — the iOS simulator
diagnostic proved `readFile(file://) → upload → segment` all pass.

### The real lesson: verify WHICH build the user ran before "the fix failed"
rc6 *should* work per source. The most likely reason the user still saw the bug
is a **stale TestFlight build** — TestFlight never force-updates; build #8
(rc5, `8cecec3`) is the original broken `fetch` picker and was the newest build
for ~8 days before #9. "We fixed it but they never tapped Update" is more
likely than "the fix failed on device." **Before concluding a shipped fix
failed: confirm the user's installed build ≥ the fixed build.** ASC
`internalBuildState/externalBuildState` + upload dates tell you what's
installable, not what's installed — the latter needs the user.

### Shipped + verified this session
- **Build #10 (rc7, hardened `ee0e522`) is LIVE in TestFlight** — ASC
  `processingState: VALID`, `IN_BETA_TESTING` (internal + external), auto-
  distributed (`submit_to_testflight: true`). Triggered via
  `node scripts/codemagic-probe.mjs trigger v1.0.0-rc7 ios-testflight`
  (tag-push webhook still doesn't fire here — must API-trigger).
- **Web prod fully re-verified** (`zz-smoke.mjs` + `zz-nav.mjs`): upload 200 →
  segment 200 → editor → 8× apply(generation) 200; all screens render
  (Home/Reunite/Tributes/Prints/Settings/Paywall); 0 uncaught page errors.
- Irreducible remaining check: one real-device pick on build #10 (out-of-
  process PHPicker is the one thing sim/source can't fully close).

### Empirical confirmation (2026-06-17) — real-picker sim proof PASSED
Built a Codemagic sim test (VITE_E2E_DIAG=2 → runE2EPickDiag) that drives the
ACTUAL Camera.pickImages on iPhone 16e / iOS 26.4 via a Maestro coordinate-tap
(PHPicker is out-of-process, so element selection isn't available — seed the
library with simctl addmedia + tap a grid cell), then runs the shipped read
loop + upload + segment. Output:
  photo.path    = file:///.../tmp/photo-1.jpg     (valid, readable — as source predicted)
  photo.webPath = capacitor://localhost/_capacitor_file_/.../photo-1.jpg
  [photo.path (rc6 route)] readFile ok base64Len=28988 → blob 21739B → upload OK → segment OK
  RESULT: pick=PASS pipeline=PASS
So the rc6 `photo.path` route ALREADY works on a real iOS runtime → rc6 (build
#9) should have worked → the user's "still broken" was almost certainly a STALE
BUILD. build #10 (rc7) is strictly more robust. Caveat: simulator, not physical
hardware — the one residual device-only PHPicker quirk can't be closed without
the device, but the mechanism is now proven on iOS 26.4. Infra lives on branch
ci/ios-sim-test @84f6789 (.maestro/pick-photo.yaml + runE2EPickDiag in e2eDiag.ts;
codemagic `ios-sim-diagnostic` seeds + Maestro-drives + reads e2e-result.txt).
Reusable for any future native-flow proof.
