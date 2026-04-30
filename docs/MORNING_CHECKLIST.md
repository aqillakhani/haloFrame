# Morning checklist — taking haloFrame live

Hi. Overnight session shipped **~30 commits** on the `prod-ready/main`
branch. Everything compiles, typechecks, and the smoke test is green. This
doc walks you through the manual steps only you can do.

Time budget if nothing surprises you: **~2-3 hours**. Most of it is waiting
for verification emails.

## 1. Read first (10 min)

- `docs/plans/2026-04-21-production-ready-progress.md` — the play-by-play
  log, including **every `DEFERRED:` tag** for work I skipped on purpose.
- `docs/WHATS_DONE.md` — high-level summary.
- `git log prod-ready/main ^main --oneline` — the commit series.

## 2. Supabase — 20 min

**This one is blocking — nothing else works until it's done.**

1. Apply the new migration:
   ```sql
   -- file: supabase/migrations/20260421000001_per_flow_free_tier.sql
   -- Additive (adds columns with defaults). Safe on live DB.
   ```
   Either via the dashboard SQL editor or `supabase db push`.

2. Enable OAuth providers (full walkthrough in `docs/SETUP.md` §1.2 + §1.3):
   - Google (Google Cloud + Supabase dashboard)
   - Apple (Apple Developer + Supabase dashboard — requires your $99 account)

3. Confirm "Allow anonymous sign-ins" is still enabled (Auth → Providers →
   Anonymous).

## 3. Stripe — 45 min

1. Create account at [dashboard.stripe.com](https://dashboard.stripe.com).
2. In **Products**, create each SKU listed in `docs/SETUP.md` §2. Copy
   every price id into a text scratchpad — you'll need them in step 6.
3. Developers → API keys → copy `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY`.
4. Don't register the webhook endpoint yet — wait until Railway is deployed
   (step 6) so you have a real URL.

## 4. Resend (email) — 5 min

1. [resend.com](https://resend.com) → sign up, verify your sending domain.
2. Copy the API key as `RESEND_API_KEY`.
3. Pick an envelope sender, e.g. `orders@gethaloframe.com` → set as
   `RESEND_FROM`.

## 5. Vercel (web) — 15 min

Follow `docs/DEPLOY.md` §1. Attach your domain before moving on.

## 6. Railway (API) — 20 min

Follow `docs/DEPLOY.md` §2. The env block needs every Stripe key you
collected in step 3. Once Railway is live:

- Go back to Stripe → Developers → Webhooks → add endpoint
  `https://<your-railway-domain>/api/webhook/stripe`. Copy the signing
  secret as `STRIPE_WEBHOOK_SECRET` in Railway. Redeploy.
- Test `/healthz` and `/readyz` from curl. Both should return 200.

## 7. DNS — 10 min + propagation wait

`docs/DEPLOY.md` §3. Propagation can be fast (~minutes on Cloudflare) or
slow (hours on a stale registrar). Keep TTL at 300 on the first cutover so
rollback is painless.

## 8. Capacitor / App Store / Google Play — later

`docs/DEPLOY.md` §4. You don't have to do this on day-one — the web app is
the v1 surface. Shipping the wrappers requires:

- Mac with Xcode 15+ (iOS)
- Android Studio (Android)
- `npx cap add ios` + `npx cap add android` from `apps/web/` (didn't run
  overnight because the overnight host is Windows)

Plan a block of time for the first archive — Apple's review can take 1-3 days.

## 9. Legal — 2 hours to a few days

`LegalScreen.tsx` ships with template Privacy + Terms with explicit
`{{PLACEHOLDER}}` markers. Run them past a lawyer before pointing real
customers at the domain. Your lawyer should:

- Replace `{{COMPANY_LEGAL_NAME}}`, `{{CONTACT_EMAIL}}`, `{{JURISDICTION}}`.
- Add any product-specific terms I couldn't anticipate (e.g. your printing
  company's return policy for custom canvas).
- Confirm the data retention language matches Supabase's defaults (which
  are honored by these templates).

## 10. Merge + push to main

Once verified in a staging environment:

```bash
git checkout main
git merge --ff-only prod-ready/main
git push origin main
```

If it's not fast-forward-mergeable, investigate — I tried hard to keep it
linear.

## 11. DEFERRED items to triage

Search the progress log for `DEFERRED:` and decide which ones matter for
launch. My suggested priorities:

**Ship-blockers** (do before public launch):
- `DEFERRED:F9-F10` — restore + cancel buttons. Stripe's hosted customer
  portal covers this in the meantime via billing.stripe.com/p/login, but
  adding a native button in Settings is polite.

**Nice-to-have** (within first month):
- `DEFERRED:B7-*`, `C11-*`, `D7-*`, `F13-14` — full-flow E2E tests. Manual
  QA covers the gap; these reduce regression risk for future changes.

**Later / never** (out of scope for v1):
- `DEFERRED:B5-full-rewire` — full `/api/tribute/*` migration. The bridge
  pattern works fine in prod; you'd only do this if you want tribute state
  machine features (resume unfinished tribute, etc.).

## 12. App-store launch — what's left for Aqil

The `appstore-launch` branch has shipped **~30 commits** on top of
`prod-ready/main` covering the App Store + Play Store production
readiness work (RC client SDK, AI consent modal, watermarking,
reporting flow, native picker, public legal pages, Capacitor
scaffolds, Codemagic CI, the reviewer-account seeder, and the full
store-listings + reviewer-notes + beta-recruitment doc set).

Most of it is autonomous. The list below is the manual surface only
you can move.

### 12.1 Database — migrations applied ✓

Both migrations are now live on production Supabase project
`uqbckeyoclbhqntawsrz`:

```bash
supabase/migrations/20260421000001_per_flow_free_tier.sql  # applied 2026-04-28
supabase/migrations/20260425000001_app_store_compliance.sql  # applied 2026-04-25
```

The `20260425000001` migration adds `profiles.ai_consent_at`,
`tributes.flagged_at`/`flagged_reason`, and the `reports` table —
required for the Apple 5.1.2(i) consent surface and the Google AI
Content Policy reporting flow.

The `20260421000001` migration adds `profiles.enhance_used` +
`profiles.merge_used` (per-flow free-tier gate) and bumps the
`credits_remaining` default from 2 → 3. Existing free-tier rows
were intentionally NOT bumped — the per-flow flags are the primary
gate now anyway.

Nothing left to do here. If you ever apply a new migration, log it
the same way (file path + applied-on date) so this section stays a
single source of truth.

### 12.2 Vercel — RevenueCat env vars

The web bundle reads two new public env vars at build time:

```
VITE_RC_IOS_KEY=appl_xxxxxxxxxxxx
VITE_RC_ANDROID_KEY=goog_xxxxxxxxxxxx
```

Get them from RevenueCat dashboard → Project → API keys (per
platform). Set in Vercel → Settings → Environment Variables for
**all three environments** (Preview, Production, Development).
Redeploy.

These are **public** SDK keys — safe to embed in the bundle. They
authenticate the RC SDK on device; the secret key
`REVENUECAT_SECRET_KEY` lives only on Railway.

### 12.3 Railway — no new env vars

The API didn't need any new env vars for the app-store work. The
existing list (`docs/DEPLOY.md` §2) is complete. `WATERMARK_DISABLED`
exists for tests but defaults sensibly in production.

Double-check `RESEND_API_KEY` is set since the `/api/report` flow
emails you when a tribute is reported.

### 12.4 Reviewer account — already seeded

`scripts/seed-reviewer-account.mjs` was run against prod on
2026-04-25. Confirmed state in `uqbckeyoclbhqntawsrz`:

- `reviewer@gethaloframe.com` (auth user `2b3eecbf-538f-4766-ba92-a4f3cec43f1b`)
- 22 credits available (2 lifetime + 20 top-up, expires 2027-04-25)
- 4 sample portraits in `tributes-source/<userId>/seed/`
- Password: in `1Password → haloFrame → reviewer@gethaloframe.com` (or
  retrieve from the `REVIEWER_PASSWORD` env var that was passed to
  the script — same value, `HaloReview-Stub-2026!`)

If you ever need to refresh credits or rotate the password: re-run
the seeder. It's idempotent — credits get RESET (not incremented),
photos get upserted, the user is preserved.

### 12.5 Capacitor scaffolds — committed

Both `apps/web/ios/` and `apps/web/android/` were generated via
`npx cap add ios` / `npx cap add android` and committed in Phase 8.
Codemagic builds from these directories on every tag push. No
manual action needed unless you want to update `Info.plist` /
`AndroidManifest.xml` beyond the v1 minimum (the Phase 8 commits
already cover NSPhotoLibraryUsageDescription, READ_MEDIA_IMAGES,
encryption-exemption flag, etc.).

### 12.6 Codemagic — first-run setup

`.codemagic/secrets.md` documents the four secrets you need to set
in the Codemagic dashboard (App Store Connect API key, Issuer ID,
Key ID, Team ID). One-time work, ~20 min.

`docs/DEPLOY.md` §4.1 walks through the dashboard setup screen-by-
screen.

### 12.7 RevenueCat dashboard — Day 4 work

Per the launch calendar (design doc §6, Day 4 = Wed 2026-04-29), set
up the RC project, apps, products, entitlement, offering, and webhook.
Step-by-step in design doc §8.3. Two-hour task. Required before the
first IAP test on a TestFlight build.

### 12.8 App Store Connect + Play Console — Day 5-6

Day 5: ASC bundle ID, app record, sub group, 5 IAP products, API
key → RC. Day 6: Play Console app, listing skeleton, IAP products,
service account → RC.

Paste-ready listing copy lives in `docs/STORE_LISTINGS.md`. Paste-
ready review notes live in `docs/REVIEWER_NOTES.md`.

### 12.9 Beta tester recruitment — Day 0

Send 18 DMs **today** if you haven't already — the 14-day Google
Closed Testing clock can't start without 12+ active testers, and
recruitment is the largest schedule risk for the launch.

`docs/BETA_RECRUITMENT.md` has DM templates, channel order, day-by-
day execution, escalation playbook.

### 12.10 Day 14 — Sat 2026-05-09 — dual submit

The single most important date on the launch calendar. Both stores
get submission events on the same day, both 14-day clocks start
ticking together:

```bash
git tag v1.0.0-rc1
git push origin v1.0.0-rc1
```

Codemagic auto-builds iOS + uploads to TestFlight. In parallel,
manually:
- App Store Connect → TestFlight → External Testing → Submit for
  Review (kicks off 7-30 day window)
- Play Console → Closed Testing → Promote from Internal → add the
  Google Group (kicks off 14-day window)

After Day 14 you mostly wait. See `docs/plans/2026-04-25-app-store-launch-design.md` §6 weeks 3-6 for
the rest of the calendar.

### 12.11 Quick verification checklist

Before tagging `v1.0.0-rc1` on Day 14, eyeball this list:

- [ ] `https://gethaloframe.com/privacy` returns 200 (not a Vercel
      placeholder)
- [ ] `https://gethaloframe.com/terms` returns 200
- [ ] `https://gethaloframe.com/support` returns 200
- [ ] Sign in to TestFlight Internal build → consent modal renders
      → "I understand" lets you upload
- [ ] Composite shows "✨ AI-generated" badge in lightbox
- [ ] Settings → Restore Purchases is visible (native only)
- [ ] Settings → Manage Subscription deep-links out
- [ ] `reviewer@gethaloframe.com` can sign in with the 1Password
      credential
- [ ] `STORE_LISTINGS.md` §6 (Day-13 final pre-flight) checklist
      reads end-to-end with no missing values

## 13. If something is on fire

- Check Sentry (if you set up `SENTRY_DSN`).
- Railway → Deployments → Logs shows structured pino output with
  request IDs you can grep.
- Rollback: both platforms have one-click redeploys of prior versions.
- Supabase data doesn't roll back with the app — but nothing overnight
  touches schema in a destructive way, so there's no DB rollback work.

Good luck. Take your time. Call me if anything's off.
