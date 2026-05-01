# haloFrame — Launch Punchlist (start here next session)

**Last updated:** 2026-04-29
**Branch:** `appstore-launch` on `aqillakhani/haloFrame` (88+ commits, pushed)
**Worktree:** `.worktrees/prod-ready`

This is the single source of truth for getting haloFrame live on **both
Apple App Store and Google Play**. Open this first in any future
session. Each task notes its dependencies, time estimate, and what it
unblocks downstream.

---

## How to resume in a fresh Claude session

1. Open the project. Make sure your working directory is
   `C:\Users\claws\OneDrive\Desktop\haloFrame\.worktrees\prod-ready`.
2. Paste the prompt below into the new session:

```
Read docs/RESUME_HERE.md to load the launch punchlist. I'm at <state
description, e.g. "I just registered the domain gethaloframe.com">.
Tell me the next 3 tasks I should do, ordered by what unblocks the
most downstream work.
```

The session will read the punchlist, identify your state, and queue
the right next batch.

---

## State snapshot — what's already done

Don't redo any of this. Verify the state if you're unsure (commands
provided where helpful).

### Code
- ✅ All Phase 0-12 implementation work — RC client SDK, AI consent
  modal, watermark, badge, report flow, native picker, Capacitor
  scaffolds (iOS + Android), Codemagic CI for iOS, full E2E suite
  (4/4 green).
- ✅ Branch `appstore-launch` pushed to GitHub (private repo
  `aqillakhani/haloFrame`).
- ✅ All TypeScript typechecks + unit tests + E2E + smoke-redesign
  green (with `DEV_UNLIMITED_CREDITS=false` for the smoke).

### Infrastructure
- ✅ Both DB migrations applied to live Supabase project
  `uqbckeyoclbhqntawsrz`:
  - `20260421000001_per_flow_free_tier.sql` (per-flow gate columns)
  - `20260425000001_app_store_compliance.sql` (consent + report tables)
- ✅ Reviewer account seeded: `reviewer@gethaloframe.com` (auth user
  `2b3eecbf-538f-4766-ba92-a4f3cec43f1b`), 22 credits, 4 sample
  portraits in `tributes-source/<userId>/seed/`. Password in commit
  `abc461b` (rotate via Supabase dashboard before submission).

### Documentation
- ✅ `docs/STORE_LISTINGS.md` — paste-ready copy for both stores
- ✅ `docs/REVIEWER_NOTES.md` — paste-ready App Review Information
- ✅ `docs/BETA_RECRUITMENT.md` — Google Closed Testing kit + DM templates
- ✅ `docs/PLAYSTORE_WALKTHROUGH.md` — Play Store click-by-click
- ✅ `docs/DEPLOY.md` — Vercel + Railway + Codemagic walkthroughs
- ✅ `docs/MORNING_CHECKLIST.md` — overnight session handoff (older)
- ✅ `.codemagic/secrets.md` — Codemagic env-var setup
- ✅ Design + research docs in `docs/plans/` and
  `APPSTORE_PLAYSTORE_RESEARCH.md`

### Brand + domain (2026-04-29)
- ✅ Domain `gethaloframe.com` registered on Cloudflare
- ✅ Codebase rebranded `haloframe.app` → `gethaloframe.com`
  (bundle ID `com.haloframe.app` preserved — that's locked once stores
  publish)
- ✅ App Name finalized as `haloFrame: Memorial Portraits` (29ch — uses
  brand + descriptor pattern for store search visibility)
- ✅ Subtitle finalized as `Honor loved ones in one photo` (29ch — the
  prior `Memorial portraits, made with care` was 34ch and would have
  failed Apple's 30ch limit)

### Legal placeholders + DNS (2026-04-30 / 2026-05-01)
- ✅ Task 3 — Legal placeholders filled with `Keshwani Consultancy Corp` /
  Texas, legal HTML regenerated, committed `aa125c2`, pushed to
  `appstore-launch`.
- ✅ Task 4 (DNS portion) — applied via Cloudflare API on 2026-05-01:
  - `A gethaloframe.com → 76.76.21.21` (Vercel apex), proxied off
  - `CNAME www.gethaloframe.com → cname.vercel-dns.com`, proxied off
  - Email Routing enabled at zone level; Cloudflare auto-added
    `MX route1/2/3.mx.cloudflare.net`, SPF (`v=spf1 include:_spf.mx.cloudflare.net ~all`),
    and DKIM (`cf2024-1._domainkey`).
  - Both apex + www verified resolving via 1.1.1.1.
- ✅ Task 4 (Destination address) — `aqil.lakhani8@gmail.com` added via
  admin token, verified `2026-05-01T00:54:49Z`. Tag
  `356d41a8c5ca4d84b68d2899430fa33a`.
- ✅ Task 4 (Routing rule) — `support@gethaloframe.com` →
  `aqil.lakhani8@gmail.com`, enabled, priority 50. Rule tag
  `582dcdd05aa440428a39264fcebe6f16`.
- ✅ Task 4 (api CNAME) — applied 2026-05-01 once Railway gave us a
  target: `CNAME api.gethaloframe.com → oe57m4lf.up.railway.app` plus
  Railway's TXT verification record `_railway-verify.api`.
- ✅ Task 5 — Vercel deploy live at `https://gethaloframe.com` /
  `https://www.gethaloframe.com`. Project `halo-frame-web` (scope
  `orange-panda`), production = commit `c57313c`. Two vercel.json fixes
  landed during deploy: `outputDirectory` (relative-path bug) and
  `cleanUrls` (so `/privacy` etc. serve static HTML, not the SPA
  shell). CSP `connect-src` later widened to include
  `https://api.gethaloframe.com` so the web app can reach the API.
- ✅ Task 6 — Railway deploy live. Project `halo-frame-api` /
  service `api`, custom domain `api.gethaloframe.com` (port 8080).
  Three deploy fixes landed in commit `4b8d2e9`:
  - Moved `apps/api/railway.json` → repo root (Railway only
    auto-detects there).
  - Removed Dockerfile per-workspace `COPY --from=deps` lines (npm
    workspaces hoist all deps to `/repo/node_modules`, so per-workspace
    dirs don't exist post-install).
  - `apps/api/src/index.ts` now binds to `process.env.PORT` (Railway-
    dynamic) before falling back to `env.API_PORT` (4000 default).
- ✅ Task 7 — full smoke green: `/`, `/privacy`, `/terms`, `/support`,
  `www` from Vercel; `/healthz`, `/readyz` from Railway. All 200, legal
  pages contain real Keshwani Consultancy Corp + fal.ai mentions.
- ✅ Task 10 — RevenueCat dashboard configured via OAuth-authenticated
  MCP. Project `proj6d70d494` now has 2 real-store apps (iOS + Android,
  bundle `com.haloframe.app`), 10 products (5 per platform), the
  `tributes` entitlement (with all 6 sub-products attached), and the
  `haloframe-default` offering (5 packages, current). Public SDK keys
  pushed to Vercel.
- ✅ Task 11 — Webhook integration → `/api/subscription/webhook` with
  48-byte Bearer auth header. `REVENUECAT_WEBHOOK_AUTH_HEADER` set on
  Railway. Three-probe smoke confirmed: no/wrong auth → 401, correct
  auth + valid event → 200.
- ✅ Vercel Preview env (2026-05-01) — added `VITE_RC_IOS_KEY` +
  `VITE_RC_ANDROID_KEY` to Preview on the live project
  `prj_3bkXNoUcXuOwMC4o68kxgXHuAYhK` (`halo-frame-web`). Note: there
  are **two** Vercel projects on the orange-panda team: the live one
  (`halo-frame-web`, aliased to `gethaloframe.com`) and an empty stub
  (`haloframe`, no aliases, no env). The worktree's
  `.vercel/project.json` was pointed at the stub — now corrected.
  Preview now has all 5 env vars (`VITE_RC_IOS_KEY`,
  `VITE_RC_ANDROID_KEY`, `VITE_API_MODE`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`).
- ✅ Compliance fix (2026-05-01) — removed 90-day top-up credit expiry.
  Apple Guideline 3.1.1 forbids expiring IAP credits. Migration
  `20260501000001_topup_no_expiry.sql` redefined `grant_credits` (no
  more 90-day coalesce default) and cleared every `topup_expires_at`
  row in prod (`uqbckeyoclbhqntawsrz`). Webhook handler in
  `apps/api/src/routes/subscription.ts` now passes
  `p_topup_expires_at: null`. Paywall copy + reviewer/seed scripts +
  `STORE_LISTINGS.md` / `PLAYSTORE_WALKTHROUGH.md` / `REVIEWER_NOTES.md`
  updated to advertise "Credits never expire". End-to-end smoke green:
  live `NON_RENEWING_PURCHASE` for `haloframe_topup_4pack` returned
  `applied:true creditsAfter:26`, DB confirmed `topup_expires_at IS
  NULL` post-grant. Commit `bd41d42` pushed; Vercel rebuilt; Railway
  redeployed via `railway up`.

> Cloudflare credentials for the launch sprint are saved at
> `.env.cloudflare.local` (gitignored via `.env.*.local` pattern). Two
> tokens are needed because they have complementary scopes —
> `CF_TOKEN_DNS` for zone-level work, `CF_TOKEN_ADMIN` for account-level
> Email Routing Addresses. Long-term home is 1Password; rotate + delete
> once stores publish.

---

## Decisions still open (resolve early)

| Decision | Status | Recommended | Why |
| --- | --- | --- | --- |
| Domain | DONE 2026-04-29 | `gethaloframe.com` registered on Cloudflare | `.com` for trust with 35-65+ memorial audience; `get-` prefix is real-app-precedented; `haloframe.app` + `haloframe.com` were taken |
| `{{COMPANY_LEGAL_NAME}}` placeholder | DONE 2026-04-30 | `Keshwani Consultancy Corp` (committed `aa125c2`) | Required for Privacy + Terms — the legal-entity name on file with Apple Dev + Google Play |
| `{{JURISDICTION}}` placeholder | DONE 2026-04-30 | `Texas` (committed `aa125c2`) | Required for Terms arbitration clause |
| App icon | Open | Fiverr ~$50 (3-5 day lead) | Phase 8 generated a placeholder; Play + Apple need a real one |
| Screenshots | Open | Pixel 7 AVD captures + Figma framing OR Fiverr ~$50 | Both stores need 4-8 phone screenshots |
| Reviewer password rotation | Open | Rotate to a new strong password before submission | Current literal password is in git history (commit `abc461b`) |

When any of these are resolved, the next-session Claude can pick up
the dependent tasks immediately.

### Manual cleanups (low priority — do whenever)

- **RevenueCat dashboard orphans.** Project `proj6d70d494` has a few
  scaffold-era artifacts that the MCP archive endpoints can't remove
  (the RC plugin server has a known bug returning `Content-Type not
  application/json` on every `archive-*` call, regardless of payload).
  Click-archive in the dashboard:
  - Entitlement `entlb07c161e4f` "haloFrame Pro"
  - Offering `ofrng54011e9252` "default"
  - Test Store products: `prod206b7d617c` lifetime, `prod701db82f87`
    monthly, `prodbb69899e02` yearly
  - Test Store app `app9348d2a6ab` (no archive-app endpoint exists; it
    becomes inert once the 3 products above are archived)

  None of these affect prod — the app uses entitlement `tributes`
  (`entl69652835d6`) and offering `haloframe-default`
  (`ofrng21efb76404`), which are clean.

- **Empty `haloframe` Vercel project.** `prj_iaM9AFnEaM9i6dIf6bqZpzctg7aQ`
  on the orange-panda team is an empty stub from a prior link attempt.
  No deployments, no aliases, no env vars. Safe to delete from the
  Vercel dashboard whenever you want to tidy up.

- **Stripe + Sentry env vars on Railway** — listed in `apps/api/src/config/env.ts`
  but no callers exist. Stripe service in `apps/api/src/services/stripe.ts`
  is a stub (no routes import `requireStripe`); Sentry init is gated on
  `SENTRY_DSN` and runs cleanly without it. Set these only when wiring
  up web canvas-print checkout (Stripe) or turning on prod error
  tracking (Sentry). Not a launch blocker.

---

## Critical-path overview

```
Calendar bottleneck #1: Google Closed Testing 14-day rule
  └── Earliest production-submit = Day 14 of Closed Testing
       Day 0 of clock = day you upload first AAB + add 12 active testers

Calendar bottleneck #2: Apple TestFlight External Review
  └── Currently 7-30d in 2026 (vs historical 24-48h)
       Triggered by tag push v1.0.0-rc1 → Codemagic → TF upload
       → manual "Submit for External Review" in ASC

Latest realistic launch: ~22-35 days from "first AAB + 12 testers locked in"
```

The two clocks ideally start the **same day** (Day 14 in the
overnight design's calendar). Tag the rc1 build, dual-submit, then
wait.

---

## Tasks — sequenced

Tasks are numbered in execution-friendly order. Some can run in
parallel (icon design + dashboard work + DM recruitment, etc.) — see
"Blocks / Blocked by" for each.

### Foundation (Day 0-1)

#### 1. Register domain — DONE 2026-04-29 (`gethaloframe.com`)
**Status:** ✅ Registered on Cloudflare. NS records resolve to
`logan.ns.cloudflare.com` + `olga.ns.cloudflare.com`.

---

#### 2. Codebase rebrand to new domain — DONE 2026-04-29
**Status:** ✅ All `haloframe.app` references replaced with
`gethaloframe.com` across `apps/web`, `apps/api`, `docs/`, `scripts/`,
rendered `apps/web/public/*.html`, and store-listing docs. Bundle ID
`com.haloframe.app` was deliberately preserved (locked identifier).

---

#### 3. Fill legal placeholders — DONE 2026-04-30 (`Keshwani Consultancy Corp`, Texas)
**Status:** ✅ Committed `aa125c2`, pushed to `appstore-launch`. Legal
HTML regenerated; `grep -c '{{' apps/web/public/privacy.html
apps/web/public/terms.html` returns 0/0.

---

#### 4. Cloudflare DNS + Email Routing — DONE 2026-05-01 (api CNAME deferred to Task 6)
**Status:**
- ✅ DNS records applied via Cloudflare API:
  - `A gethaloframe.com → 76.76.21.21` (Vercel apex), proxied off
  - `CNAME www.gethaloframe.com → cname.vercel-dns.com`, proxied off
- ✅ Email Routing enabled at zone level; MX/SPF/DKIM auto-added.
- ✅ Destination `aqil.lakhani8@gmail.com` added + verified
  (`00:54:49Z`), tag `356d41a8c5ca4d84b68d2899430fa33a`.
- ✅ Rule `support@gethaloframe.com` → forward to
  `aqil.lakhani8@gmail.com`, tag `582dcdd05aa440428a39264fcebe6f16`,
  enabled, priority 50.
- ⏳ Deferred: `CNAME api.gethaloframe.com → <railway-target>` — wait
  until Task 6 (Railway deploy) provisions the custom-domain target.

**Credentials:** `.env.cloudflare.local` (worktree root, gitignored)
holds `CF_TOKEN_DNS` (zone-level: DNS + Email Routing Rules) and
`CF_TOKEN_ADMIN` (account-level: Email Routing Addresses). They're
complementary; both are needed to fully drive Cloudflare ops via API.

**Success:** `Resolve-DnsName gethaloframe.com -Server 1.1.1.1` returns
`76.76.21.21`; `www.gethaloframe.com` CNAMEs to `cname.vercel-dns.com`;
sending to `support@gethaloframe.com` lands in Aqil's Gmail.

---

### Hosting (Day 1-2)

#### 5. Vercel deploy with custom domain — DONE 2026-05-01
**Status:** ✅ Live at `https://gethaloframe.com` and
`https://www.gethaloframe.com`. Project `halo-frame-web` in scope
`orange-panda` (account `ikeshwani-1172`). Production deploy is
commit `c57313c`.

**Env vars set on Production + Preview + Development:**
- `VITE_SUPABASE_URL` = `https://uqbckeyoclbhqntawsrz.supabase.co`
- `VITE_SUPABASE_ANON_KEY` (anon key from Supabase, public)
- `VITE_API_MODE` = `prod`
- `VITE_RC_IOS_KEY` + `VITE_RC_ANDROID_KEY` — not yet set (Task 24)

**Fixes landed during deploy:**
- `2cf7243` — `vercel.json#outputDirectory` from `apps/web/dist` to
  `dist` (relative to Root Directory, not repo root).
- `c57313c` — added `cleanUrls: true` so `/privacy`, `/terms`,
  `/support` resolve to the static legal HTML before the SPA
  catch-all rewrite intercepts them.

**Worktree linked** to the Vercel project at
`apps/web/.vercel/` (gitignored automatically by `vercel link`). Future
deploys can be triggered with `vercel deploy --prod` from
`apps/web/`, or by pushing to `appstore-launch` and promoting the
preview with `vercel promote <url> --scope orange-panda`.

**Production Branch is still `main`** in Vercel's project settings.
Each `appstore-launch` push builds as **Preview**, then we promote.
Once everything is merged to `main`, switch Production Branch in
Settings → Git for cleaner CI/CD.

**Deferred:** `www → apex` 308 redirect for canonical-URL hygiene
(currently both serve identical content). Add a redirect entry in
`vercel.json` when convenient.

---

#### 6. Railway deploy — DONE 2026-05-01 (modulo deferred secrets)
**Status:** ✅ Project `halo-frame-api` (id `725a07fd-9df3-44fb-b89f-c309825fc251`),
service `api`. Deployed to `https://api-production-559b.up.railway.app`
and to custom domain `https://api.gethaloframe.com` (port 8080). Both
`/healthz` (200, `{"ok":true}`) and `/readyz` (200, DB probe passes).

**Env vars set on Railway (13 of 19 from .env.example schema):**
- ✅ Set: `NODE_ENV=production`, `API_PORT=4000`, `LOG_LEVEL=info`,
  `SPIKE_MODE=false`, `MERGE_SKIP_RESTORE=true`,
  `DEV_UNLIMITED_CREDITS=false`,
  `CORS_ORIGINS=https://gethaloframe.com,https://www.gethaloframe.com`,
  `RESEND_FROM=orders@gethaloframe.com`,
  `ORDER_NOTIFICATION_EMAIL=aqil.lakhani8@gmail.com`,
  `FAL_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`.
- ⏳ Deferred (empty in local .env, server treats empty-as-undefined
  via `emptyToUndefined` in `apps/api/src/config/env.ts:23`, so the
  API boots without them):
  - `REVENUECAT_SECRET_KEY` — paste from RC dashboard (Project → API
    keys → Secret API key).
  - `REVENUECAT_WEBHOOK_AUTH_HEADER` — generate a Bearer-prefixed
    random secret, paste in Railway, then mirror it in RC dashboard
    (Project → Integrations → Webhooks → auth header) — Task 11.
  - `STRIPE_SECRET_KEY` — needed only for canvas-print checkout. From
    Stripe dashboard once products + prices exist.
  - `STRIPE_WEBHOOK_SECRET` — set AFTER Stripe webhook is registered
    against `https://api.gethaloframe.com/api/webhook/stripe`. Stripe
    dashboard → Developers → Webhooks → Add endpoint → URL above →
    select events → copy signing secret.
  - `STRIPE_PRICE_*` (9 vars) — paste price IDs once Stripe products
    are created (`docs/SETUP.md` §2 has the product list).
  - `RESEND_API_KEY` — server falls back to stderr-logging when
    unset; safe to leave empty until launch.
  - `SENTRY_DSN` — optional observability.

**Credentials:** `.env.railway.local` (worktree root, gitignored)
holds `RAILWAY_API_TOKEN` (currently invalid — CLI auth via
machine-wide `railway login` is what's actually working).

**Known limitation:** Railway CLI 4.44.0 returns 401 on
`railway domain --custom`, so custom-domain operations need to be done
via dashboard. Plan-tier or scope issue, unclear which. Other CLI
commands (init, variables, up, logs) work fine.

**Success:** All smoke checks green (see Task 7).

---

#### 7. Verify all public URLs live — DONE 2026-05-01
**Status:** ✅ Full smoke matrix passed:

| URL | HTTP | Bytes | Notes |
| --- | --- | --- | --- |
| `https://gethaloframe.com/` | 200 | 970 | SPA shell |
| `https://gethaloframe.com/privacy` | 200 | 3821 | mentions fal.ai + Keshwani Consultancy Corp |
| `https://gethaloframe.com/terms` | 200 | 4746 | mentions Keshwani Consultancy Corp |
| `https://gethaloframe.com/support` | 200 | 2024 | mentions fal.ai |
| `https://www.gethaloframe.com/` | 200 | 970 | SPA (no redirect to apex yet) |
| `https://api.gethaloframe.com/healthz` | 200 | 11 | `{"ok":true}` |
| `https://api.gethaloframe.com/readyz` | 200 | 56 | DB probe passes |

---

### Assets — start ASAP (3-5 day lead time)

#### 8. App icon design — ~30 min order, 3-5 day lead, ~$25-75
**Status:** UNBLOCKED — start NOW
**Blocks:** 21 (Play listing), 30 (Apple listing)

Brief: see `docs/PLAYSTORE_WALKTHROUGH.md` Phase A3. Order on Fiverr
(`fiverr.com/categories/graphics-design/app-icon-design`).

Save deliverables to:
- `apps/web/resources/icon.png` (1024×1024, no alpha, no rounded corners)
- `apps/web/resources/feature-graphic.png` (1024×500, Play feature graphic)
- Source file (Figma/AI/PSD) in 1Password

**Success:** rendered at 60×60, the icon is still legible.

---

#### 9. Screenshots — ~2-4h or Fiverr ~$50
**Blocked by:** 5 (web deployed; capture from a TestFlight build is
also fine after Task 28)
**Blocks:** 21 (Play listing), 30 (Apple listing)

For each store, capture **6 phone screenshots** in this order
(see `docs/STORE_LISTINGS.md` §2.4 for the recommended sequence):

1. Home — "For the ones we carry with us"
2. Reunite upload step
3. Reunite result with "✨ AI-generated" badge
4. Enhance before/after
5. Print Shop canvas size selector
6. Settings showing Restore Purchases

**Methods:**
- Pixel 7 AVD (Android) + iPhone 14 Pro 6.7" Simulator → screenshot
- Frame in Figma using AppLaunchpad / Previewed templates ($0)
- OR Fiverr "app screenshot mockups" gig ~$50 with 3-5 day turnaround

Required dimensions:
- Apple: 6.7" = 1290×2796 (mandatory; auto-scales to other sizes)
- Google: 1080×1920 portrait

Save to `docs/screenshots/{ios,android}/0{1..6}.png`.

---

### RevenueCat (Day 4)

#### 10. RevenueCat dashboard — DONE 2026-05-01
**Status:** ✅ Driven via the RC MCP server (OAuth-authenticated with
full project_configuration + customer_information scopes). Project
`haloFrame` (`proj6d70d494`) now contains:

- **Apps (2):**
  - iOS — `app0a91ef1ece` (`app_store`, bundle `com.haloframe.app`).
    Public SDK key: `appl_dSHXNXeddPvJJZODditwWVhvRZR` → set in Vercel
    as `VITE_RC_IOS_KEY` (Production + Development envs).
  - Android — `appda6fc8225e` (`play_store`, package
    `com.haloframe.app`). Public SDK key:
    `goog_jyBSiWWmCiZdLqmVrwFPpQPNCgJ` → set in Vercel as
    `VITE_RC_ANDROID_KEY` (Production + Development envs).
- **Products (10, 5 per platform):**
  - Subscriptions: `haloframe_keepsake_monthly`,
    `haloframe_heritage_monthly`, `haloframe_heritage_annual`. Android
    productIds use `productId:basePlanId` form
    (`haloframe_keepsake_monthly:monthly`, etc.).
  - Non-renewing top-ups: `haloframe_topup_4pack`,
    `haloframe_topup_single` (iOS = `non_renewing_subscription`,
    Android = `consumable`).
- **Entitlement:** `tributes` (`entl69652835d6`) — 6 subscription
  products attached (3 iOS + 3 Android). Top-ups deliberately NOT
  attached; they grant one-shot credits via the webhook.
- **Offering:** `haloframe-default` (`ofrng21efb76404`,
  `is_current=true`) with 5 packages, each containing iOS + Android
  product variants:
  - `$rc_custom_keepsake_monthly` — Keepsake (5 tributes / month)
  - `$rc_custom_heritage_monthly` — Heritage (20 tributes / month)
  - `$rc_annual` — Heritage Annual (240 tributes / year)
  - `$rc_custom_topup_4pack` — 4-Tribute Pack
  - `$rc_custom_topup_single` — Single Tribute
- **Onboarding artifacts (cosmetic, not removed):** the RC MCP
  `archive-*` endpoints all 400 with "Content-Type not
  application/json" so the original Swift-template entitlement
  (`haloFrame Pro` / `entlb07c161e4f`), offering (`default` /
  `ofrng54011e9252`), and 3 test products
  (`monthly`/`yearly`/`lifetime`) still appear in the project.
  They're not referenced anywhere — archive via dashboard if desired.
- **Vercel Preview env gap:** `vercel env add` to Preview kept
  prompting for git-branch filter (CLI quirk). VITE_RC_* are on
  Production + Development only. Add via Vercel dashboard if needed
  for branch previews; doesn't block native builds since Codemagic
  picks up Capacitor RC keys from its own secret store, not Vercel.

**Success:** Project shows 2 apps, 10 products, 1 active entitlement,
1 current offering with 5 packages.

---

#### 11. RevenueCat webhook URL — DONE 2026-05-01
**Status:** ✅ Webhook integration `whintgr5a8b0a7d71` (haloFrame API
(Railway)) → `https://api.gethaloframe.com/api/subscription/webhook`,
listening for 12 event types (initial_purchase, renewal,
non_renewing_purchase, cancellation, uncancellation, expiration,
billing_issue, product_change, transfer, subscription_paused,
subscription_extended, refund_reversed). Authorization header set on
both ends to a 48-byte cryptographically-random Bearer secret.

`REVENUECAT_WEBHOOK_AUTH_HEADER` is set on Railway (api service) and
saved locally to `.env.railway.local` (gitignored). The full secret
is also in the RC dashboard webhook config — keep both in sync if you
ever rotate.

**Smoke verification (post-deploy):**
| Probe | Expected | Result |
| --- | --- | --- |
| POST /api/subscription/webhook (no Authorization) | 401 | ✅ 401 |
| POST /api/subscription/webhook (wrong Bearer) | 401 | ✅ 401 |
| POST /api/subscription/webhook (correct Bearer + CANCELLATION event) | 200 with `applied:false, reason:ignored:CANCELLATION` | ✅ 200 |

So RC's "Send test event" from the dashboard will succeed end-to-end.

---

### Apple Developer track (Days 3-7)

#### 12. Verify Apple Developer account — ~10 min
**Status:** Per design doc you have one active. Just confirm.
**Blocks:** all Apple tasks

Apple Developer (`developer.apple.com`) → Membership → confirm "Active."

Note your **Team ID** (10-char string, e.g. `ABC123DEF4`) — needed for
Codemagic later.

---

#### 13. Register bundle ID `com.haloframe.app` — ~10 min
**Blocked by:** 12
**Blocks:** 14, 26

Apple Developer → Certificates, IDs & Profiles → Identifiers → "+"
→ App IDs → App.

- Description: `haloFrame`
- Bundle ID: explicit, `com.haloframe.app`
- Capabilities: enable **In-App Purchase**. Skip everything else.
- Continue → Register.

**Success:** identifier `com.haloframe.app` shows in the Identifiers
list with In-App Purchase enabled.

---

#### 14. App Store Connect app record + listing copy — ~60 min
**Blocked by:** 13
**Blocks:** 15, 16, 17, 18, 26, 32

App Store Connect (`appstoreconnect.apple.com`) → My Apps → "+" → New App.

- Platforms: iOS
- Name: `haloFrame`
- Primary language: English (U.S.)
- Bundle ID: `com.haloframe.app`
- SKU: `haloframe-ios-001`
- User Access: Full Access

Then in App Information:
- Subtitle (30ch): `Honor loved ones in one photo`
- Privacy Policy URL: `https://gethaloframe.com/privacy`
- Category: Photo & Video (primary), Lifestyle (secondary)
- Content Rights: "Does not contain, show, or access third-party content"

In the version page (1.0):
- Promotional Text (170ch): paste from `docs/STORE_LISTINGS.md` §1.2
- Description (4000ch): paste from §1.3
- Keywords (100ch): paste from §1.4
- Support URL: `https://<your-domain>/support`
- Marketing URL: `https://<your-domain>` (optional)
- Copyright: `© 2026 {{COMPANY_LEGAL_NAME}}`

**Success:** Version page shows all listing fields filled (no red
"Required" badges).

---

#### 15. App Store Connect — Age Rating + App Privacy — ~30 min
**Blocked by:** 14
**Blocks:** 32

App Information → Age Rating → questionnaire. All "None" / "No" per
`docs/STORE_LISTINGS.md` §1.5. Expected outcome: **4+**.

App Information → App Privacy → "Get Started":
- Tracking → "We do not use any data to track" (paste no IDFA path).
- Data Collection → answer per `docs/STORE_LISTINGS.md` §1.6 + §1.7:
  - Email, User ID, Photos, Purchase History, Crash Data
  - All linked to user, none used for tracking, all for App
    Functionality (and Analytics for Crash Data only)

**Success:** App Privacy section shows green "Set" indicator.

---

#### 16. App Store Connect — IAP products — ~60 min
**Blocked by:** 14
**Blocks:** 26, 32

App Store Connect → your app → Subscriptions → Subscription Group →
"+" → name it `tributes`.

Inside the group, add 3 auto-renewing subscriptions per
`docs/STORE_LISTINGS.md` §1.10:

| Product ID | Display name | Price tier |
| --- | --- | --- |
| `haloframe_keepsake_monthly` | Keepsake — 5 tributes / month | Tier 9 ($9.99) |
| `haloframe_heritage_monthly` | Heritage — 20 tributes / month | Tier 24 ($24.99) |
| `haloframe_heritage_annual` | Heritage Annual — 240 / year | Custom $199 |

For each subscription: paste display name + description (45ch). Add a
review screenshot (any portrait photo with the wordmark visible).

In Monetization → In-App Purchases (NOT subscription) → "+" → add 2
non-renewing:

| Product ID | Display name | Price tier |
| --- | --- | --- |
| `haloframe_topup_4pack` | 4-Tribute Pack | Tier 7 ($7.99) |
| `haloframe_topup_single` | Single Tribute | Tier 2 ($2.49) |

**Success:** Subscriptions tab shows 1 group with 3 products; In-App
Purchases tab shows 2 non-renewing products.

---

#### 17. App Store Connect API key (for Codemagic + RC) — ~15 min
**Blocked by:** 12
**Blocks:** 25 (Codemagic), 10 (RC iOS connection)

App Store Connect → Users and Access → Integrations → App Store
Connect API → "+".

- Name: `haloframe-codemagic`
- Access: **App Manager**
- Generate.

Apple gives you the `.p8` file ONCE — download it immediately and
store in 1Password (`haloFrame → asc-api-key.p8`). Capture **Issuer
ID** + **Key ID** from the same screen.

This single key serves both Codemagic (Task 25) and RC (Task 10's
iOS app connection — paste it under iOS App → ASC API key). Reuse
or generate a second; reuse is fine.

**Success:** key shows in the integrations list with "App Manager" role.

---

#### 18. App Store Connect — App Review Information — ~15 min
**Blocked by:** 14, 17 (the seeded reviewer account already exists)
**Blocks:** 32

App Store Connect → your app → version 1.0 → App Review Information.

- First/Last name: your name
- Phone number: your number
- Email: your email
- Sign-in info: paste from `docs/REVIEWER_NOTES.md` §1, "App Store
  Connect — paste this verbatim" block. Username:
  `reviewer@gethaloframe.com`. Password: from 1Password (rotate first if
  you want — current literal is in commit `abc461b`).
- Notes: paste the full Notes block from §1 (4000ch max — current
  draft is well under).
- Attachment: optional. Skip unless reviewer asks later.

**Success:** App Review Information section shows green "Set."

---

### Google Play track (Days 3-7) — parallel with Apple

#### 19. Google Play Console app record — ~15 min
**Status:** UNBLOCKED. Already have a Play developer account per
project assumption.
**Blocks:** 20-23, 27, 33

Play Console (`play.google.com/console`) → All apps → "+ Create app".

- App name: `haloFrame: Memorial Portraits`
- Default language: English (United States)
- App or game: App
- Free or paid: Free
- Confirm Developer Program Policies + US export laws.
- Create.

**Success:** new app shows in Play Console with package name
`com.haloframe.app`.

---

#### 20. Play Console — Data Safety form — ~45 min
**Blocked by:** 19, 5 (Privacy URL must be live)
**Blocks:** 33

Most-scrutinized form on Play Console. Must match Privacy Policy
verbatim.

Policy → App content → Data safety → Start.

Open `docs/STORE_LISTINGS.md` §2.7 in another tab; paste each answer.
Critical answers:
- Encrypts data in transit: Yes
- Provides way to delete data: Yes
- Photos: collected, **shared** with fal.ai, encrypted, deletable
- Email: collected, not shared
- Purchase history: collected, shared with Google Play Billing
- No advertising IDs, no analytics SDK

Submit.

---

#### 21. Play Console — listing copy + assets — ~30 min
**Blocked by:** 8 (icon), 9 (screenshots), 19
**Blocks:** 27, 33

Play Console → Grow → Store presence → Main store listing.

- App name: `haloFrame: Memorial Portraits`
- Short description (80ch): paste from `docs/STORE_LISTINGS.md` §2.2
- Full description (4000ch): paste from §2.3
- Icon: upload `apps/web/resources/icon.png` (Task 8)
- Feature graphic: upload `apps/web/resources/feature-graphic.png` (Task 8)
- Phone screenshots: upload 4-8 from `docs/screenshots/android/`
- Tags: Photography, Personalized, Memories
- Save.

**Success:** Listing tab shows green "Set" with all required assets.

---

#### 22. Play Console — IAP products — ~60 min
**Blocked by:** 19
**Blocks:** 27, 33

Same products as Apple. Open `docs/STORE_LISTINGS.md` §2.11 + §2.12.

Monetize → Products → Subscriptions:
- 3 subscriptions matching Apple IDs verbatim
- Each needs a base plan + benefits list (paste from §2.12)
- Activate each product (default state is inactive)

Monetize → Products → In-app products:
- 2 non-renewing products (consumable type)
- Activate.

Pricing tab: set each product's USD price → Apply to all available
countries.

**Success:** Products tab shows 5 active products.

---

#### 23. Play Console — content rating + target audience + ads — ~10 min
**Blocked by:** 19
**Blocks:** 33

Policy → App content:
- Privacy policy: `https://<your-domain>/privacy`
- App access: instructions per `docs/PLAYSTORE_WALKTHROUGH.md` Phase C2
- Ads: No
- Content rating: questionnaire — all "No" → Everyone (IARC)
- Target audience: 13+
- News, COVID, government: all No

**Success:** "App content" section all green.

---

#### 24. Service account → RC — ~15 min
**Blocked by:** 19
**Blocks:** 27 (RC needs to read Play billing events)

`docs/PLAYSTORE_WALKTHROUGH.md` Phase D walks through:
1. Play Console → Settings → Developer account → API access → Create
   service account (kicks to Google Cloud Console).
2. Google Cloud → name `revenuecat-haloframe` → JSON key download.
3. Back in Play Console → grant Financial role on All apps.
4. Upload JSON to RevenueCat → Project → Apps → haloFrame Android →
   Service Account Credentials JSON.

**Success:** RC dashboard shows "Connected" green dot for Android app.

---

### Native build pipeline

#### 25. Codemagic dashboard setup (iOS) — ~30 min
**Blocked by:** 17
**Blocks:** 28

`.codemagic/secrets.md` walks through. Connect repo, create
integration `haloframe_asc` (App Store Connect API), create env-var
group `haloframe_secrets` with 4 secrets (KEY_IDENTIFIER, ISSUER_ID,
PRIVATE_KEY, TEAM_ID).

**Success:** Codemagic dashboard shows the project connected,
`codemagic.yaml` detected, integration green-dot.

---

#### 26. Android upload keystore — ~15 min, one-time
**Status:** UNBLOCKED. Independent of all other tasks.
**Blocks:** 27

`docs/PLAYSTORE_WALKTHROUGH.md` Phase A2.

```powershell
keytool -genkey -v `
  -keystore haloframe-upload.jks `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -alias haloframe-upload
```

Save keystore + alias + passwords to 1Password. Copy paths into
`apps/web/android/local.properties` (gitignored).

**Critical:** losing this key permanently un-ships the app for that
bundle ID. Treat as one-shot.

---

#### 27. First Android AAB — ~30 min
**Blocked by:** 24, 26
**Blocks:** 29

```powershell
cd apps/web
npx cap sync android
cd android
.\gradlew.bat bundleRelease
```

Output: `apps/web/android/app/build/outputs/bundle/release/app-release.aab`

If Gradle errors: see `docs/PLAYSTORE_WALKTHROUGH.md` Phase E1
troubleshooting (JAVA_HOME, ANDROID_HOME, signing config).

Upload to Play Console → Testing → Internal Testing → Create release.

Add yourself + 1-2 close friends as internal testers (Internal Testing
→ Testers → Create email list). Roll out.

**Success:** AAB shows in Play Console with status "Available to
internal testers." Install on a real Android device via the Play
opt-in link succeeds.

---

#### 28. First TestFlight build (iOS) — auto-triggered by tag
**Blocked by:** 25 (Codemagic ready)
**Blocks:** 29, 32

Tag from local repo:
```bash
cd .worktrees/prod-ready
git tag -a v1.0.0-rc1 -m "Release candidate 1 — app-store launch dual-submit"
git push origin appstore-launch
git push origin v1.0.0-rc1
```

Codemagic auto-builds + uploads to TestFlight Internal (~12-15 min).
Then manually submit to External Review:
- App Store Connect → TestFlight → External Testing → Submit for Review

**Success:** TestFlight shows the build available to external testers
(may take 7-30 days for review).

---

### Beta tester recruitment — URGENT (was Day 0)

#### 29. Send 18 beta DMs — ~90 min
**Status:** OVERDUE — was supposed to happen Day 0. Every day of
inaction slips launch by a day.
**Blocks:** 31

Open `docs/BETA_RECRUITMENT.md` §2 + §3. Use the primary DM template;
personalize first sentence per recipient. Send via channel they
respond on (NOT email).

Track in `docs/BETA_TESTERS.txt` (gitignored).

Day-3 follow-up DMs to non-responders. Day-5 reminder. Day-10
reminder. See §5 for templates.

**Goal:** 12+ confirmed yes by Day 5; 12+ active during the 14-day
Closed Testing window.

If <12 by Day 18, escalate per §6.

---

### Closed Testing window (14-day Google clock)

#### 30. Google Group for testers — ~10 min
**Blocked by:** 29 (12+ confirmed yeses with emails)
**Blocks:** 31

`groups.google.com` → Create new group:
- Name: `haloframe-beta`
- Email: `haloframe-beta@googlegroups.com`
- Privacy: Only invited users
- Add the 12-15 emails from `docs/BETA_TESTERS.txt`.

---

#### 31. Promote AAB to Closed Testing + start clock — ~30 min
**Blocked by:** 27 (AAB in Internal), 30 (Google Group)
**Blocks:** 32 (production unlocks at Day 14)

Play Console → Testing → Closed testing → "+ Create track":
- Name: `haloframe-closed-beta`
- Email lists: select `haloframe-beta@googlegroups.com`
- Country availability: US, CA, UK, AU, NZ
- Save

Promote your Internal release:
- Internal testing → Releases → Promote → Closed testing → choose the
  closed-beta track → Roll out.

Send invite-day DM to all 12-15 testers (template in
`docs/BETA_RECRUITMENT.md` §5).

**Success:** Closed testing track shows "Live" with 12+ enrolled
testers. **Day 0 of the 14-day clock.**

For the next 14 days:
- Monitor Engagement reports (must stay ≥12 active)
- Sentry for crashes
- Email for `/api/report` flagged content
- Day-5 + Day-10 reminder DMs

---

### Day 14 — production submit (dual)

#### 32. Apple App Store production submit — ~30 min
**Blocked by:** 14, 15, 16, 18, 28 (TestFlight cleared external review)
**Blocks:** 34

App Store Connect → your app → version 1.0 → "Submit for Review".

Confirm:
- Build selected (the rc1 build from Codemagic)
- All metadata + assets present (no red badges anywhere)
- App Review Information filled
- Export Compliance: app uses only HTTPS — answer "No" to non-exempt
  encryption (`ITSAppUsesNonExemptEncryption=NO` already set in
  Info.plist via Phase 8).

Submit.

---

#### 33. Google Play production submit — ~30 min
**Blocked by:** 21, 22, 23, 24, 31 (14-day clock cleared)
**Blocks:** 34

Play Console → Production → Create release:
- Promote from Closed testing → choose `haloframe-closed-beta`
- Release name: `1.0.0`
- Release notes: brief, factual
- Roll out: 100% (or staged 20% / 50% / 100%)
- Submit for review

**Success:** Production release shows status "In review."

---

### Review windows

#### 34. Wait — ~3-7 days each
**Blocked by:** 32, 33

- Apple App Store review: 24-72h historically; 7-30d in 2026 backlog
- Google production review: 3-5d typical

Do NOT push tag updates during review. Critical fixes can ship via
Capgo OTA (assets/JS only, never native).

---

### Live

#### 35. Both stores published — ~24-48h indexing lag
**Blocked by:** 34

- Apple: status changes to "Ready for Sale" → searchable in App Store
- Google: status changes to "Published" → directly downloadable; Play
  Store search indexes 2-3 days later

Send launch announcement to your beta testers (and use them as the
seed for word-of-mouth). Update `docs/MORNING_CHECKLIST.md` §12 with
"launched on YYYY-MM-DD."

---

## Index of existing docs (paste-ready content)

| Doc | What's in it | When to read |
| --- | --- | --- |
| `docs/RESUME_HERE.md` | This file — top-level launch punchlist | Start of every session |
| `docs/PLAYSTORE_WALKTHROUGH.md` | Click-by-click for Play Store launch surface | Working on Tasks 19-31 |
| `docs/STORE_LISTINGS.md` | Paste-ready store copy, age rating, App Privacy, Data Safety | Tasks 14, 15, 16, 21, 22, 23 |
| `docs/REVIEWER_NOTES.md` | Paste-ready ASC App Review Information + Play Console testing instructions | Tasks 18, 23 |
| `docs/BETA_RECRUITMENT.md` | DM templates, channels, 14-day playbook, escalation | Tasks 29-31 |
| `docs/DEPLOY.md` | Vercel + Railway + Codemagic walkthroughs | Tasks 5, 6, 25 |
| `docs/MORNING_CHECKLIST.md` | Overnight handoff (older) — has §12 launch summary | Reference only |
| `.codemagic/secrets.md` | Codemagic env-var setup | Task 25 |
| `docs/plans/2026-04-25-app-store-launch-design.md` | Approved design, full risk register | Strategic context |
| `APPSTORE_PLAYSTORE_RESEARCH.md` | Research backing all approval-risk decisions | When a reviewer rejects |

## Index of existing scripts

| Script | What it does | When to run |
| --- | --- | --- |
| `scripts/seed-reviewer-account.mjs` | Creates `reviewer@gethaloframe.com` w/ 22 credits + 4 sample portraits in prod Supabase | Already run; re-run if rotating reviewer password |
| `scripts/build-legal.mjs` | Generates `apps/web/public/{privacy,terms,support}.html` from `LegalScreen.tsx` | After Task 3 (legal placeholders fill) |
| `scripts/topup-user.mjs` | Manually grant credits to a user | Granting Heritage tier to confirmed beta testers post-window |
| `scripts/smoke-redesign.mjs` | API-side smoke test (9 checks) | Before any submission, with `DEV_UNLIMITED_CREDITS=false` |
| `scripts/gen-placeholder-assets.mjs` | Sharp-generated placeholder icon + splash | Already run in Phase 8 |

## Resume protocol — what to ask the next-session Claude

Things you can say to immediately make progress in a fresh session:

| You say | Claude does |
| --- | --- |
| "Domain is `<X>`, run the rebrand pass" | Task 2 — sed-replace + rebuild legal HTML + commit |
| "Legal name: `<X>`. Jurisdiction: `<Y>`. Fill the placeholders." | Task 3 — sed-replace + rebuild + commit |
| "Cloudflare token: `<X>`" | Task 4 — apply DNS + Email Routing |
| "I'm at task `<N>`, what next?" | Identifies next 3 unblocked tasks |
| "Verify hosting URLs are live" | Task 7 — curl each, report status |
| "Walk me through Play Console step by step starting from `<task>`" | Live walkthrough referencing this doc + STORE_LISTINGS.md |
| "Walk me through ASC App Privacy questionnaire" | Live walkthrough referencing STORE_LISTINGS.md §1.6-§1.8 |
| "Gradle failed, debug it" | Reads error, suggests JAVA_HOME / ANDROID_HOME / signing fixes |
| "Day 14 dual-submit time. Walk me through both" | Tasks 32 + 33 in lockstep |

## Session-end checkpoint reminder

When you finish a work session, update this doc's **State snapshot**
at the top so the next session knows what's done. Add a line under
each completed task or strike it through:

```diff
-#### 1. Register domain — ~5 min, ~$10/yr
+#### 1. Register domain — DONE 2026-MM-DD (gethaloframe.com)
```

Or simpler: maintain a section at the top:

```markdown
## State snapshot — what's already done
- ✅ Task 1 — Domain registered (gethaloframe.com)
- ✅ Task 2 — Codebase rebrand
- ⏳ Task 3 — Legal placeholders (waiting on Aqil to provide values)
```

---

**This doc is the source of truth. When in doubt, this file wins over
any other doc.**
