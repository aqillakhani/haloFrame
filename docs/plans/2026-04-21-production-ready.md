# haloFrame — Production-Ready Execution Plan

**Authored:** 2026-04-20 by the redesign-ship session.
**Intended consumer:** A fresh overnight session. Read this doc fully before touching code.
**Goal:** Take haloFrame from "redesign merged at `474731b`" to "one manual step away from live," while the user sleeps.

---

## How to use this plan

**When you start:**

1. Read `memory/project_redesign_v2.md` (current repo state) and `memory/project_eternalframe.md` (architecture baseline).
2. Read this doc end-to-end before touching a single file.
3. Read `memory/MEMORY.md` index and any `feedback_*.md` that looks applicable.
4. `git status` on main — confirm no uncommitted state from the last session.
5. Create a worktree: `git worktree add .worktrees/prod-ready prod-ready/main` branching from `main`. All phase work happens there; main stays deployable.
6. Create a progress log file: `docs/plans/2026-04-21-production-ready-progress.md`. Append an entry at the start of every phase and every blocker.
7. Use `TaskCreate` to queue the tasks in **Phase A** (section below). When Phase A completes, queue Phase B. Don't pre-queue everything — it stales.
8. Execute phases sequentially, tasks within a phase sequentially unless marked `[PARALLEL]`.

**Finish posture:**

At the end of every session tick (you may hit compaction or context limits), the repo must be in a resumable state:
- Every committed task is green on typecheck + smoke.
- No half-finished file edits sitting uncommitted.
- Progress log reflects exactly where you stopped.

---

## Locked decisions (do not re-litigate)

| | Decision | Reasoning |
|---|---|---|
| Auth | Supabase Auth: magic link + email/password + Google + Apple | User confirmed 2026-04-20 |
| Save gate | Anon users can browse, upload, preview. Sign-in required at tap of Save. | Memorial audience — show value before commitment |
| Free tier | 1 free enhance + 1 free merge (2 total) — both gated at save-time sign-in | User confirmed; lets users experience the hero feature |
| Deploy web | Vercel | Static + SSR edge network |
| Deploy API | Railway | Express + 60-90s Reunite merge needs sustained compute Vercel can't give |
| Mobile | Capacitor wrapper for iOS + Android | Ship the same web codebase in native shells; no RN rewrite |
| Print fulfillment | Stripe Checkout → email order details to `aqil.lakhani8@gmail.com` (env var `ORDER_NOTIFICATION_EMAIL`) | User runs his own printing company |
| Pricing | Unchanged: Free 2 (1+1)/Keepsake $9.99·5/Heritage $24.99·20/Heritage Annual $199·240 + $4.99 single / $14.99 4-pack top-ups. Canvas 12×16 $49 / 18×24 $79 / 24×36 $119 / 36×48 $179 | From `memory/project_pricing_strategy.md` |

---

## Safety rails — non-negotiable

These are from the user's global `CLAUDE.md`. Quote them back to yourself if you feel like bending any.

- **Commit per task. Never batch.** Every commit leaves `typecheck + smoke + tests` green.
- **Verify don't claim.** Don't mark a task complete without proving it works. Type-check + build is not proof of correctness. Drive the affected flow via Playwright after every web-touching task.
- **Three-strike rule.** If the same task fails verification 3 times in a row, STOP. Write a `BLOCKER:` entry in the progress log describing root cause and what you tried. Move to the next independent task. Do not patch-spiral.
- **No force-push. No `--no-verify`. No direct commits to main.** All work on a worktree branch, merged via `--ff-only` at phase boundaries.
- **No destructive operations without explicit user consent.** That means no `rm -rf`, no `reset --hard`, no dropping DB tables. The user is asleep — when in doubt, don't.
- **Pause before schema migrations.** Write the SQL, test on an ephemeral local container, commit the file. Flag for the morning — never auto-run against the hosted Supabase prod DB.
- **External services: dry-run only.** No real Stripe API calls at runtime this session. No emails actually sent. Everything is local + mocked until the user wires keys in the morning.
- **Never mock what you're testing.** Integration tests hit a real (local) DB, not mocks. Mocks for external APIs (Stripe, fal) only.
- **Errors are tagged `[module] message`** per `feedback_tag_error_messages.md`. Tags go to `console.error`, not into user-visible copy.
- **No `console.log` in production code** per typescript rules.
- **Never run `npm test -- --watch`** or any hanging process without `run_in_background: true`.
- **Escape test budget: ~$5 worth of fal calls** if anything hits the real fal API during overnight. Past that, stop and flag. (Prefer stubs.)

---

## Task ID conventions

- Phase letter + number: `A1`, `B3`, `F7`, etc.
- `[PARALLEL]` — can run concurrently with sibling tasks in same phase.
- `[BLOCKER-RISK]` — likely to need user input or external setup; skip and move on if blocked.
- `[USER-MORNING]` — do NOT execute. Add to morning checklist.

---

## Phase A — Harness

**Goal:** Set up the safety infrastructure so every subsequent phase has tests, CI, and a reliable verification loop.

**Entry:** main at `474731b` or later. Worktree created at `.worktrees/prod-ready`. Branch: `prod-ready/main`.

**Tasks:**

- **A1.** Install Playwright (`npm i -D -w @haloframe/web @playwright/test` + `npx playwright install chromium`). Add `apps/web/playwright.config.ts`. Verification: `npx playwright --version` prints.
- **A2.** Scaffold `apps/web/tests/e2e/` directory. Add one smoke E2E test `home-loads.spec.ts` that navigates to `localhost:5187` and asserts the `For the ones we carry with us.` heading appears. Verification: `npx playwright test` passes.
- **A3.** Add `npm run test:e2e` and `npm run test:e2e:ui` scripts to the web package. Verification: both run clean.
- **A4.** Add Vitest for unit tests. `npm i -D -w @haloframe/web vitest @vitest/ui`. Scaffold `apps/web/src/**/*.test.ts` convention. One trivial test passing.
- **A5.** Scaffold GitHub Actions CI at `.github/workflows/ci.yml` — runs typecheck + smoke + vitest + playwright on every PR. Use `actions/setup-node@v4`, Node 20. Don't add secrets; the workflow should skip steps that need them (smoke needs Supabase, so guard with `if: secrets.SUPABASE_URL`). Verification: `yamllint .github/workflows/ci.yml` (if yamllint not available, eyeball the structure) + `gh workflow list` if `gh` is authenticated.
- **A6.** Add `docs/plans/2026-04-21-production-ready-progress.md` with the progress log header. This is your append-only log for the overnight run.
- **A7.** `git commit` each step with conventional message. Commit the whole phase as a series: `chore(test): install playwright`, `chore(test): add vitest`, `chore(ci): scaffold github actions`.

**Exit:** `npm run typecheck && node scripts/smoke-redesign.mjs && npm --workspace=@haloframe/web run test:e2e && npm --workspace=@haloframe/web run test -- --run` all green.

---

## Phase B — Production router cutover

**Goal:** The web client calls `/api/tribute/*` (the real state-machine router) instead of `/api/spike/*`. Verify the full flow works end-to-end through the production code paths.

**Why this phase is here:** `tribute.ts` was TS-fixed in `dc2028d` but never actually exercised. The spike router is simpler and hides behavior the prod router has (real `tributes` table writes, template seeding, entitlement checks against DB).

**Entry:** Phase A green.

**Tasks:**

- **B1.** Read `apps/api/src/routes/tribute.ts` vs `apps/api/src/routes/spike.ts`. Document the behavioral diff in progress log. Identify which `apps/web/src/lib/api.ts` call-sites hit `/api/spike/*` and need rewiring.
- **B2.** Verify the `tributes` + `tribute_templates` tables exist in Supabase via `scripts/smoke-redesign.mjs` or a new diagnostic query. If tables don't exist or templates aren't seeded, run `apps/api/scripts/seed-templates.ts` against the DB. [BLOCKER-RISK: may need user-provided SUPABASE_SERVICE_ROLE_KEY — should already be in `.env` since smoke works.]
- **B3.** Add `SPIKE_MODE` toggle to `.env.example` documentation + ensure it defaults `false` in prod-like configs.
- **B4.** Update `apps/api/src/index.ts` to mount `tributeRouter` when `SPIKE_MODE=false`. Verify it's wired.
- **B5.** Rewire `apps/web/src/lib/api.ts` and any call-sites in `EnhanceFlow.tsx`, `ReuniteFlow.tsx`, `Editor.tsx` to hit `/api/tribute/*` endpoints. This includes: create draft, upload-url, segment, select, merge, apply, finalize, hd, list, delete.
- **B6.** Add a `VITE_API_MODE=spike|prod` env toggle so we can fall back to spike for local-only dev if needed.
- **B7.** Write E2E test `tests/e2e/enhance-full-flow.spec.ts` — drives the full Enhance flow against the prod router. Uses `.playwright-mcp/portrait.jpg` fixture.
- **B8.** Write E2E test `tests/e2e/reunite-full-flow.spec.ts` — same for Reunite.
- **B9.** Run both E2E tests. Expect them to fail on first run — fix bugs uncovered in either router or web client until they pass.
- **B10.** Re-run the existing smoke. Update `scripts/smoke-redesign.mjs` to use `/api/tribute` endpoints instead of `/api/spike` where appropriate.

**Exit:** Both E2E flows green against `/api/tribute/*`. Spike router is still mounted behind the flag for local dev but the default path is prod.

---

## Phase C — Auth, social, and session upgrade

**Goal:** Users can sign up / sign in via magic link, email+password, Google, or Apple. Anon users see a sign-in modal when they tap Save. After signing in, their draft tribute is preserved and saved into their new account.

**Entry:** Phase B green.

**Tasks:**

- **C1.** In Supabase dashboard: confirm Google + Apple OAuth providers exist or document steps in `docs/SETUP.md` for the user to enable them in the morning. [USER-MORNING: final OAuth config + redirect URLs — but write the app code assuming they'll be enabled.]
- **C2.** Add `apps/web/src/screens/SignInScreen.tsx` with tabs for Email / Google / Apple / Magic Link. Use existing token system — this screen should feel editorial, not generic.
- **C3.** Add `apps/web/src/screens/SignUpScreen.tsx` (email + password + display name). Reuse SignInScreen layout.
- **C4.** Add `apps/web/src/screens/ResetPasswordScreen.tsx` (request + confirm flows).
- **C5.** Add `apps/web/src/screens/AuthCallbackScreen.tsx` for handling OAuth redirects from Google/Apple.
- **C6.** Add `AuthGateModal` component — triggered when an anon user taps Save. Shows the 4 sign-in methods with copy tuned for the moment: "Sign in to keep your tribute. Your work stays with you."
- **C7.** Wire session-upgrade logic. When anon user signs in, Supabase's `linkIdentity` flow runs. Their draft tribute (in `state` of the `tributes` row) is already tied to the anon `user_id`; after upgrade, the user_id stays the same (Supabase anon → permanent is a user-linking, not a new-user creation). Verify this end-to-end.
- **C8.** Add sign-out button to SettingsScreen. Add account display (email + provider) to Settings.
- **C9.** Add `apps/web/src/hooks/useAuth.ts` enhancements if existing hook doesn't expose `signInWithOtp`, `signInWithPassword`, `signInWithOAuth`, `signUp`, `resetPasswordForEmail`.
- **C10.** Update `apps/web/src/lib/navigation.tsx` Screen union: `'SIGN_IN' | 'SIGN_UP' | 'RESET_PASSWORD' | 'AUTH_CALLBACK'`. Add push helpers.
- **C11.** E2E test `tests/e2e/auth-save-gate.spec.ts`: anon user starts Enhance, taps Save, sees modal, signs in with magic link (stub email delivery), lands back on Editor with Save in flight.
- **C12.** E2E test `tests/e2e/auth-signup-signin.spec.ts`: happy path for sign-up + sign-out + sign-in via email+password.
- **C13.** Social (Google/Apple) cannot be E2E'd without real OAuth providers — document in progress log, flag as manual verification by user in the morning.

**Exit:** Auth flows pass E2E. Anon-to-authed upgrade preserves tribute state across sign-in. Sign-out returns to anon state cleanly.

---

## Phase D — Free tier enforcement

**Goal:** 1 free enhance + 1 free merge (2 total free creations, but one per flow type). Paywall triggers at the 2nd attempt of the same flow type OR at the 2nd save overall.

**Entry:** Phase C green.

**Tasks:**

- **D1.** Inspect `apps/api/src/services/entitlements.ts`. Current model grants 2 free credits regardless of flow type. Modify to track per-flow-type usage: `{ enhance_used: boolean, merge_used: boolean }` stored on the profile.
- **D2.** DB migration: add `enhance_used` and `merge_used` columns to the profiles table. Write the SQL migration file at `db/migrations/2026-04-21-per-flow-free-tier.sql`. [USER-MORNING: do not auto-run against prod Supabase.] Test on local Supabase container (if available) or document as morning step.
- **D3.** Update `checkPhotoEntitlement()` signature to take `flowType: 'enhance' | 'reunite'`. Return `allowed: false, reason: 'upgrade_required'` if user is free-tier and has already used that flow type.
- **D4.** Update `recordUsage()` to flip the correct flag on first save.
- **D5.** Update `apps/web/src/lib/copy.ts` `emptyBalance` copy to reflect the new model: "Free tributes include one enhance and one reunite. You've used your free [enhance|reunite]."
- **D6.** Update home-screen credit badge: show "2 of 2 free" when nothing used, "1 of 2 free" after one type used, "Extend membership" state when both used.
- **D7.** E2E test `tests/e2e/free-tier-enhance-then-paywall.spec.ts`: anon user signs up, does 1 enhance save → tries second enhance → paywall on save tap.
- **D8.** E2E test `tests/e2e/free-tier-one-of-each.spec.ts`: user does 1 enhance, then 1 merge, both succeed. Third attempt of either → paywall.

**Exit:** Free tier rules enforced at the API and reflected in UI. E2E tests green.

---

## Phase E — MyTributes populated state

**Goal:** Users who are signed in and have saved tributes see them in the `MyTributes` tab with a real gallery.

**Entry:** Phase C + D green.

**Tasks:**

- **E1.** Wire `GET /api/tribute/` (already exists) to web. Add `apps/web/src/hooks/useTributes.ts` with React Query or equivalent cache.
- **E2.** Remove `hasTributes = false as const` in `MyTributesScreen.tsx`. Replace with `useTributes()` hook.
- **E3.** Port the populated-state JSX from `design/MyTributes.standalone.html`. Gallery grid, tribute thumbnail cards.
- **E4.** Tap a tribute → opens detail view (lightbox) with Order canvas / Edit again / Download actions.
- **E5.** Add `DELETE /api/tribute/:id` handler (already exists) wiring + confirmation modal in web.
- **E6.** Sign-out should clear the cache. Sign-in as different user should refresh.
- **E7.** E2E test `tests/e2e/my-tributes-populated.spec.ts`: user saves 1 tribute → navigates to MyTributes → sees their tribute → taps Download → file downloaded → taps Delete → tribute gone.

**Exit:** Populated-state gallery works. Delete + download flows work.

---

## Phase F — Stripe payments (subs + top-ups + prints)

**Goal:** All payment flows wired. Everything is gated on `STRIPE_SECRET_KEY` env var — when unset, endpoints return 501 with a "use mobile app" fallback (existing behavior). When set, real Stripe Checkout fires.

**CRITICAL:** No real Stripe API calls during overnight session. Use Stripe's test mode API key if one is already in the repo's `.env` (check first); otherwise, write the code paths and verify with `stripe-mock` or unit tests only. User will wire real keys in the morning.

**Entry:** Phase C + D green.

**Tasks:**

- **F1.** Read `apps/api/src/routes/subscription.ts` current state. Document what's stubbed, what's real.
- **F2.** Install `stripe` SDK if not present: `npm i -w @haloframe/api stripe`.
- **F3.** Add `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_KEEPSAKE`, `STRIPE_PRICE_HERITAGE_MONTHLY`, `STRIPE_PRICE_HERITAGE_ANNUAL`, `STRIPE_PRICE_TOPUP_SINGLE`, `STRIPE_PRICE_TOPUP_4PACK`, `STRIPE_PRICE_CANVAS_12X16`, `STRIPE_PRICE_CANVAS_18X24`, `STRIPE_PRICE_CANVAS_24X36`, `STRIPE_PRICE_CANVAS_36X48` to `.env.example` with comments. [USER-MORNING: user creates Stripe products + pastes prices into their `.env`.]
- **F4.** Implement `POST /api/subscription/purchase` — creates a Stripe Checkout session for the requested product ID. Subscriptions use `mode: 'subscription'`, top-ups use `mode: 'payment'`.
- **F5.** Implement `POST /api/prints/checkout` — separate endpoint for canvas prints. Takes `{ tributeId, size, shippingAddress }`. Creates a Checkout session. Metadata includes tribute ID and size for webhook fulfillment.
- **F6.** Implement `POST /api/webhook/stripe` — handles `checkout.session.completed` (credits top-ups + subscriptions + fires print order email), `customer.subscription.updated`, `customer.subscription.deleted`. Use raw body parsing + signature verification. Must be idempotent (Stripe may retry).
- **F7.** Implement print order email. Use `nodemailer` with SMTP or `resend` SDK. [USER-MORNING: user provides SMTP creds OR a Resend API key.] For overnight: write the code assuming `RESEND_API_KEY` env var; when unset, log the would-be email to stderr with all details. Email template includes: customer name, shipping address, payment ID, tribute ID, size, price, signed high-res download URL (30-day expiry).
- **F8.** Customer receipt email (separate template) sent on successful checkout.
- **F9.** `POST /api/subscription/restore` — reads Stripe customer subscriptions by email and updates the user's profile. Show a toast on success or "no subscriptions found" on empty.
- **F10.** `POST /api/subscription/cancel` — cancels active subscription via Stripe API.
- **F11.** Update paywall CTA handlers to call `/api/subscription/purchase` with the right product ID. On success, `window.location = checkoutUrl`. On 501, show the existing "coming soon" toast.
- **F12.** Update PrintShopScreen Order buttons to navigate to a new `CheckoutScreen` or open Stripe Checkout hosted. Collect shipping address (via Stripe Checkout's address-collection feature — simpler than building our own).
- **F13.** Add Stripe webhook handler integration test (mock Stripe events).
- **F14.** E2E test `tests/e2e/paywall-subscribe-click.spec.ts`: authed free-tier user hits paywall, picks Keepsake, clicks Begin — verifies the redirect happens (without actually going to Stripe).

**Exit:** All payment endpoints return correct responses in test mode. Webhook handler tested with signed Stripe events. Paywall + prints both have working checkout redirects when keys present; graceful 501 when not.

---

## Phase G — Legal + data management

**Goal:** Privacy policy + terms of service pages. Data-deletion endpoint. Account-delete UI.

**Entry:** Phase C green.

**Tasks:**

- **G1.** Create `apps/web/src/screens/LegalScreen.tsx` with routing for `/privacy` and `/terms`. Link from Settings.
- **G2.** Draft Privacy Policy content based on a template for a memorial app handling user-uploaded photos. Cover: what data we collect, how we store (Supabase), retention policy, user rights (GDPR/CCPA), contact email. [USER-MORNING: user reviews with a lawyer, replaces any placeholders.]
- **G3.** Draft Terms of Service similarly. Cover: acceptable use (no uploading photos of non-deceased or photos without consent), payment terms, refund policy, cancellation, arbitration clause. [USER-MORNING: lawyer review.]
- **G4.** `DELETE /api/me` endpoint: cascades delete of user's tributes + profile + auth user. Use Supabase admin API to delete the auth user after clearing tribute + storage assets.
- **G5.** Delete-account UI in SettingsScreen. Double-confirm modal. On success → sign out → home.
- **G6.** Add a `GET /api/me/export` endpoint that returns a JSON blob of the user's tributes + profile for GDPR export right.
- **G7.** E2E test for account deletion (uses a disposable test user).
- **G8.** Footer link from every screen to `/privacy` and `/terms` (small, unobtrusive, editorial tone).

**Exit:** Legal pages accessible. Account deletion works end-to-end.

---

## Phase H — Ops: CI, Docker, rate-limit, observability

**Goal:** The API is deploy-ready to Railway. The web is deploy-ready to Vercel. Rate limiting active. Structured logging. Sentry hook that activates when DSN env var is set.

**Entry:** Phase B green (doesn't depend on later phases — can start as early as Phase A's exit, but is easier to test after F since rate limits need real endpoints).

**Tasks:**

- **H1.** `apps/api/Dockerfile` — multi-stage build, non-root user, pnpm or npm as appropriate. Expose 4000.
- **H2.** `apps/api/railway.json` — Railway service config. Starts `node dist/index.js`. Env vars documented.
- **H3.** `apps/web/vercel.json` — build command, output directory, routes (including `/privacy`, `/terms` SPA fallbacks), headers (CSP, HSTS, X-Content-Type-Options).
- **H4.** Install `express-rate-limit`: `npm i -w @haloframe/api express-rate-limit`. Apply to `/api/*` with a reasonable default (60 req/min per IP for mutations, 300/min for reads). Stricter on auth endpoints (10/min).
- **H5.** Install `helmet` (already a dep). Configure CSP headers. Tight but allows fonts.googleapis.com (per index.html), Supabase, Stripe.
- **H6.** Install `@sentry/node` in API and `@sentry/react` in web. Both should no-op when `SENTRY_DSN` env is unset. Hook error boundaries in web.
- **H7.** Structured logging: the `pino` config already exists. Ensure all route handlers log to it with request IDs (add middleware if not there).
- **H8.** Health checks: `/healthz` (liveness, returns 200 instantly) and `/readyz` (readiness, checks DB + fal reachability) endpoints.
- **H9.** Graceful shutdown: handle SIGTERM, drain in-flight requests up to 30s.
- **H10.** `docs/DEPLOY.md` — step-by-step instructions for the user's morning: Railway signup → connect repo → add env vars → deploy. Vercel signup → connect repo → add env vars → deploy.
- **H11.** Verify Dockerfile builds locally: `docker build apps/api`. [Optional — skip if Docker isn't installed; flag for morning.]

**Exit:** Docker image builds. CI runs the deploy-config lint. DEPLOY.md written.

---

## Phase I — Capacitor mobile wrapper

**Goal:** iOS + Android projects generated. App icons + splash screens. Plugins wired. Build configurations set.

**Entry:** Phase H green (so the web app is production-ready before wrapping).

**Important:** This phase creates project scaffolds but does NOT submit to the stores. Submission requires Apple Developer + Google Play accounts which the user creates in the morning.

**Tasks:**

- **I1.** Install Capacitor in the web workspace: `npm i -w @haloframe/web @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`.
- **I2.** `npx cap init haloFrame com.haloframe.app --web-dir=dist`. Commit `capacitor.config.ts`.
- **I3.** Add platform: `npx cap add ios` and `npx cap add android`. This creates `apps/web/ios/` and `apps/web/android/` directories.
- **I4.** App icons. Generate from the `apps/web/public/favicon.svg` via `@capacitor/assets` tool. Create all required sizes for iOS + Android.
- **I5.** Splash screens (memorial-themed — gold dot on cream background matching the home wordmark's halo glyph).
- **I6.** Install plugins: `@capacitor/camera`, `@capacitor/filesystem`, `@capacitor/share`, `@capacitor/haptics`, `@capacitor/app` (deep linking), `@capacitor/preferences` (secure storage). `npx cap sync`.
- **I7.** Deep link scheme registration for auth callbacks: `haloframe://` custom scheme + Universal Links / App Links for the web domain. [USER-MORNING: final domain-based Universal Link setup requires Apple + domain SSL; native registration done now.]
- **I8.** Update `apps/web/src/lib/download.ts` to use `@capacitor/filesystem` when running in Capacitor (saves to Photos app on iOS, gallery on Android); fall back to current web behavior otherwise. Test via `Capacitor.isNativePlatform()`.
- **I9.** Update `apps/web/src/lib/haptics.ts` (already exists) to route through `@capacitor/haptics` on native.
- **I10.** `apps/web/vite.config.ts` — ensure build output works for Capacitor (`base: './'` for relative paths on native).
- **I11.** Document the native build process in `docs/DEPLOY.md`: Xcode steps for iOS, Android Studio steps for Android. [USER-MORNING: user opens Xcode / AS, archives, uploads.]
- **I12.** Smoke test the build: `cd apps/web && npm run build && npx cap sync && npx cap copy`. Both platforms should sync without errors. [Optional: open Xcode / Android Studio simulators if environment allows. Likely skip; flag for user.]

**Exit:** Both native projects exist, compile, and wrap the web app. User's morning task: open in Xcode / Android Studio, archive, upload.

---

## Phase J — Polish + final audit

**Goal:** Clean up the P2/P3 backlog from the redesign audit. Final security + accessibility pass.

**Entry:** Phase I green.

**Tasks:**

- **J1.** Delete `apps/web/src/components/UploadZone.tsx` + `LoadingOverlay.tsx` (zero callers after redesign port, noted in memory).
- **J2.** `.reunite-cutout` CSS: replace `transition: left 450ms` + `right` with `transform: translateX(...)` — GPU-compositing-friendly (audit finding).
- **J3.** `.reunite-quiet-btn` CSS: `min-height: 44px` (WCAG 2.5.8 touch target).
- **J4.** Paywall subhead: make dynamic (reflect actual usage not hardcoded "You've used your 2 tributes").
- **J5.** Restore-purchase: show a toast on success ("Your membership has been restored") or empty ("No active membership found"). P3 from E2E audit.
- **J6.** Top-up 4-pack 501: ensure the same toast as subscription CTA fires when Stripe key missing.
- **J7.** Re-run the `audit` skill against `apps/web/src/**` + `apps/api/src/**`. Fix any P0/P1 findings before shipping.
- **J8.** Re-run `security-auditor` agent (via the task tool) on the full codebase. Critical findings must be fixed.
- **J9.** Final E2E suite run: all tests green.
- **J10.** Lighthouse CI run on the Vite build (localhost preview). Flag any regression in Perf / A11y / Best-Practices < 90.

**Exit:** Audit clean. All P2/P3s from previous audit addressed.

---

## Phase K — Handoff doc

**Goal:** A single morning checklist so the user can go from repo → live in the morning.

**Entry:** Phase J green.

**Tasks:**

- **K1.** `docs/MORNING_CHECKLIST.md` — step-by-step manual actions the user must take. Grouped by provider:
  - **Supabase:** enable Google + Apple OAuth, paste redirect URLs (which I'll have generated).
  - **Stripe:** create products + prices, copy price IDs into Railway env.
  - **Apple Developer:** $99 annual signup, create App ID, certificates, provisioning profiles, upload via Xcode Organizer.
  - **Google Play:** $25 one-time signup, create app listing, upload AAB from Android Studio.
  - **Railway:** connect repo, paste env vars, deploy API.
  - **Vercel:** connect repo, paste env vars, deploy web.
  - **Domain:** purchase (Namecheap / Cloudflare), configure DNS.
  - **Email sending:** Resend signup + API key OR SMTP config.
  - **Legal:** lawyer review of draft Privacy + Terms.
- **K2.** Run `scripts/smoke-redesign.mjs` one final time against local. Green.
- **K3.** `docs/WHATS_DONE.md` — summary for morning scan: what was built, what was tested, what commits (+ hashes).
- **K4.** Write a final progress log entry: "Plan complete. Awaiting user morning actions."
- **K5.** Push the `prod-ready/main` branch to origin. [USER confirmation required — if user hasn't pre-authorized, flag as last morning item.]
- **K6.** Merge plan: recommend fast-forward `prod-ready/main` → `main` once user verifies. Include in MORNING_CHECKLIST.md.

**Exit:** Session done. User has everything they need to take over.

---

## Morning checklist (high-level — detailed version in `docs/MORNING_CHECKLIST.md` after Phase K)

1. Review commits on `prod-ready/main` (probably 40-80 commits across phases).
2. Skim `docs/WHATS_DONE.md` + `docs/plans/2026-04-21-production-ready-progress.md` for blockers.
3. Stripe: create account, add products, paste keys into Railway env.
4. Supabase: enable Google + Apple OAuth providers.
5. Resend (or SMTP): create account, paste key into Railway env.
6. Apple Developer + Google Play: accounts.
7. Railway: connect repo, deploy API.
8. Vercel: connect repo, deploy web.
9. Domain: buy + DNS.
10. Lawyer: review template legal pages.
11. Merge `prod-ready/main` → `main` once production smoke passes.
12. Submit Capacitor builds to stores.

---

## Blocker protocol (three-strike rule)

If a task fails verification three times in a row with the same root cause:

1. **STOP.** Do not attempt a fourth fix.
2. Write a `BLOCKER:` entry in `docs/plans/2026-04-21-production-ready-progress.md` with:
   - Task ID
   - Symptoms observed
   - Hypotheses tried
   - Suspected root cause
   - Recommended next action (for user in the morning)
3. Mark the task `blocked` in your TaskList.
4. Move to the next **independent** task. Skip dependent tasks and flag them too.
5. Continue the phase around the blocker where possible.

If a phase cannot complete because of blockers, log it, move to the next phase that doesn't depend on the blocked work, and clearly flag dependent phases that are partially done.

---

## Progress log format (copy/paste template)

```markdown
## <ISO timestamp> — Phase <letter>, Task <id>: <short description>

**Action:** <what was done>
**Verification:** <how it was verified>
**Result:** <pass / fail / blocked>
**Commit:** <sha>
**Notes:** <anything the morning-reader needs>
```

For blockers:

```markdown
## <ISO timestamp> — BLOCKER: Task <id>

**Symptom:** <what failed>
**Root cause hypothesis:** <your best guess>
**Tried:** <what attempts>
**Next action for morning:** <what user should do>
```

---

## What is explicitly OUT of scope

Do not attempt in this session:

- Email marketing / newsletter signup / Mailchimp integration
- Analytics beyond Sentry (no Amplitude, Mixpanel, PostHog)
- Admin dashboard
- Multi-user collaboration on a single tribute
- A/B testing infrastructure
- Real-time notifications / websockets
- Performance optimization beyond the obvious (no premature sharding, caching, CDN tuning)
- Actually deploying to production (Railway / Vercel clicks belong to the user)
- App store submission (requires user's Apple/Google accounts)
- Real Stripe API calls (test mode only; prod mode when user adds keys)
- Real email sending (log to stderr when RESEND_API_KEY not set)
- Real live-DB schema migrations (write the SQL, don't auto-run)

---

## Start here

When you begin the session:

1. `cd C:/Users/claws/OneDrive/Desktop/haloFrame`
2. `git status` — confirm clean main
3. `git worktree add .worktrees/prod-ready -b prod-ready/main`
4. `cd .worktrees/prod-ready`
5. Open `docs/plans/2026-04-21-production-ready.md` (this file) and `docs/plans/2026-04-21-production-ready-progress.md` in your context.
6. `TaskCreate` for Phase A tasks A1-A7.
7. Start A1.
8. Go.
