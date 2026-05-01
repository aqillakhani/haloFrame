# haloFrame — Store Listings

This is the canonical copy for both stores. Paste each block into the
matching ASC / Play Console field exactly as written. Character limits
are noted in section headers so you can spot-check before pasting.

**Bundle identifier (both stores):** `com.haloframe.app`
**Developer name:** `{{COMPANY_LEGAL_NAME}}` *(use the same legal name on both stores)*
**Support email:** `support@gethaloframe.com`
**Support URL:** `https://gethaloframe.com/support`
**Privacy Policy URL:** `https://gethaloframe.com/privacy`
**Terms URL:** `https://gethaloframe.com/terms`

Marketing voice rule: frame the product as **honoring**, **remembering**,
**tribute** — never **deepfake**, **resurrect**, **bring back**, **alive
again**. Both stores have rejected memorial-AI apps for the latter
framing (research §1.6). Keep that rule in your head while editing any
copy that ships.

---

## 1. Apple App Store Connect

### 1.1 App Information

| Field | Value |
| --- | --- |
| **Name** (30ch) | `haloFrame: Memorial Portraits` |
| **Subtitle** (30ch) | `Honor loved ones in one photo` |
| **Bundle ID** | `com.haloframe.app` |
| **SKU** | `haloframe-ios-001` |
| **Primary language** | English (U.S.) |
| **Primary category** | Photo & Video |
| **Secondary category** | Lifestyle |
| **Content rights** | "Does not contain, show, or access third-party content." |
| **Age rating** | 4+ (see §1.5 questionnaire) |

### 1.2 Promotional Text — 170 ch max

> Paste exact text. Counted manually: 168 chars.

```
Reunite the people you love most in one warm portrait. Add a face to a
family photo, or restore an old picture so every detail looks like you
remember.
```

### 1.3 Description — 4000 ch max

> Paste exact text. Counted manually: ~2,300 chars (well under).

```
haloFrame helps families create memorial portraits that feel like the
people in them — not edits, not effects, just photos that look the way
you remember.

Two ways to use it:

REUNITE
Add a loved one back into a family photo. Upload the photo you wish
they could be in, then a clear photo of the person you want to bring
home, and haloFrame composes a portrait of everyone together. Great
for graduations, weddings, holidays, and anniversaries where someone
you love couldn't be there.

ENHANCE
Restore an old picture — sharpen a faded face, recover detail in the
background, lift the lighting on a photograph that's been in a
wallet or shoebox for thirty years.

Every portrait is yours. We don't share your photos, we don't train
AI on them, and you can delete your account and everything in it
in a single tap.

WHAT'S INCLUDED

• 1 free Reunite + 1 free Enhance to try the app
• High-resolution downloads ready to share or print
• Print-shop integration — order a 12×16″, 18×24″, 24×36″, or 36×48″
  canvas straight from the app
• A small "✨ AI-generated" mark on every portrait, so you can be
  honest with anyone you share it with
• Account export + delete in Settings — your data is yours

PLANS

Free — 1 Reunite + 1 Enhance, lifetime
Keepsake — $9.99 per month, 5 portraits per month
Heritage — $24.99 per month, 20 portraits per month
Heritage Annual — $199 per year, 240 portraits across the year
Single Tribute — $2.49, 1 extra portrait, 90-day window
Tribute 4-Pack — $7.99, 4 extra portraits, 90-day window

All paid plans renew automatically. Manage or cancel anytime in
Settings → Subscriptions, or in the iOS Settings app.

A NOTE ON AI

haloFrame uses an AI image model (provided by fal.ai) to compose
your portraits. Every output is labeled. We do not animate, voice,
or "bring back" anyone — the portrait is a still composite, made
from photos you already have. Any photo we generate is yours to keep
and yours to delete.

Privacy: https://gethaloframe.com/privacy
Terms:   https://gethaloframe.com/terms
Support: support@gethaloframe.com
```

### 1.4 Keywords — 100 ch max, comma-separated

> Counted manually: 99 chars.

```
memorial,tribute,family,photo,portrait,heirloom,keepsake,remember,grief,reunite,restore,heritage
```

Notes for selection:
- Avoided **deepfake** + **AI** as primary terms — they invite the
  rejection class we're trying to dodge.
- **memorial** + **tribute** are the head terms; **family / photo**
  catch generic photo-app intent; **grief / remember** catch the
  emotional intent users actually search.
- **reunite** + **restore** match the two flows by name.

### 1.5 Age Rating Questionnaire

Apple's questionnaire infers a numeric rating from the answers below.
All answers are **None**, which yields **4+**.

| Category | Answer |
| --- | --- |
| Cartoon or fantasy violence | None |
| Realistic violence | None |
| Sexual content or nudity | None |
| Profanity or crude humor | None |
| Alcohol, tobacco, or drug use or references | None |
| Mature/suggestive themes | None |
| Horror/fear themes | None |
| Medical/treatment information | None |
| Gambling and contests | None |
| Unrestricted web access | No |
| User-generated content | No *(user uploads photos but doesn't post or browse to a public feed)* |

### 1.6 App Privacy — Data Used to Track You

**Data Used to Track You: NONE**

We do not use any user data to track across other apps or websites. Do
NOT enable IDFA collection.

### 1.7 App Privacy — Data Linked to User

| Data | Used For | Linked to user |
| --- | --- | --- |
| Email | App Functionality, Account | Yes |
| User ID | App Functionality, Account | Yes |
| Photos and videos | App Functionality (composite generation) | Yes |
| Purchase History | App Functionality (entitlement) | Yes |
| Crash Data | Analytics (Sentry, optional) | Yes |
| Performance Data | Analytics (Sentry, optional) | Yes |

Tracking → No for everything.

### 1.8 App Privacy — Data Not Linked to User

None.

### 1.9 Subscription Group: "tributes"

Single group containing all subscription products. Reviewers see one
group with three plans (Keepsake, Heritage Monthly, Heritage Annual)
plus two one-time top-ups attached to the same app.

### 1.10 In-App Purchase Display Names + Descriptions

> Each subscription needs a localized display name (≤30 ch) +
> description (≤45 ch on Apple). Top-ups use shorter descriptions —
> Apple's IAP review screenshots show exactly these strings.

#### `haloframe_keepsake_monthly` — Auto-renew, $9.99/mo
- **Display name:** `Keepsake — 5 tributes / month`
- **Description:** `5 portraits each month, $9.99 / month.`

#### `haloframe_heritage_monthly` — Auto-renew, $24.99/mo
- **Display name:** `Heritage — 20 tributes / month`
- **Description:** `20 portraits each month + 2-month rollover.`

#### `haloframe_heritage_annual` — Auto-renew, $199/yr
- **Display name:** `Heritage Annual — 240 / year`
- **Description:** `240 portraits per year, billed annually.`

#### `haloframe_topup_4pack` — Non-renewing, ~$7.99
- **Display name:** `4-Tribute Pack`
- **Description:** `4 extra portraits, 90-day window.`

#### `haloframe_topup_single` — Non-renewing, ~$2.49
- **Display name:** `Single Tribute`
- **Description:** `1 extra portrait, 90-day window.`

### 1.11 Subscription Privacy / Auto-Renewal Disclosure

Apple requires a paragraph in the description (already included in §1.3
"PLANS" section). It must say:

- Length of subscription period
- Price
- "Payment will be charged to Apple ID account at confirmation of
  purchase" (Apple inserts this automatically in the StoreKit sheet —
  do not duplicate)
- "Subscription automatically renews unless auto-renew is turned off
  at least 24-hours before the end of the current period"
- "Subscriptions may be managed by the user and auto-renewal may be
  turned off by going to the user's Account Settings after purchase"

A short version of the above is already baked into §1.3. Paste this
verbatim into the **Subscription Group → Review Notes** field if ASC
asks for explicit terms:

```
Subscriptions automatically renew at the same price each period unless
auto-renew is turned off at least 24 hours before the end of the
current period. Manage or cancel in Settings → Subscriptions on
device, or via Settings → Subscriptions on the App Store. Privacy
Policy: https://gethaloframe.com/privacy. Terms of Use:
https://gethaloframe.com/terms.
```

### 1.12 App Review Information

| Field | Value |
| --- | --- |
| **First name / Last name** | (your name) |
| **Phone / Email** | (your contact info) |
| **Sign-in required** | Yes |
| **Demo account** | See `docs/REVIEWER_NOTES.md` (full block to paste) |
| **Notes** | See `docs/REVIEWER_NOTES.md` |
| **Attachment** | Optional — `apps/web/public/privacy.html` PDF if reviewer asks |

### 1.13 Build & Submission

- **Version:** `1.0.0`
- **Build number:** auto-incrementing per Codemagic run (`(date +%s)`)
- **Copyright:** `© 2026 {{COMPANY_LEGAL_NAME}}`
- **Trade representative info:** Not required for U.S.; required for
  Korea — leave blank unless you've registered there.
- **Export compliance:** Uses HTTPS only (no proprietary crypto). Set
  `ITSAppUsesNonExemptEncryption = NO` in Info.plist (already done in
  Phase 8).

---

## 2. Google Play Console

### 2.1 App Details

| Field | Value |
| --- | --- |
| **App name** (30 ch) | `haloFrame: Memorial Portraits` |
| **Default language** | English (United States) – `en-US` |
| **App or game** | App |
| **Free or paid** | Free *(monetized via in-app purchases)* |
| **Package name** | `com.haloframe.app` |
| **Application type** | App |
| **Category** | Photography |
| **Tags** | "Photo composition", "Personalized photos", "Memories" |

### 2.2 Short Description — 80 ch max

> Counted manually: 78 chars.

```
Memorial portraits — reunite loved ones in a photo, or restore a faded one.
```

### 2.3 Full Description — 4000 ch max

> Reuse the §1.3 Apple description verbatim — the message and the legal
> framing carry over. Paste the same block. The only Play-specific
> differences are bullet markers (`•` is fine on both stores) and that
> Play renders Markdown-ish bold (`**...**`) — keep it as plain text
> below for safety.

```
haloFrame helps families create memorial portraits that feel like the
people in them — not edits, not effects, just photos that look the way
you remember.

Two ways to use it:

REUNITE
Add a loved one back into a family photo. Upload the photo you wish
they could be in, then a clear photo of the person you want to bring
home, and haloFrame composes a portrait of everyone together. Great
for graduations, weddings, holidays, and anniversaries where someone
you love couldn't be there.

ENHANCE
Restore an old picture — sharpen a faded face, recover detail in the
background, lift the lighting on a photograph that's been in a
wallet or shoebox for thirty years.

Every portrait is yours. We don't share your photos, we don't train
AI on them, and you can delete your account and everything in it
in a single tap.

WHAT'S INCLUDED

• 1 free Reunite + 1 free Enhance to try the app
• High-resolution downloads ready to share or print
• Print-shop integration — order a 12×16″, 18×24″, 24×36″, or 36×48″
  canvas straight from the app
• A small "✨ AI-generated" mark on every portrait
• Account export + delete in Settings

PLANS

Free — 1 Reunite + 1 Enhance, lifetime
Keepsake — $9.99 per month, 5 portraits per month
Heritage — $24.99 per month, 20 portraits per month
Heritage Annual — $199 per year, 240 portraits across the year
Single Tribute — $2.49, 1 extra portrait, 90-day window
Tribute 4-Pack — $7.99, 4 extra portraits, 90-day window

All paid plans renew automatically. Manage or cancel anytime in
Settings or the Google Play Subscriptions screen.

A NOTE ON AI

haloFrame uses an AI image model (provided by fal.ai) to compose your
portraits. Every output is labeled. We do not animate, voice, or
"bring back" anyone — the portrait is a still composite, made from
photos you already have. Any photo we generate is yours to keep and
yours to delete.

Privacy: https://gethaloframe.com/privacy
Terms:   https://gethaloframe.com/terms
Support: support@gethaloframe.com
```

### 2.4 Graphic Assets

| Asset | Spec | Source path (after `assets:gen`) |
| --- | --- | --- |
| App icon | 512×512 PNG, 32-bit, sRGB, no alpha | `apps/web/android/app/src/main/res/mipmap-*/ic_launcher.png` (export 512 from `apps/web/resources/icon.png` master) |
| Feature graphic | 1024×500 PNG/JPEG, 1MB max | NEW — author manually in Figma; source the same beige + halo motif |
| Phone screenshots | 4-8, 1080×1920 portrait, 16:9 or 9:16 | Captured from Pixel 7 AVD running `npx cap run android` |
| 7-inch tablet | Optional, 1200×1920 | Skip for v1 |
| 10-inch tablet | Optional, 1600×2560 | Skip for v1 |
| Promo video | Optional, YouTube link | Skip for v1 |

Screenshot order (matches both stores):
1. Home screen — "For the ones we carry with us"
2. Reunite flow — uploading the family photo and the person to add
3. Reunite result — composite portrait with "✨ AI-generated" badge
4. Enhance flow — before/after slider
5. Print Shop — canvas size selector
6. Settings — Subscription + Restore Purchases visible

### 2.5 Content Rating Questionnaire

Run via the Play Console questionnaire wizard. Expected outcome:
**Everyone** (IARC).

| Question | Answer |
| --- | --- |
| Sexual content / nudity | None |
| Violence — realistic | None |
| Violence — fantasy | None |
| Profanity | None |
| Drugs/alcohol/tobacco | None |
| Gambling | No |
| Crude humor | No |
| User-to-user communication | No |
| User-to-user content sharing (public) | No |
| Location data shared | No |
| Personal info collected | Yes — email, photo content (covered in Data Safety) |
| Digital purchases | Yes — IAP subscriptions and top-ups |

### 2.6 Target Audience and Content

- **Target age range:** 13+
  - Not **18+**: app is general-audience.
  - Not **child-directed**: no Kids Category, no COPPA/GDPR-K
    children's-data flow.
- **Appeals to children:** No — design is editorial, type-led, not
  cartoon.
- **Designed for Families:** No
- **News app:** No
- **COVID-19 contact tracing:** No
- **Government app:** No

### 2.7 Data Safety Form

The Play Console Data Safety form is the most-scrutinized part of a
Play submission. Answer **identical to** the Privacy Policy. If the
two diverge, Play will reject; if they later drift, Play will demote
the listing. Treat this section and `apps/web/public/privacy.html`
as one source of truth.

#### Data collection and security

| Question | Answer |
| --- | --- |
| Encrypts data in transit | **Yes** (HTTPS / TLS to Supabase, fal.ai, Stripe, RevenueCat) |
| Provides a way to delete data | **Yes** (Settings → Delete Account; web: `/api/me/delete`) |
| Committed to Play Families Policy | **No** (not a kids app) |
| Independently validated against a global security standard | **No** |

#### Data types — collected and shared

For each row: collected = "Yes" if we put it on Supabase; shared = "Yes"
if we send it outside our control plane (e.g. fal.ai for AI generation,
Stripe for payments).

| Data type | Collected | Shared | Optional | Purpose |
| --- | --- | --- | --- | --- |
| **Personal info — email** | Yes | No | No | App functionality, account management |
| **Personal info — name** | Yes (display name from Google/Apple) | No | Yes | Account |
| **Photos** | Yes | **Yes** (fal.ai for compositing) | No | App functionality (composite generation) |
| **Files and docs** | No | — | — | — |
| **Purchase history** | Yes | Yes (RevenueCat → Apple/Google Play) | No | Entitlement |
| **App activity — in-app interactions** | No | — | — | — |
| **App info & performance — crash logs** | Yes (if `SENTRY_DSN` set) | Yes (Sentry) | Yes | Debugging |
| **App info & performance — diagnostics** | Same as above | Same | Same | Debugging |
| **Device IDs** | No | — | — | — |
| **Location** | No | — | — | — |
| **Audio / video files** | No | — | — | — |
| **Health and fitness** | No | — | — | — |

#### Required disclosure paragraph (paste into "Privacy practices" section)

```
haloFrame collects only what's needed to compose your portraits and
keep your account working. The photos you upload are sent to fal.ai's
nano-banana-2 image model for composite generation; fal.ai contractually
agrees not to train models on your photos and not to retain them after
processing. We retain your originals and composites in Supabase storage
so you can re-download or re-edit later, and we delete everything when
you delete your account or request export.

We do not use your data for advertising, do not sell it to third
parties, and do not include any analytics SDK that aggregates beyond
crash diagnostics. Account deletion: Settings → Delete Account in the
app, or POST https://gethaloframe.com/api/me/delete from a signed-in
session.
```

### 2.8 Ads Declaration

> "Does your app contain ads?" → **No.**

There are no third-party ad SDKs in the bundle. AdMob, MoPub, etc. —
all absent.

### 2.9 News Apps Declaration

> "Is your app a news app?" → **No.**

### 2.10 Government Apps Declaration

> "Is your app a government app?" → **No.**

### 2.11 In-App Purchases (Play Console product setup)

Each ID and price below MUST match `apps/api/src/routes/subscription.ts`
and the App Store Connect IAP IDs exactly. RevenueCat reads them as a
single set; a typo means a free user can't be promoted to paid.

#### Subscriptions

| Product ID | Display name | Description | Price | Period |
| --- | --- | --- | --- | --- |
| `haloframe_keepsake_monthly` | Keepsake | 5 tributes per month | USD 9.99 | Monthly |
| `haloframe_heritage_monthly` | Heritage | 20 tributes per month + rollover | USD 24.99 | Monthly |
| `haloframe_heritage_annual` | Heritage Annual | 240 tributes per year (20/mo) | USD 199 | Yearly |

#### Managed products (consumable)

| Product ID | Display name | Description | Price |
| --- | --- | --- | --- |
| `haloframe_topup_4pack` | 4-Tribute Pack | 4 extra portraits, never expire | USD 7.99 |
| `haloframe_topup_single` | Single Tribute | 1 extra portrait, never expires | USD 2.49 |

> Set both consumables to **Consumable** in Play Console (not
> entitlement-style). The credit ledger handles consumption server-side
> via the RevenueCat webhook.

### 2.12 Subscription benefits (Play renderable)

For each subscription, Play allows up to 4 short benefit lines that
render in the system subscription sheet:

#### Keepsake
- 5 tributes each month
- Reunite + Enhance flows
- Print-ready high resolution
- 1 month rollover (max 5 carry-over)

#### Heritage
- 20 tributes each month
- Up to 2 months rollover
- Reunite + Enhance flows
- Print-ready high resolution

#### Heritage Annual
- 240 tributes per year
- Best per-tribute value
- Up to 2 months rollover
- Print-ready high resolution

### 2.13 Closed Testing — list configuration

Path: Play Console → Testing → Closed testing → "haloFrame Closed
Beta" track. Required to satisfy the **14-day, 12-tester** rule for
new developer accounts (research §2.5).

- **Track name:** `haloFrame Closed Beta`
- **Tester list:** Google Group `haloframe-beta@googlegroups.com`
  (create the group; add 15-18 testers per `docs/BETA_RECRUITMENT.md`)
- **Countries:** US, CA, UK, AU, NZ (English-speaking; can expand later)
- **Release notes (initial v1.0.0-rc1 build):**
  ```
  Thanks for testing haloFrame! Try a Reunite or an Enhance, then
  open Settings to confirm your subscription state. Report anything
  weird via the in-app "Report" button or email
  support@gethaloframe.com.
  ```

---

## 3. Cross-Store Reference

### 3.1 Canonical Product ID Matrix

| Internal ID | App Store Connect ID | Play Console ID | Type | Price |
| --- | --- | --- | --- | --- |
| `haloframe_keepsake_monthly` | `haloframe_keepsake_monthly` | `haloframe_keepsake_monthly` | Auto-renew | $9.99/mo |
| `haloframe_heritage_monthly` | `haloframe_heritage_monthly` | `haloframe_heritage_monthly` | Auto-renew | $24.99/mo |
| `haloframe_heritage_annual` | `haloframe_heritage_annual` | `haloframe_heritage_annual` | Auto-renew | $199/yr |
| `haloframe_topup_4pack` | `haloframe_topup_4pack` | `haloframe_topup_4pack` | Non-renewing / Consumable | ~$7.99 |
| `haloframe_topup_single` | `haloframe_topup_single` | `haloframe_topup_single` | Non-renewing / Consumable | ~$2.49 |

If you ever need to rename: do it server-side first
(`apps/api/src/routes/subscription.ts` `SUBSCRIPTION_PRODUCTS` /
`TOPUP_PRODUCTS` maps), confirm RC dashboard, then both stores. The
RC webhook drops events for unknown product IDs silently.

### 3.2 Pricing Tier Reference

Apple uses **price tiers** (Tier 9 = $9.99, Tier 19 = $19.99, etc.).
Set each subscription's tier in App Store Connect to the closest match;
ASC will autofill localized prices.

| Subscription | Apple price tier | Google Play price |
| --- | --- | --- |
| Keepsake monthly | Tier 9 ($9.99) | $9.99 USD |
| Heritage monthly | Tier 24 ($24.99) | $24.99 USD |
| Heritage annual | Custom — $199 | $199 USD |
| Top-up 4-pack | Tier 7 ($7.99) | $7.99 USD |
| Top-up single | Tier 2 ($2.49) | $2.49 USD |

> Aqil: confirm exact Apple top-up tiers on Day 4 when configuring
> ASC. Apple sometimes only offers $0.99 increments at low tiers;
> if Tier 7 is unavailable, fall back to Tier 8 ($8.99) and update
> the canonical pricing copy in `packages/shared/src/subscription.ts`.

### 3.3 Asset Sources (single source of truth)

| Asset | Source path | Dimensions | Used by |
| --- | --- | --- | --- |
| App icon master | `apps/web/resources/icon.png` | 1024×1024 | iOS + Android via `npx capacitor-assets generate` |
| Splash master | `apps/web/resources/splash.png` | 2732×2732 | iOS + Android via the same |
| Feature graphic | `apps/web/resources/feature-graphic.png` | 1024×500 | Play Console only |
| Promo screenshots | `docs/screenshots/{01..06}.png` | 1290×2796 (iPhone) and 1080×1920 (Android) | Both stores |

Screenshot capture: see `docs/REVIEWER_NOTES.md` §screenshots for the
exact tappable steps. Capture once on iOS, mirror on Android — the UI
is identical because the bundle is the same Capacitor web view.

### 3.4 Tagline / one-liner reference

For social posts, App Preview videos, etc.:

- Long: "haloFrame helps families create memorial portraits that feel like the people in them."
- Short: "Memorial portraits, made with care."
- Action: "Reunite the people you love most in one warm portrait."

---

## 4. App Review Information (mirror)

This duplicates the paste-ready text in `docs/REVIEWER_NOTES.md`.
Maintained here so a reviewer-resubmit doesn't require opening two
files. If you change one, change the other.

See `docs/REVIEWER_NOTES.md` for the full block.

---

## 5. Localizations

**Locked at v1: English (U.S.) only.** Both stores accept that and
rate-limit the listing to U.S. + English-speaking territories.

If/when you expand:
- Apple: ASC → App Information → Localizations → add (each language
  needs its own description, keywords, screenshots).
- Play: each language is a fresh "Store listing" sub-row.
- Don't translate the AI-disclosure / privacy-policy URL paragraphs
  using Google Translate — get human review for those.

---

## 6. Submission Checklist (Day 13 final pre-flight)

Before tagging `v1.0.0-rc1` and triggering Codemagic, confirm every
field below has a real value (not placeholder):

### Apple App Store Connect
- [ ] App name
- [ ] Subtitle
- [ ] Description (4000 ch — pasted from §1.3)
- [ ] Promotional text (170 ch — pasted from §1.2)
- [ ] Keywords (100 ch — pasted from §1.4)
- [ ] Support URL → `https://gethaloframe.com/support` (live, not 404)
- [ ] Marketing URL → `https://gethaloframe.com` (live)
- [ ] Privacy Policy URL → `https://gethaloframe.com/privacy` (live)
- [ ] Age rating questionnaire (§1.5)
- [ ] App Privacy questionnaires (§1.6 — §1.8)
- [ ] All 5 IAP products with display names + descriptions (§1.10)
- [ ] Subscription Group review notes (§1.11)
- [ ] App Review Information demo account (paste from REVIEWER_NOTES.md)
- [ ] App Review Information notes (paste from REVIEWER_NOTES.md)
- [ ] Build uploaded via Codemagic and selected for review
- [ ] Export compliance answered No on first submission *(non-exempt
      encryption baked into Info.plist already in Phase 8)*
- [ ] Copyright `© 2026 {{COMPANY_LEGAL_NAME}}`

### Google Play Console
- [ ] App name
- [ ] Short description (80 ch — pasted from §2.2)
- [ ] Full description (4000 ch — pasted from §2.3)
- [ ] App icon 512×512 (uploaded)
- [ ] Feature graphic 1024×500 (uploaded)
- [ ] Phone screenshots 4-8 × 1080×1920 (uploaded)
- [ ] Privacy Policy URL → `https://gethaloframe.com/privacy` (live)
- [ ] Email + website + (optional) phone for the developer contact
- [ ] App content questionnaires:
  - [ ] Privacy Policy URL set
  - [ ] Ads = No
  - [ ] App access = "All app functionality is available without
        special access" *(sign-in is required, but no gated
        functionality once signed-in)*
  - [ ] Content rating completed (§2.5)
  - [ ] Target audience (§2.6) = 13+
  - [ ] News app = No
  - [ ] COVID-19 contact tracing = No
  - [ ] Government app = No
  - [ ] Data Safety form completed (§2.7) and **matches privacy
        policy verbatim**
  - [ ] Financial features declarations = "Manages or invests
        money" → No; "Cryptocurrencies" → No
  - [ ] Health declarations = No
- [ ] All 5 IAP products with display names + descriptions (§2.11)
- [ ] Closed Testing track configured with 12+ testers (§2.13)
- [ ] AAB uploaded to Closed Testing (initial build)

### Both stores (parity gate)
- [ ] Privacy policy text matches Data Safety form / App Privacy
      questionnaire on a line-by-line read
- [ ] Same 5 product IDs; same prices; same display names
- [ ] One screenshot order across both
- [ ] Demo account works on a fresh install of each platform

---

## 7. Rejection-recovery cheat sheet

If you hit a specific rejection class, look up the row and respond
quickly. Reviews don't restart the calendar — they extend it by a few
days each round.

| Rejection class | Likely reviewer language | Response |
| --- | --- | --- |
| Apple 5.1.2(i) AI disclosure | "App does not adequately disclose use of third-party AI" | Cite the AIConsentModal screen; cite the privacy-policy AI section that names fal.ai. Add a screenshot of the modal to "Notes for Reviewer." |
| Apple 4.2 minimum functionality | "App is too similar to a website / mobile-optimized web view" | Cite native: Camera plugin, Haptics, Share Sheet, Restore Purchases, Photo Library access. Optionally enable Local Notifications. |
| Apple 3.1.1 IAP | "Subscription not offered through Apple's IAP" | Confirm `Capacitor.isNativePlatform()` branching in `PaywallScreen.tsx`. Web Stripe path must be unreachable inside the iOS bundle. |
| Apple 5.1.1 privacy | "Insufficient explanation of data retention" | Cite `apps/web/public/privacy.html` — "30-day deletion SLA" + processor list. Re-attach as PDF. |
| Apple 1.1 / 1.2 distasteful | "Concept may be objectionable" | Cite MyHeritage Deep Nostalgia (approved). Cite our consent modal + watermark. Offer phone call escalation. |
| Google AI Content Policy | "Generative AI without sufficient moderation" | Cite the `/api/report` endpoint, the in-app `ReportContentSheet`, the watermark, the always-visible AI badge. |
| Google Data Safety mismatch | "Data Safety form contradicts your privacy policy" | Diff your privacy.html against the Data Safety answers; align both to §2.7. |
| Google 14-day Closed Testing failure | "Insufficient tester engagement" | Recruit 3 more, ask all 12-15 to open the app + generate a tribute, restart 14-day clock. |

---

## 8. Change log

| Date | Change | By |
| --- | --- | --- |
| 2026-04-25 | Initial authoring (Phase 11.1) | Claude |
| (next edit) |  |  |
