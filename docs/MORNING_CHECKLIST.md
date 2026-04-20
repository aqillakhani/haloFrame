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
3. Pick an envelope sender, e.g. `orders@haloframe.app` → set as
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

## 12. If something is on fire

- Check Sentry (if you set up `SENTRY_DSN`).
- Railway → Deployments → Logs shows structured pino output with
  request IDs you can grep.
- Rollback: both platforms have one-click redeploys of prior versions.
- Supabase data doesn't roll back with the app — but nothing overnight
  touches schema in a destructive way, so there's no DB rollback work.

Good luck. Take your time. Call me if anything's off.
