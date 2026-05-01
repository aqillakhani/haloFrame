# haloFrame — Play Store launch walkthrough

Click-by-click guide for the manual work needed to ship to Google Play.
Everything the codebase can't do for itself: dashboards, assets, DMs.

**Calendar:** 14-day Closed Testing clock + 3-7d production review =
~22 days from "first AAB uploaded with 12 testers locked in" to "live."
Today's date matters — every day of inaction is a day of slip.

**Already done (don't redo):**
- All Phase 0-12 implementation work + tests + docs
- Both DB migrations applied to production Supabase
- Reviewer account seeded (`reviewer@gethaloframe.com`, 22 credits, 4 sample portraits)
- Branch pushed to GitHub (`origin/appstore-launch`, 88 commits)

**Still needed (this doc).** Six phases below. Each step has:
URL | exact clicks | paste-ready copy | what success looks like.

---

## Phase A — Today (unblocked, no domain dependency)

These four can run in parallel. Start them today; nothing else gates
on them.

### A1. Send 18 beta DMs — **OVERDUE**

The 14-day Google Closed Testing clock is your launch bottleneck. It
can't start until you have 12 active testers in a Google Group, and
those testers need to be recruited 5+ days *before* you upload your
first AAB so they can confirm and you can chase ghosts. Every day of
delay slips your launch by one day.

**Time:** 90 minutes. **Cost:** $0.

**Action:**
1. Open `docs/BETA_RECRUITMENT.md` §2 — copy the primary DM template.
2. List 18 contacts in a scratchpad (family, friends, distant
   coworkers — see §3 for tier order).
3. Personalize the first sentence per recipient. Send via the channel
   they actually respond on (iMessage, WhatsApp, text — NOT email).
4. Track responses in `docs/BETA_TESTERS.txt` (gitignored — make it
   if it doesn't exist):
   ```
   2026-04-29  Friend 1   friend1@gmail.com  iMessage  yes  android Pixel 7
   2026-04-29  Friend 2   friend2@gmail.com  WhatsApp  no   iPhone-only
   ```

**Success:** 12+ "yes" responses by end of day Wednesday 2026-04-30.

If by Day-5 you have <10 yeses, escalate to Tier 3 channels (Reddit,
Facebook memorial groups). Full escalation playbook in
`docs/BETA_RECRUITMENT.md` §6.

---

### A2. Generate the Android upload keystore (15 min, one-time)

Google Play rejects unsigned builds. You generate this key once, store
it in 1Password, and use it for every release forever. **Lose this key
and your app's bundle ID is permanently un-shippable** — Google can
help in some cases via Play App Signing, but treat it as one-shot.

**Time:** 15 minutes. **Cost:** $0.

**Tools needed:** Java JDK on PATH. If `keytool` isn't found:

```powershell
winget install Microsoft.OpenJDK.17
# Or: install Android Studio (bundles JDK)
```

**Action (PowerShell):**

```powershell
cd "$env:USERPROFILE\Documents"
mkdir haloframe-secrets -ErrorAction SilentlyContinue
cd haloframe-secrets

keytool -genkey -v `
  -keystore haloframe-upload.jks `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -alias haloframe-upload
```

Prompts:
- **Keystore password:** generate a strong one (24+ chars). Save to
  1Password as `haloFrame → android-upload-keystore-password`.
- **Re-enter password:** same.
- **First/last name:** your name.
- **Organizational unit:** `haloframe`
- **Organization:** `{{COMPANY_LEGAL_NAME}}` (whatever you'll register
  with Google Play)
- **City/state/country:** your real values.
- **Is the data above correct?** `yes`
- **Key password (optional, press Enter for same as keystore):** press
  Enter — same password is fine and simpler.

**Output:** `haloframe-upload.jks` in `~/Documents/haloframe-secrets/`.

**Save to 1Password:**
- New secure note `haloFrame → android-upload-keystore`.
- Attach the `.jks` file.
- Document: alias = `haloframe-upload`, store password (auto-generated
  above), key password (same).

**Success:** `keytool -list -keystore haloframe-upload.jks` shows
1 entry called `haloframe-upload`.

---

### A3. Order the app icon (2-4 day lead time)

Phase 8 generated a placeholder icon (warm beige + gold halo + lowercase
"h"). Production needs a real icon designed by someone who does icons
for a living.

**Time (you):** 30 min to write brief + place order. **Cost:** $25-75.

**Brief (paste into Fiverr or your designer):**

```
Project: app icon for haloFrame, a memorial-photo app

Concept: a still, warm portrait — feels like a halo of light around
someone you remember. Editorial restraint, not religious iconography.

Style: warm beige #FAF3E2 background, soft gold #C9A971 ring or halo
accent, simple typographic mark (likely a lowercase "h" or "hf"),
subtle vintage photographic warmth (not glossy, not flat).

Reference apps with similar editorial feel:
- Day One Journal (warm + minimal)
- Mosaic (Photo book app — calm + soft)
- Things 3 (premium type-led)

Avoid:
- Religious symbols (cross, dove, prayer)
- Bright/saturated colors
- 3D effects or gradients
- Generic "photo app" camera icons

Deliverables:
- 1024x1024 PNG, no transparency, no rounded corners
- 1024x500 PNG feature graphic for Google Play (same warm palette,
  may include "haloFrame" wordmark)
- Source file (Figma or AI/PSD)

Turnaround: 3-5 days
```

**Where to order:**
- Fiverr (`fiverr.com/categories/graphics-design/app-icon-design`) —
  search "warm minimal app icon," ~$25-75 with revisions.
- Or Dribbble shortlist (`dribbble.com/search/app-icon-warm`) — DM
  designers with the brief above. ~$200-500 for higher tier.

**Save deliverables to:**
- `apps/web/resources/icon.png` (replace placeholder)
- `apps/web/resources/feature-graphic.png` (new file — Google Play
  feature graphic)

**Success:** the rendered icon at 60x60 (its smallest displayed size in
Play Store search) is still legible — you can read what app it is at
that scale.

---

### A4. RevenueCat dashboard skeleton (90 min)

Set up the project, apps, products, entitlement, offering. **Webhook
URL needs the domain so it's deferred to Phase B**, but everything
else is unblocked.

**Time:** 90 minutes. **Cost:** $0 (RC free tier).

**Pre-req:** RevenueCat account at `app.revenuecat.com`. You should
already have one (per Lumore reference in memory).

**Action:**

1. **Create project.** RevenueCat dashboard → Projects → New project.
   - Name: `haloFrame`
   - Click Create.

2. **Add iOS app.** Project → Apps → "+ New" → iOS.
   - App name: `haloFrame iOS`
   - Bundle ID: `com.haloframe.app`
   - Skip ASC API key for now (Phase D).
   - Click Save.

3. **Add Android app.** Apps → "+ New" → Android (Google Play).
   - App name: `haloFrame Android`
   - Package name: `com.haloframe.app`
   - Skip Google Service Account JSON for now (item #9 in this doc).
   - Click Save.

4. **Add public SDK keys to your local `.env`.** Each app has a
   "Public SDK key" — copy both:

   ```bash
   # apps/web/.env (or repo-root .env that Vite reads)
   VITE_RC_IOS_KEY=appl_xxxxxxxxxxxx     # iOS app's Public SDK key
   VITE_RC_ANDROID_KEY=goog_xxxxxxxxxxxx  # Android app's Public SDK key
   ```

   These get embedded in the bundle at build time. They're public —
   safe to commit but `.env` is gitignored anyway.

5. **Create 5 products.** Project → Products → "+ New product" → fill
   each:

   | Identifier | Type | Display name | Description |
   | --- | --- | --- | --- |
   | `haloframe_keepsake_monthly` | Subscription | Keepsake | 5 tributes per month |
   | `haloframe_heritage_monthly` | Subscription | Heritage | 20 tributes per month + rollover |
   | `haloframe_heritage_annual` | Subscription | Heritage Annual | 240 tributes per year |
   | `haloframe_topup_4pack` | Non-renewing purchase | 4-Tribute Pack | 4 portraits, 90-day window |
   | `haloframe_topup_single` | Non-renewing purchase | Single Tribute | 1 portrait, 90-day window |

   Attach each product to BOTH the iOS app and the Android app.

6. **Create entitlement.** Project → Entitlements → "+ New".
   - Identifier: `tributes`
   - Display name: `Tributes`
   - Attach all 3 subscription products. Top-ups stay un-attached
     (entitlements model active subscriptions, not consumables).

7. **Create offering.** Project → Offerings → Default offering.
   - Default offering identifier: `default`
   - Add 5 packages:

     | Identifier | Type | Product (iOS) | Product (Android) |
     | --- | --- | --- | --- |
     | `$rc_monthly` | Monthly | `haloframe_keepsake_monthly` | `haloframe_keepsake_monthly` |
     | `heritage_monthly` | Custom monthly | `haloframe_heritage_monthly` | `haloframe_heritage_monthly` |
     | `$rc_annual` | Annual | `haloframe_heritage_annual` | `haloframe_heritage_annual` |
     | `topup_4pack` | Custom | `haloframe_topup_4pack` | `haloframe_topup_4pack` |
     | `topup_single` | Custom | `haloframe_topup_single` | `haloframe_topup_single` |

   Mark this offering as the **Current** offering.

8. **Defer webhook.** Webhook tab — leave blank for now. Phase B will
   set it to `https://api.<domain>/api/subscription/webhook` once the
   domain is live.

**Success:** Project dashboard shows 5 products, 1 entitlement, 1
offering with 5 packages, 0 connected stores (App Store Connect +
Google Play come later).

---

## Phase B — After domain registered (~75 min)

Once you've picked a domain (`gethaloframe.com` or whatever) and
registered it on Cloudflare:

### B1. Tell me the domain → I run the codebase refactor

One message in chat: "domain is `<domain>`, refactor it." I run a
sed-replace pass across `apps/web`, `apps/api`, `docs/`, `scripts/`,
the rendered HTML, and the published markdown. Commit + push.

**Time:** 5 min (mine).

### B2. Give me a Cloudflare API token → I apply DNS + Email Routing

Generate a token at `https://dash.cloudflare.com/profile/api-tokens`
with these permissions:
- **Zone : DNS : Edit** for the new zone
- **Zone : Email Routing Rules : Edit** for the new zone
- **Zone Resources:** Include → Specific zone → `<your-domain>`

Paste the token in chat. I'll apply:
- A `<domain>` → Vercel (after step B3)
- CNAME `www` → Vercel
- CNAME `api` → Railway (after step B4)
- Email Routing: `support@<domain>` → your Gmail

**Time:** 5 min (yours: token), 10 min (mine: apply).

### B3. Vercel — deploy + custom domain (20 min)

Follow `docs/DEPLOY.md` §1. Add the domain in Vercel → Settings →
Domains. Vercel will tell you what DNS records it needs — those should
already be applied if you did B2 first.

Add env vars in Vercel → Settings → Environment Variables (Production
+ Preview):
- `VITE_SUPABASE_URL` (from your `.env`)
- `VITE_SUPABASE_ANON_KEY` (from your `.env`)
- `VITE_RC_IOS_KEY` (from RC dashboard, Phase A4)
- `VITE_RC_ANDROID_KEY` (from RC dashboard, Phase A4)
- `VITE_API_MODE` = `prod`

Deploy → trigger a redeploy after env vars are set.

**Success:** `https://<domain>` returns the app. `https://<domain>/privacy`,
`/terms`, `/support` return real HTML (mention fal.ai per Phase 11.4).

### B4. Railway — deploy + custom domain (20 min)

Follow `docs/DEPLOY.md` §2. Custom domain = `api.<domain>`. Env vars
include all `SUPABASE_*`, `FAL_KEY`, all `STRIPE_*`, `RESEND_API_KEY`,
`REVENUECAT_SECRET_KEY`, `REVENUECAT_WEBHOOK_AUTH_HEADER`.

After deploy, register the Stripe webhook URL:
- Stripe dashboard → Developers → Webhooks → Add endpoint:
  `https://api.<domain>/api/webhook/stripe`
- Copy signing secret → paste as `STRIPE_WEBHOOK_SECRET` in Railway →
  redeploy.

**Success:** `https://api.<domain>/healthz` returns `{"ok":true}`.

### B5. Update RC webhook URL (5 min)

Back to RevenueCat → Project → Integrations → Webhooks.
- URL: `https://api.<domain>/api/subscription/webhook`
- Authorization header: paste the value of `REVENUECAT_WEBHOOK_AUTH_HEADER`
  from your Railway env (`Bearer <shared-secret>` format).
- Save.

**Success:** RC's "Send test event" returns 200.

---

## Phase C — Google Play Console setup (~3 hours)

Single hardest dashboard. Plan a focused 3-hour block.

### C1. Create app record (15 min)

Play Console (`play.google.com/console`) → All apps → "+ Create app".

- App name: `haloFrame: Memorial Portraits`
- Default language: English (United States)
- App or game: App
- Free or paid: Free
- Declarations: confirm Developer Program Policies + US export laws.
- Click Create.

### C2. App access (5 min)

Play Console → Your app → Policy → App content → App access → "+ Manage".

- "Are all of your app's functionalities available without any access
  restrictions?" → **No** (sign-in is required).
- Add an instruction:
  ```
  Sign-in is required. The reviewer account is preloaded with 22
  credits and 4 sample portraits. Demo credentials below.
  ```
- Username: `reviewer@gethaloframe.com`
- Password: `<paste from 1Password>` (the `HaloReview-Stub-2026!` value
  in commit `abc461b`, or rotate via Supabase dashboard first)
- Save.

### C3. Ads declaration (1 min)

Policy → App content → Ads → No.

### C4. Content rating questionnaire (10 min)

Policy → App content → Content rating → Start questionnaire.

Email: your dev email.
Category: Photography.
Answer **No** to every question (no violence, no sexual content, no
profanity, no gambling, no UGC sharing public, no contact info,
collects personal info: Yes).

Calculate → Apply rating. Expected result: **Everyone (IARC)**.

### C5. Target audience (5 min)

Policy → App content → Target audience and content.

- Target age: 13+
- Appeals to children: No
- Designed for Families: skip (not a kids app).
- Save.

### C6. Privacy Policy URL (1 min)

Policy → App content → Privacy policy.
- URL: `https://<domain>/privacy`
- Save.

### C7. Data Safety form (45 min)

Policy → App content → Data safety. The most-scrutinized form on
Google Play — it must match your privacy policy verbatim.

Open `docs/STORE_LISTINGS.md` §2.7 in another tab. Paste each answer
from there into the corresponding form field. Critical answers:

- Encrypts data in transit: **Yes**
- Provides way to delete data: **Yes**
- Photos: collected, **shared** with fal.ai, encrypted, deletable
- Email: collected, not shared
- Purchase history: collected, shared with Google Play Billing
- Crash logs: collected (if you set `SENTRY_DSN`)
- No advertising IDs, no third-party analytics

Submit.

### C8. News, COVID, government questionnaires (3 min)

All three: No.

### C9. App listing copy (30 min)

Play Console → Grow → Store presence → Main store listing.

- App name: `haloFrame: Memorial Portraits`
- Short description: paste from `docs/STORE_LISTINGS.md` §2.2 (78 chars)
- Full description: paste from `docs/STORE_LISTINGS.md` §2.3 (~2300 chars)
- Icon: upload `apps/web/resources/icon.png` (after Phase A3 lands)
- Feature graphic: upload `apps/web/resources/feature-graphic.png`
- Phone screenshots: upload 4-8 captures (1080×1920 portrait)
- Promo video: skip
- Tags: select Photography, Personalized, Memories
- Save.

(If your icon isn't designed yet, leave the listing in draft and come
back when Phase A3 delivers.)

### C10. Categorization (2 min)

Grow → Store settings.
- Category: Photography
- Tags: Photography, Personalized, Memories.
- Contact details: support email (`support@<domain>`), website
  (`https://<domain>`), phone optional.
- External marketing: I do not direct external marketing → skip.

### C11. Subscriptions + IAP products (60 min)

Monetize → Products → Subscriptions → "+ Create subscription".

For each of 5 products, paste from `docs/STORE_LISTINGS.md` §2.11:

```
haloframe_keepsake_monthly  $9.99/mo  monthly
haloframe_heritage_monthly  $24.99/mo monthly  (with rollover)
haloframe_heritage_annual   $199/yr   yearly
```

Top-ups go under Monetize → Products → In-app products:

```
haloframe_topup_4pack    $7.99 consumable  no expiry
haloframe_topup_single   $2.49 consumable  no expiry
```

Each subscription needs a localized base plan + benefits list. Use the
"Heritage Annual — 240 tributes/year" / "Keepsake — 5 tributes/mo"
copy from §1.10.

**Activate each product.** Inactive products won't show up in your IAP
flow.

### C12. Pricing (10 min)

Each product → Pricing → set USD price → Apply to all available
countries. Google auto-converts.

---

## Phase D — Service account + RC integration (15 min)

Service account is what RevenueCat uses to query Google's billing API
on your behalf (so Apple/Google IAP events flow into RC → into the
`/api/subscription/webhook` you wrote).

### D1. Create the service account (10 min)

Play Console → Settings (gear icon top-right) → Developer account →
API access.

- "Create new service account" → opens Google Cloud Console.
- In Google Cloud:
  - Service account name: `revenuecat-haloframe`
  - Role: skip — granted in Play Console below.
  - Create.
  - Click the new SA → Keys → Add key → JSON → Download.
- Back in Play Console → API access → click "Refresh service accounts".
- The new SA appears → Grant Access → Permissions:
  - Visibility: All apps
  - Permissions: View financial data, Manage orders + subscriptions
  - (Account-level: leave blank.)
- Invite user.

### D2. Upload SA JSON to RevenueCat (5 min)

RevenueCat dashboard → Project → Apps → haloFrame Android → Service
Account Credentials JSON → Upload → pick the JSON from D1.

**Success:** RC dashboard shows "Connected" green dot for the Android
app.

---

## Phase E — First AAB build + upload (45 min)

Builds your first signed Android bundle and uploads it to Play Internal
Testing. Once this lands, the Closed Testing window can start.

### E1. Build (15 min)

```powershell
cd "$env:USERPROFILE\OneDrive\Desktop\haloFrame\.worktrees\prod-ready\apps\web"
npx cap sync android
cd android
.\gradlew.bat bundleRelease
```

If Gradle errors on first build:
- Ensure JAVA_HOME points at JDK 17 (Android Studio bundles one at
  `C:\Program Files\Android\Android Studio\jbr`).
- Ensure ANDROID_HOME points at the SDK
  (`%LOCALAPPDATA%\Android\Sdk`).

Output: `apps/web/android/app/build/outputs/bundle/release/app-release.aab`

### E2. Sign (configured in `apps/web/android/app/build.gradle`)

The first time, Gradle reads from `android/app/build.gradle`'s
`signingConfigs.release` block. You'll need to add your keystore path
+ password references via `android/local.properties` (gitignored):

```properties
HALOFRAME_UPLOAD_STORE_FILE=C:/Users/claws/Documents/haloframe-secrets/haloframe-upload.jks
HALOFRAME_UPLOAD_KEY_ALIAS=haloframe-upload
HALOFRAME_UPLOAD_STORE_PASSWORD=<your keystore password>
HALOFRAME_UPLOAD_KEY_PASSWORD=<same as keystore password>
```

If `build.gradle` doesn't reference these, ping me — I'll wire it.

### E3. Upload to Internal Testing (15 min)

Play Console → Testing → Internal testing → Create new release.

- Upload the `app-release.aab` produced in E1.
- Release notes (en-US): "First internal build. End-to-end smoke
  test for Reunite + Enhance flows + IAP wiring."
- Save → Review release → Roll out to internal testing.

### E4. Add yourself + 2 friends as internal testers (5 min)

Internal testing → Testers → Create email list.
- List name: `haloframe-internal`
- Emails: yourself, 1-2 close friends.
- Save → Activate.

Wait ~1 hour for Google to propagate. Then install on a real Android
device via the Play Store opt-in link.

**Success:** the app installs from Play Store, signs in, and you can
generate one tribute. AI badge visible on the result.

---

## Phase F — Closed Testing + 14-day clock (Day 0 of clock)

### F1. Create Google Group for testers (10 min)

`groups.google.com` → Create new group.
- Group name: `haloframe-beta`
- Group email: `haloframe-beta@googlegroups.com`
- Privacy: anyone on the web can ask to join → switch to "Only
  invited users."
- Add the 12-15 confirmed beta testers from Phase A1's tracker.

### F2. Promote AAB to Closed Testing (15 min)

Play Console → Testing → Closed testing → "+ Create track".
- Track name: `haloframe-closed-beta`
- Add testers → Email lists → use `haloframe-beta@googlegroups.com`.
- Country availability: US, CA, UK, AU, NZ.
- Save.

Promote your Internal Testing release to this track:
Internal testing → Releases → Promote → Closed testing → choose
`haloframe-closed-beta`.

### F3. Send tester invite DMs (15 min)

Use the Day-14 invite-day DM template from `docs/BETA_RECRUITMENT.md`
§5. Confirm each tester checks email + accepts the Play Store invite.

### F4. The 14-day window starts NOW

For the next 14 days, monitor:
- Play Console → Testing → Closed testing → Engagement reports →
  Active testers count must be 12+.
- Sentry for crashes (if `SENTRY_DSN` set).
- Email for `/api/report` flagged content.
- Day 5 + Day 10 reminder DMs from `docs/BETA_RECRUITMENT.md` §5.

If active count drops below 12 at Day 18, escalate per
`docs/BETA_RECRUITMENT.md` §6.

---

## Phase G — Production submit (Day 14, ~30 min)

### G1. Promote Closed → Production

Play Console → Production → Create release.
- Promote from Closed testing → choose your `haloframe-closed-beta` release.
- Release name: `1.0.0`
- Release notes: "First public release."
- Roll out: 100% (or staged 20% / 50% / 100% if you want gradual).
- Save → Review release → Submit for review.

### G2. Wait

Google production review: 3-7 days typical. Status updates land in
Play Console + email.

### G3. Live

Status → "Published." App is searchable in Play Store within 24-48h.

---

## Cheat sheet — paste-ready summary

| Step | Status | Time |
| --- | --- | --- |
| A1 send 18 DMs | overdue | 90 min |
| A2 keystore | unblocked | 15 min |
| A3 icon | unblocked | 30 min order, 3-5 day lead |
| A4 RC dashboard | unblocked (webhook deferred) | 90 min |
| B1 domain refactor | blocked on B0 | 5 min (me) |
| B2 Cloudflare DNS | blocked on B0 | 15 min |
| B3 Vercel deploy | blocked on B0 | 20 min |
| B4 Railway deploy | blocked on B0 | 20 min |
| B5 RC webhook | blocked on B4 | 5 min |
| C1-C12 Play Console | blocked on B0 (Privacy URL) + A3 (icon) | ~3 hours |
| D1-D2 Service account | blocked on C1 | 15 min |
| E1-E4 First AAB | blocked on D2 | 45 min |
| F1-F4 Closed Testing | blocked on E4 + A1 | day 0 of 14-day clock |
| G1-G3 Production submit | blocked on F4 + 14d wait | 30 min |

**Today's actionable batch:** A1, A2, A3, A4 — they all run in
parallel. Largest schedule lever: A1 (DMs).

When you've hit a step that needs me, drop "ready for B1" / "ready for
the refactor" / "Cloudflare token: ..." in chat.
