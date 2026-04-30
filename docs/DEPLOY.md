# haloFrame — deploy checklist

Pairs with `docs/SETUP.md`. SETUP covers dashboard work (OAuth,
Stripe products, DNS). This doc covers the actual deploy mechanics.

## Prerequisites

Before deploy, confirm:

- [ ] All migrations under `supabase/migrations/` have been applied to the
      production Supabase project. As of 2026-04-28, every committed
      migration through `20260425000001_app_store_compliance.sql` is
      live; verify by listing migrations in the Supabase dashboard
      (Database → Migrations) before any new release.
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
   RESEND_FROM=orders@gethaloframe.com
   ORDER_NOTIFICATION_EMAIL=aqil.lakhani8@gmail.com
   SENTRY_DSN=...                 (optional)
   ```
4. After the first successful deploy, grab the Railway-provided domain (or
   attach your `api.gethaloframe.com` custom domain). Register it as the Stripe
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

- `gethaloframe.com` + `www.gethaloframe.com` → Vercel (A/CNAME per Vercel's
  dashboard instructions).
- `api.gethaloframe.com` → Railway CNAME.
- Keep TTLs short (300s) on the initial cutover so you can roll back fast
  if anything misbehaves.

## 4. Native builds (iOS via Codemagic, Android local)

Native projects are scaffolded at `apps/web/ios` and `apps/web/android`.
There's no Mac on hand for this project, so iOS archives go through
**Codemagic CI** (free tier — 500 min/mo on the Mac mini M2 instance is
plenty for our cadence). Android builds run locally on Windows via
Gradle. Cross-link `.codemagic/secrets.md` for the exact env-var setup.

### 4.1 iOS — first-time setup

**Prerequisites** (one-time work, ~30 min):
- Apple Developer account ($99/yr) — `aqil.lakhani8@gmail.com`
- App Store Connect API key (Apple Dev Portal → Users and Access →
  Integrations → App Store Connect API → "+"). Role = **App Manager**.
  Apple gives you a `.p8` file ONCE — store it in 1Password
  (`haloFrame → asc-api-key.p8`). Capture the Issuer ID + Key ID from
  the same screen.
- Apple Developer Team ID (Apple Dev → Membership → 10-char string).
- Bundle ID `com.haloframe.app` registered (Apple Dev → Certificates,
  Identifiers & Profiles → Identifiers → "+" → App IDs). Enable the
  **In-App Purchase** capability; nothing else is needed at v1.
- App Store Connect app record (App Store Connect → My Apps → "+" →
  New App). Bundle id `com.haloframe.app`, SKU `haloframe-ios-001`,
  primary language English (U.S.). The app record must exist before
  Codemagic uploads will be accepted.

**Codemagic dashboard** (one-time work, ~20 min):
1. Sign up at https://codemagic.io with your GitHub account; pick the
   free tier (or Pro if your monthly minutes will exceed 500).
2. **Add app** → connect GitHub → select the repo. Codemagic detects
   `codemagic.yaml` at repo root and offers "use existing config." Take
   that option.
3. **Teams → Integrations → App Store Connect → Add integration:**
   - Integration name: `haloframe_asc` *(must match the YAML)*
   - Issuer ID: paste from the Apple key page
   - Key ID: paste from the Apple key page
   - Private key: upload the `.p8` directly (Codemagic encrypts at rest)
4. **Project → Environment variables → Add group:**
   - Name: `haloframe_secrets` *(must match the YAML)*
   - Add four variables, all marked **Secure**:
     - `APP_STORE_CONNECT_KEY_IDENTIFIER` — same as Key ID above
     - `APP_STORE_CONNECT_ISSUER_ID` — same as Issuer ID above
     - `APP_STORE_CONNECT_PRIVATE_KEY` — paste full `.p8` contents
       *including* `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----`
       markers
     - `APPLE_TEAM_ID` — 10-char team string from Apple Dev → Membership
5. **Project → Settings → Build triggers** → enable "Trigger on tag
   creation" with pattern `v*` (the YAML already declares this; the
   dashboard toggle is a redundant on switch in case the YAML setting
   gets overridden).

Full secret list with retrieval steps: `.codemagic/secrets.md`.

### 4.2 iOS — first archive (after dashboard setup)

```bash
git tag v1.0.0-rc1
git push origin v1.0.0-rc1
```

Codemagic detects the tag, kicks off the `ios-testflight` workflow
(see `codemagic.yaml`), and:

1. Installs root deps (`pnpm install --frozen-lockfile`).
2. Builds the web bundle (`pnpm --filter @haloframe/web run build`).
3. Runs `npx cap sync ios` to copy `apps/web/dist` into the iOS bundle.
4. Bumps marketing version (`v1.0.0-rc1` → `1.0.0`) + build number
   (Codemagic's monotonic per-project counter).
5. Initializes keychain, fetches signing files, applies provisioning
   profiles, builds the `.ipa`.
6. Uploads to App Store Connect → TestFlight; submits to the
   "external testers" beta group automatically.

**Wall-clock per stage:**

| Stage | Time |
| --- | --- |
| Codemagic build | ~12-15 min |
| Apple processes the upload | ~5-10 min |
| Available to internal testers | immediately after processing |
| External-review submission | ~7-30 days *(2026 backlog)* |

Watch the build log live at the dashboard URL Codemagic prints in the
GitHub Actions-style email it sends you.

### 4.3 iOS — common build failures

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "No matching profiles found" | Bundle id not registered on Apple | Apple Dev → Identifiers → "+" → register `com.haloframe.app`, then re-tag |
| "agvtool: marketing version 1.0.0 already used" | Same marketing version as a prior submission | Fine — build number must be monotonically newer; Codemagic handles this automatically |
| `@revenuecat/purchases-capacitor` Package.swift error | Capacitor 8 SPM resolution stale | Bump SPM cache: clear Codemagic's "Cache" tab, re-trigger |
| "Code signing certificate revoked" | Apple rotated the cert | Re-run `app-store-connect fetch-signing-files --create` from a local Mac, or delete the cert in ASC and let Codemagic auto-create |
| TestFlight processing stuck "Processing" >2h | Apple-side outage | Status: https://developer.apple.com/system-status — usually clears within 4h |

### 4.4 Android — local first build

No Codemagic for Android. Gradle on Windows works fine.

**Prerequisites** (one-time, ~15 min):
- Android Studio installed (Hedgehog 2023.1+ or Iguana 2023.2+).
- Android SDK 34 (Android 14) — Android Studio prompts you on first
  open.
- Java 17 (Android Studio bundles its own JDK; or install via
  `winget install Microsoft.OpenJDK.17`).
- Upload key generated and stored in 1Password:
  ```powershell
  keytool -genkey -v -keystore haloframe-upload.jks -keyalg RSA `
    -keysize 2048 -validity 10000 -alias haloframe-upload
  ```
  Document **alias**, **store password**, and **key password** in
  1Password (`haloFrame → android-upload-key`). Google Play rejects
  unsigned builds; losing this key means a permanent app-id rebrand.

**Build the AAB:**

```powershell
cd apps/web
npx cap sync android
cd android
./gradlew bundleRelease  # or gradlew.bat on Windows cmd
```

Output lands at `apps/web/android/app/build/outputs/bundle/release/app-release.aab`.

**Sign + upload to Internal Testing:**

1. Play Console → haloFrame app → Testing → Internal testing → Create
   new release.
2. Drop the `.aab` into the release uploader. Play Console handles
   the rest of signing if you opted into Play App Signing on the
   first upload (recommended — you keep your upload key, Google holds
   the production signing key).
3. Add yourself + 2-3 friends as internal testers (Internal Testing →
   Testers → Create email list).
4. Roll out to internal — installs available within ~1h.

### 4.5 Promotion path — Internal → Closed Testing → Production

**iOS (TestFlight):**

| Stage | What happens |
| --- | --- |
| Internal Testing | Auto on every Codemagic upload; team-only |
| External Testing (beta review) | Submit explicitly via "Submit for Review" in TestFlight; ~7-30 day window in 2026 |
| Production | After external review clears, promote in App Store Connect → "Submit for App Review" with the production checklist filled |

**Android (Play Console):**

| Stage | What happens |
| --- | --- |
| Internal Testing | Manual upload + add testers; ~1h propagation |
| Closed Testing | Promote from Internal; configure tester audience (Google Group); start the **14-day clock** with 12+ testers (see `docs/BETA_RECRUITMENT.md`) |
| Production | After 14-day window clears, promote from Closed Testing → New release in Production |

### 4.6 Coordinated dual-submit (Day 14 of the launch calendar)

Per `docs/plans/2026-04-25-app-store-launch-design.md` §6, Day 14 (Sat
2026-05-09) is the dual-submit day:

```bash
# Tag pushes to GitHub. Codemagic auto-builds + uploads iOS.
git tag v1.0.0-rc1
git push origin v1.0.0-rc1

# In parallel: TestFlight external review submit (App Store Connect → 
# TestFlight → External Testing → "Submit for Review")
# AND Android Closed Testing promotion (Play Console → Closed Testing →
# Promote release from Internal Testing → add 12-tester Google Group)
```

Both clocks start ticking simultaneously. Apple TestFlight returns
within 7-30 days; Google's 14-day Closed Testing rule is the rate
limiter for the production submit on Day 28.

### 4.7 Universal Links / App Links (deferred for v1)

The original DEPLOY.md noted both platforms need
`https://gethaloframe.com` reachable for Universal Links / App Links.
That requirement is still true if/when we ship deep linking, but at
v1 we don't have any deep links and `apple-app-site-association` /
`assetlinks.json` are not yet served. Add when we add deep linking;
for now, App Store and Play Store both accept submissions without
verified deep links.

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
