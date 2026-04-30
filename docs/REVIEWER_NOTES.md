# haloFrame — App Review Information

**This is the exact copy to paste into:**
- App Store Connect → App Information → App Review Information → Notes
- Play Console → App content → App access → Instructions for testing

Two paste-ready blocks below. Don't edit the text inside the fenced
blocks — those are the exact strings reviewers see. Edit only the
metadata around them (e.g. password retrieval path) before pasting.

> **Reviewer credential note.** The literal password is **not committed
> to git**. Retrieve it from `1Password → haloFrame → reviewer@gethaloframe.com`
> (or from the value of `REVIEWER_PASSWORD` you used when you ran
> `node scripts/seed-reviewer-account.mjs` — the seeder run already
> created the account and uploaded 4 sample portraits). Paste the
> literal password into the **password field**, not into the notes.

---

## 1. App Store Connect — paste this verbatim

### Demo account (App Access section)

```
Username: reviewer@gethaloframe.com
Password: <paste from 1Password — do not commit literal>
```

### App Review Information → Notes (4000 ch max)

```
Thank you for reviewing haloFrame.

WHAT THE APP DOES
haloFrame is a memorial photo app. It does two things:

1. REUNITE — adds a deceased or absent loved one back into a family
   photo. Two photos in (a group photo + a portrait of the missing
   person), one composite portrait out.
2. ENHANCE — restores a single old or faded photograph. One photo in,
   one cleaner version out.

It does NOT animate, voice, or "bring back" anyone — every output is a
still composite labeled "✨ AI-generated". The app is not a face-swap
toy and not a deepfake generator.

PRECEDENT
Two memorial-AI apps already approved on the App Store:
- MyHeritage "Deep Nostalgia" (animates archival photos of deceased
  relatives). Approved 2021, still live.
- Reface (AI face-swap including memorial use cases). Approved 2018,
  still live.

haloFrame is conceptually one notch more conservative — we do not
animate or speak as the deceased; we compose still portraits.

NATIVE INTEGRATION (Capacitor)
- Camera + Photo Library via @capacitor/camera (Apple 5.1.1(iii) —
  out-of-process picker required; we use it)
- Haptic feedback on key tribute moments (@capacitor/haptics)
- Native iOS Share Sheet for finished portraits (@capacitor/share)
- Restore Purchases button in Settings (@revenuecat/purchases-capacitor)
- Subscription Management deep link to iOS Settings → Subscriptions

AI PROCESSING — DATA HANDLING
- Photos are uploaded over TLS to our Express API (Railway).
- The API forwards them to fal.ai's nano-banana-2 model for
  composite generation. fal.ai is contractually bound not to train
  models on user photos and not to retain them after processing
  (see: https://fal.ai/terms-of-service §3.4).
- Originals + composites are stored encrypted in Supabase Postgres
  storage.
- Users can export everything (Settings → Export Data) or delete
  their account + all stored data (Settings → Delete Account). Both
  flows complete server-side within 30 days; UI confirmation is
  immediate.

CONSENT (Apple 5.1.2(i) — third-party AI disclosure)
- First-time photo upload triggers an in-app consent modal that
  explicitly names fal.ai, explains what's sent and what's not, and
  requires an "I understand" tap before the upload proceeds.
- The user's consent timestamp is stored on `profiles.ai_consent_at`
  and confirmed on every first-of-flow upload.
- The full data flow is in our Privacy Policy at
  https://gethaloframe.com/privacy (section "Third-party AI").

CONTENT MODERATION (Google AI Content Policy)
- Every composite is rendered with a small "✨ AI-generated" mark
  in the bottom-right corner (rendered server-side via sharp.composite,
  not client-side and not removable from a downloaded export).
- Every composite shows an in-app "AI-generated" badge in the
  Editor and in the My Tributes lightbox.
- Every composite has a "Report content" affordance. The report
  flow opens a sheet with reason picker (deepfake/explicit/hateful/
  defamatory/other) → POST /api/report → flag the tribute server-side
  → email the developer.
- Server-side review: flagged tributes show in our admin queue and
  are removed within 24h if confirmed harmful.

SUBSCRIPTIONS
All in-app purchases route through Apple In-App Purchase via
RevenueCat. Web canvas-print orders use Stripe (physical-goods
exception under Apple 3.1.1).

In-App Purchases:
  haloframe_keepsake_monthly  $9.99/mo  — 5 portraits/month
  haloframe_heritage_monthly  $24.99/mo — 20 portraits/month
  haloframe_heritage_annual   $199/yr   — 240 portraits/year
  haloframe_topup_4pack       $7.99     — 4 portraits, 90-day window
  haloframe_topup_single      $2.49     — 1 portrait, 90-day window

Free tier: 1 free Reunite + 1 free Enhance per account, lifetime.

Restore Purchases: Settings → Restore Purchases (always visible on
native).

Manage / Cancel: Settings → Manage Subscription opens iOS Settings →
Subscriptions; standard Apple-managed flow.

ACCOUNT DELETION (Apple 5.1.1 + Google equivalent)
- In-app: Settings → Delete Account → confirm → API call deletes
  auth.users row, cascades to profiles, tributes, credit_ledger,
  reports, and all storage objects under the user's prefix.
- Web (separate from this app, mandatory): the app's web build at
  https://gethaloframe.com exposes the same Settings → Delete Account
  flow, accessible without the iOS app.

OTA UPDATES
This app does NOT update native code over the air. Capgo is configured
for asset/JS updates only — no native module additions, no permission
changes, no new third-party SDKs without going through App Store
review. Bundle hash is logged on every cold launch for audit.

HOW TO TEST IN 5 MINUTES

1. Sign in with the demo account above.
2. Tap "Reunite" on the home screen. The consent modal will appear —
   tap "I understand."
3. Choose any photo from the seeded library (4 sample portraits
   already uploaded to this account). Choose another sample as the
   loved-one photo.
4. Wait ~60 seconds for the composite. The result will show a small
   "✨ AI-generated" badge.
5. Tap "Report" in the lightbox menu to confirm the moderation flow.
6. Open Settings → Restore Purchases to confirm the IAP UI surface.
7. Open Settings → Manage Subscription to confirm the deep-link out
   to iOS Settings.

Reviewer account credits: 22 (2 lifetime free + 20 top-up). Plenty for
the test path above.

CONTACT
Email: support@gethaloframe.com
Phone (escalation only): provided on the App Review Information form

Privacy Policy: https://gethaloframe.com/privacy
Terms of Use:   https://gethaloframe.com/terms
Support:        https://gethaloframe.com/support
```

---

## 2. Google Play Console — paste this verbatim

### App content → App access → Instructions for testing

```
Username: reviewer@gethaloframe.com
Password: <paste from 1Password — do not commit literal>

Sign-in is required. The account above is pre-loaded with 22
tribute credits and 4 sample portraits in the user's storage.

WHAT THE APP DOES
haloFrame is a memorial photo app. Two flows:
1. Reunite — add an absent loved one back into a family photo
   (group photo + portrait → composite).
2. Enhance — restore a single old or faded photograph.

Every output is a still AI-generated composite, labeled "✨ AI-generated"
both in the app UI and embedded in the exported file (server-side
watermark).

5-MINUTE TEST PATH
1. Open the app, sign in with the credentials above.
2. Tap "Reunite" → consent modal appears → tap "I understand."
3. Pick any two of the 4 seeded sample photos.
4. Wait ~60s for the composite. Verify the "✨ AI-generated" badge
   in the result lightbox.
5. Tap the "..." menu → "Report content" → confirm the report flow.
6. Open Settings → Restore Purchases (no-op for the demo account
   but the UI surface is required by Play).
7. Open Settings → Manage Subscription to confirm the deep-link to
   the Google Play subscription manager.

AI CONTENT MODERATION (Google AI Content Policy compliance)
- Every composite carries a server-side watermark + always-visible
  in-app badge.
- Every composite has a Report Content button that opens a reason
  picker (deepfake / explicit / hateful / defamatory / other) and
  posts to /api/report. The report fires a Sentry tag and emails
  the developer; flagged tributes are reviewed and removed within
  24h if confirmed harmful.
- The first photo upload in any flow triggers an in-app consent
  modal that names fal.ai (our AI provider) and requires explicit
  "I understand."

DATA SAFETY (matches Privacy Policy verbatim — see
https://gethaloframe.com/privacy)
- Photos: collected, encrypted in transit, shared with fal.ai for
  composite generation, deletable on account deletion.
- Email: collected for account; not shared.
- Purchase history: collected via Google Play Billing.
- Crash logs: optional, via Sentry if enabled.
- No advertising IDs collected. No third-party analytics.

ACCOUNT DELETION (mandatory both stores)
In-app: Settings → Delete Account → confirm. Cascades through:
- auth.users row
- profiles row
- all tributes + credit_ledger rows
- all Supabase storage objects under the user's UID prefix
- all reports rows authored by the user

Web flow (mandatory by Play policy): https://gethaloframe.com/account/delete
exposes the same flow without requiring the Android app.

NATIVE INTEGRATION
- Camera + Photo Library via @capacitor/camera (READ_MEDIA_IMAGES
  on Android 13+; READ_EXTERNAL_STORAGE on <13)
- Haptic feedback (@capacitor/haptics)
- Native Share via Android's intent system (@capacitor/share)
- Restore Purchases via @revenuecat/purchases-capacitor

OTA UPDATES
Asset/JS updates only via Capgo. No native code, no new permissions,
no new SDKs without going through Play review.

CONTACT
Email: support@gethaloframe.com
Privacy: https://gethaloframe.com/privacy
Terms:   https://gethaloframe.com/terms
Support: https://gethaloframe.com/support
```

---

## 3. App Review attachments (optional)

If a reviewer asks for additional context, you can attach:

| File | Purpose | How to generate |
| --- | --- | --- |
| `apps/web/public/privacy.html` as PDF | Full privacy policy text | Print the page from a browser → "Save as PDF" |
| `apps/web/public/terms.html` as PDF | Full terms of use | Same |
| Consent modal screenshot | Proves Apple 5.1.2(i) compliance | Take from TestFlight build, capture iPhone 14 Pro 6.7″ frame |
| Watermark example | Proves Google AI Content Policy compliance | Generate one tribute on the reviewer account, download the .jpg, the watermark is bottom-right |
| Data flow diagram | Optional supplement to privacy disclosure | `docs/data-flow.png` — generate from `docs/data-flow.excalidraw` if it exists, or skip on first submission |

Don't preemptively attach anything. Wait until a reviewer asks — extra
attachments slow down review and look like over-explaining.

---

## 4. Resubmit-after-rejection playbook

If either store rejects, revise the relevant **Notes** field above to
address the cited rule, then resubmit. Common edits:

### "Doesn't disclose third-party AI" (Apple 5.1.2(i))
Add to Notes:
> "fal.ai (https://fal.ai) is the only third-party processor that
> sees user photos. Their terms forbid model training on user data.
> Our AIConsentModal explicitly names fal.ai and requires explicit
> opt-in before first upload — see screenshot attached."

### "Insufficient native functionality" (Apple 4.2)
Add to Notes:
> "Native APIs in use: Camera (PhotoKit), Haptics (UIImpactFeedbackGenerator),
> Share (UIActivityViewController), StoreKit (RevenueCat → IAP),
> Photo Library (PHPickerViewController per 5.1.1(iii)). The web bundle
> is wrapped in a Capacitor WebView but every native surface listed
> above is genuinely native."

### "Generative AI without enough moderation" (Google)
Add to Notes:
> "We have three layers: (1) every output carries a server-side
> watermark that cannot be stripped from a downloaded file; (2) every
> output has an in-app Report button that emails the developer and
> flags the tribute for review within 24h; (3) the consent modal
> establishes user accountability for uploaded source photos. We do
> not pre-screen with a separate moderation provider — fal.ai's
> built-in safety filter handles known-prohibited categories.
> Happy to add Sightengine pre-call screening if requested."

### "Data Safety doesn't match privacy policy" (Google)
Add to Notes (and edit the Data Safety form):
> "Data Safety form has been updated to match privacy.html line-by-line.
> Specific change: <name the field that drifted>."

---

## 5. Update log

| Date | Change | By |
| --- | --- | --- |
| 2026-04-25 | Initial authoring (Phase 11.2). Reviewer account already created via `scripts/seed-reviewer-account.mjs`; 22 credits + 4 sample portraits seeded. | Claude |
