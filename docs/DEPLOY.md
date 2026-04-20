# haloFrame — deploy checklist

Pairs with `docs/SETUP.md`. SETUP covers dashboard work (OAuth,
Stripe products, DNS). This doc covers the actual deploy mechanics.

## Prerequisites

Before deploy, confirm:

- [ ] All migrations under `supabase/migrations/` have been applied to the
      production Supabase project. The `20260421000001_per_flow_free_tier.sql`
      migration is required for Phase D enforcement — the app soft-fails
      without it but free-tier gating will be permissive.
- [ ] `npm --workspace=@haloframe/api run seed:templates` has run at least
      once against the production Supabase project.
- [ ] `.env` files are NOT checked into git (audited: `.gitignore` covers `.env`).

## 1. Web — Vercel

1. [vercel.com](https://vercel.com) → New Project → import the repo.
2. Project settings:
   - Root directory: `apps/web`
   - Framework preset: **Vite**
   - Build command: pulled from `apps/web/vercel.json`
   - Output directory: `apps/web/dist`
3. Environment variables — add these in Vercel → Settings → Environment Variables:
   - `VITE_SUPABASE_URL` — public Supabase URL
   - `VITE_SUPABASE_ANON_KEY` — public anon key
   - `VITE_API_MODE` — `prod` (or unset; defaults to `prod`)
4. Add your custom domain in Vercel → Settings → Domains.
5. Deploy. First build ~2-3 min.

Vercel's default caching + edge network is fine for a SPA of this size; no
further tuning required.

## 2. API — Railway

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub →
   pick the haloFrame repo.
2. Service → Settings → **Root Directory** = `.` (repo root) and **Dockerfile
   Path** = `apps/api/Dockerfile`. (`railway.json` already specifies this but
   Railway sometimes needs it set in the UI too.)
3. Add env variables. Use the `Raw Editor` and paste the non-`VITE_*` block
   from your local `.env`. At minimum:
   ```
   NODE_ENV=production
   SPIKE_MODE=false
   API_PORT=4000
   LOG_LEVEL=info
   CORS_ORIGINS=https://<your-vercel-domain>
   FAL_KEY=...
   SUPABASE_URL=...
   SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   STRIPE_SECRET_KEY=...          (once Stripe products exist)
   STRIPE_WEBHOOK_SECRET=...      (filled in after step 4 below)
   STRIPE_PRICE_KEEPSAKE=...
   STRIPE_PRICE_HERITAGE_MONTHLY=...
   STRIPE_PRICE_HERITAGE_ANNUAL=...
   STRIPE_PRICE_TOPUP_SINGLE=...
   STRIPE_PRICE_TOPUP_4PACK=...
   STRIPE_PRICE_CANVAS_12X16=...
   STRIPE_PRICE_CANVAS_18X24=...
   STRIPE_PRICE_CANVAS_24X36=...
   STRIPE_PRICE_CANVAS_36X48=...
   RESEND_API_KEY=...
   RESEND_FROM=orders@haloframe.app
   ORDER_NOTIFICATION_EMAIL=aqil.lakhani8@gmail.com
   SENTRY_DSN=...                 (optional)
   ```
4. After the first successful deploy, grab the Railway-provided domain (or
   attach your `api.haloframe.app` custom domain). Register it as the Stripe
   webhook endpoint in the Stripe dashboard:
   ```
   https://<railway-domain>/api/webhook/stripe
   ```
   Copy the signing secret and paste as `STRIPE_WEBHOOK_SECRET` in Railway.
   Redeploy.
5. Health endpoints: `/healthz` (liveness) and `/readyz` (DB probe) are
   pre-wired and match the `healthcheckPath` in `railway.json`.

## 3. DNS

Point DNS once both platforms have accepted their custom domains:

- `haloframe.app` + `www.haloframe.app` → Vercel (A/CNAME per Vercel's
  dashboard instructions).
- `api.haloframe.app` → Railway CNAME.
- Keep TTLs short (300s) on the initial cutover so you can roll back fast
  if anything misbehaves.

## 4. Capacitor (iOS + Android)

Native projects are generated in Phase I at `apps/web/ios` and
`apps/web/android`. For the actual app-store submission:

### iOS
1. Open `apps/web/ios/App/App.xcworkspace` in Xcode 15+.
2. Team → your Apple Developer account.
3. Bundle identifier → `com.haloframe.app` (matches `capacitor.config.ts`).
4. Archive → Distribute App → App Store Connect → Upload.
5. TestFlight internal testing → submit for review.

### Android
1. Open `apps/web/android` in Android Studio.
2. Build → Generate Signed Bundle / APK → AAB.
3. Use the key you generated via keytool (document the alias + passwords in
   a password manager — Google Play rejects unsigned builds).
4. Upload the AAB to Google Play Console → Internal testing.

Both platforms require the web app to be reachable at
`https://haloframe.app` before archive so Universal Links / App Links can
resolve from the installer.

## 5. Post-deploy smoke

From your laptop with the prod domain reachable:

```bash
# API smoke
node scripts/smoke-redesign.mjs   # requires local .env pointing at prod

# Web smoke via Playwright
cd apps/web && npm run test:e2e
```

Expected output: 9 API checks green + 1 E2E green.

## 6. Rollback

Vercel: Deployments tab → prior deployment → "Promote to Production".
Railway: Deployments tab → prior deployment → "Redeploy".

Neither platform touches Supabase data. The only path to losing DB state is
rolling back a migration — don't do that without a backup.

## 7. Known deferred work

See `docs/plans/2026-04-21-production-ready-progress.md` for the full
`DEFERRED:` tag list. Summary:
- `DEFERRED:B5-full-rewire` — full `/api/tribute/*` AI rewiring (current
  path uses `/api/spike/*` + a persistence bridge; works but not ideal).
- `DEFERRED:B7-*`, `DEFERRED:C11-*`, `DEFERRED:D7-*`, `DEFERRED:F13-14`
  — full-flow E2E test suites that need fal/Supabase/Stripe live
  fixtures. Run as manual QA after first deploy.
