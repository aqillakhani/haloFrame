# haloFrame — one-time setup checklist

This doc covers the manual steps the app's code can't do on its own:
enabling OAuth providers, creating Stripe products, wiring email delivery,
and flipping DNS. Most rows link out to the vendor dashboard; everything
else is inline.

Do these in order — each section assumes the previous one is done.

---

## 1. Supabase

### 1.1 Enable anonymous sign-ins

Needed so first-time visitors get a `user_id` and their 2 free tributes
before they commit to an account.

1. [Supabase dashboard → Auth → Providers](https://supabase.com/dashboard/project/_/auth/providers).
2. Find **Anonymous Sign-Ins** and toggle on.
3. Save.

### 1.2 Enable Google OAuth

1. Open the [Google Cloud console](https://console.cloud.google.com/).
2. Create a new project (or reuse one you already own).
3. **APIs & Services → OAuth consent screen** → configure as *External*, add
   your app name, support email, and — if you plan to submit to stores —
   your app domain + privacy URL + terms URL.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: *Web application*
   - Authorized redirect URIs:
     ```
     https://<YOUR-SUPABASE-PROJECT-REF>.supabase.co/auth/v1/callback
     ```
   - Copy the *client ID* and *client secret*.
5. Back in Supabase: Auth → Providers → **Google** → toggle on, paste the
   Google client ID and secret, save.

### 1.3 Enable Apple OAuth

Apple requires an Apple Developer account ($99/yr).

1. [developer.apple.com](https://developer.apple.com) → Certificates, IDs
   & Profiles → Identifiers → create a new *Services ID* (e.g.
   `app.haloframe.auth`).
2. Enable **Sign In with Apple** on the Services ID.
3. Add a return URL:
   ```
   https://<YOUR-SUPABASE-PROJECT-REF>.supabase.co/auth/v1/callback
   ```
4. Create a new **Key** with *Sign In with Apple* capability. Download the
   `.p8` private key.
5. In Supabase: Auth → Providers → **Apple** → toggle on. Paste:
   - Services ID (as the client ID)
   - Team ID (your Apple Developer Team ID)
   - Key ID (from the `.p8` you made)
   - The `.p8` key contents (multi-line)
   - Save.

### 1.4 Apply DB migrations

The initial schema + RLS + storage buckets + credit-ledger migrations live
under `supabase/migrations/`. The dev environment's `.env` already points
at the prod Supabase project, so run them from the repo root:

```bash
npx supabase db push --db-url "$SUPABASE_DB_URL"
```

Or apply them from the dashboard SQL editor one by one in filename order.

After migrations land, seed the templates:

```bash
npm --workspace=@haloframe/api run seed:templates
```

---

## 2. Stripe

Wired in Phase F. User actions:

1. [dashboard.stripe.com](https://dashboard.stripe.com) → create account.
2. Products → add each:
   - *Keepsake* — $9.99/mo subscription, price id → `STRIPE_PRICE_KEEPSAKE`
   - *Heritage* — $24.99/mo subscription, price id → `STRIPE_PRICE_HERITAGE_MONTHLY`
   - *Heritage Annual* — $199/yr subscription, price id → `STRIPE_PRICE_HERITAGE_ANNUAL`
   - *Single top-up* — $4.99 one-time, price id → `STRIPE_PRICE_TOPUP_SINGLE`
   - *4-pack top-up* — $14.99 one-time, price id → `STRIPE_PRICE_TOPUP_4PACK`
   - *Canvas 12×16* — $49 one-time, price id → `STRIPE_PRICE_CANVAS_12X16`
   - *Canvas 18×24* — $79 one-time, price id → `STRIPE_PRICE_CANVAS_18X24`
   - *Canvas 24×36* — $119 one-time, price id → `STRIPE_PRICE_CANVAS_24X36`
   - *Canvas 36×48* — $179 one-time, price id → `STRIPE_PRICE_CANVAS_36X48`
3. Developers → API keys — copy the publishable + secret keys into Railway
   env as `STRIPE_PUBLISHABLE_KEY` and `STRIPE_SECRET_KEY`.
4. Developers → Webhooks → add endpoint:
   ```
   https://api.gethaloframe.com/api/webhook/stripe
   ```
   Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   Copy the signing secret into Railway env as `STRIPE_WEBHOOK_SECRET`.

---

## 3. Email delivery (Resend)

Used for order notifications + customer receipts.

1. [resend.com](https://resend.com) → sign up, verify your domain.
2. API key → copy into Railway env as `RESEND_API_KEY`.
3. From address — use something like `orders@gethaloframe.com`.

The order-notification email goes to `ORDER_NOTIFICATION_EMAIL` (default
`aqil.lakhani8@gmail.com`).

---

## 4. Deploy targets

### 4.1 API — Railway

1. [railway.app](https://railway.app) → New project → Deploy from GitHub
   → pick the haloFrame repo → select `apps/api` as the service root.
2. Copy every env var in `.env.example` that isn't a `VITE_` or `EXPO_`
   value into Railway's environment.
3. Railway auto-detects the Dockerfile; first deploy takes ~3-5 min.
4. Attach a custom domain (e.g. `api.gethaloframe.com`) once DNS is in place.

### 4.2 Web — Vercel

1. [vercel.com](https://vercel.com) → New project → import repo → set
   root directory to `apps/web`.
2. Copy the `VITE_*` env vars from `.env.example` into Vercel's
   environment.
3. Build command `npm run build`, output directory `dist`.
4. Attach the apex + `www` domain once DNS is in place.

### 4.3 DNS

Point `api.gethaloframe.com` → Railway's public URL (CNAME). Point the apex
and `www` → Vercel via `A` record + `CNAME` as Vercel's DNS guide shows.

---

## 5. App stores

See `docs/DEPLOY.md` (generated in Phase H) for the Xcode/Android Studio
archive steps.

**Apple:** Developer account $99/yr. Create App ID, certificates, prov
profiles. Archive from Xcode, upload via Transporter.

**Google Play:** Developer account $25 one-time. Create listing, upload
AAB from Android Studio.

---

## 6. Legal

Final Privacy + Terms are templates — have a lawyer review before ship.
Drafts live at `apps/web/src/screens/LegalScreen.tsx` (generated in
Phase G).
