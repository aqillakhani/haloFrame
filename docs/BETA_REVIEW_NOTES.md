# haloFrame — Beta App Review Notes

This is the App Store Connect → TestFlight → **Beta App Review** notes
field, shown to Apple's beta-review team on every external-build
submission (4000 char max). It's distinct from
[REVIEWER_NOTES.md](./REVIEWER_NOTES.md), which targets the bigger App
Store review when v1.0.0 ships GA — that file has full detail Apple
needs for the production submission and is longer than the 4000-char
beta limit.

The beta-review fields are concentrated on: what the app does, how a
reviewer can exercise it in five minutes, and the AI-consent/moderation
story Apple cares about for memorial-AI apps. Anything Apple would only
need at full App Store review (pricing table, OTA story, precedent
citations) is pushed to REVIEWER_NOTES.md.

To push this to ASC for the app's BetaAppReviewDetail:

```
node scripts/asc-build-status.mjs set-app-beta-info
```

The script reads this fenced block at runtime.

---

## en-US notes (4000 char max)

```notes
Thanks for reviewing haloFrame.

WHAT THE APP DOES
haloFrame is a memorial photo app. It does two things:

1. REUNITE — adds a deceased or absent loved one back into a family
   photo. Inputs: a group photo + a clear portrait of the missing
   person. Output: one composite portrait.
2. ENHANCE — restores a single old or faded photograph.

Every output is a still composite labeled "AI-generated" in the UI
and watermarked server-side in the exported file. The app does NOT
animate, voice, or "bring back" anyone.

5-MINUTE TEST PATH
1. Sign in with the demo account.
2. Tap Reunite on the home screen. A consent modal appears that names
   our AI provider (fal.ai) — tap "I understand."
3. Pick any two of the 4 seeded sample photos. Wait ~60 seconds for
   the composite. The result lightbox shows an "AI-generated" badge.
4. Tap the lightbox menu → "Report content" to confirm the moderation
   flow (reason picker → POST /api/report → developer notified).
5. Open Settings → Restore Purchases (UI surface; no IAP transaction
   required for the test).
6. Open Settings → Manage Subscription to confirm the deep-link to
   iOS Settings → Subscriptions.

Reviewer account has 22 tribute credits and 4 sample portraits already
in the library. Plenty for the test path above.

AI CONSENT (Apple 5.1.2(i))
First photo upload triggers a consent modal that explicitly names
fal.ai, explains what's sent and what's retained, and requires an
"I understand" tap before uploading. Consent timestamp stored on
profiles.ai_consent_at. Full data flow at
https://gethaloframe.com/privacy.

CONTENT MODERATION
Three layers: (1) server-side watermark embedded in every exported
image (sharp.composite, not removable client-side); (2) always-visible
in-app "AI-generated" badge on every composite; (3) Report Content
button on every output (reason picker → email + flag for 24h review).
fal.ai's built-in safety filter handles known-prohibited categories.

NATIVE INTEGRATION
Camera + Photo Library (PHPickerViewController, Apple 5.1.1(iii)),
Haptics, Native Share Sheet, RevenueCat IAP, Subscription Management
deep-link to iOS Settings. The web bundle ships in a Capacitor WebView
but every native surface above is genuinely native.

DATA HANDLING
Photos upload over TLS to our Express API (Railway), then to fal.ai's
nano-banana-2 model. fal.ai is contractually bound not to train on or
retain user photos (https://fal.ai/terms-of-service §3.4). Originals
+ composites stored encrypted in Supabase Postgres storage. Users can
export everything or delete their account + all data in Settings;
both flows complete server-side within 30 days.

CONTACT
Email: support@gethaloframe.com
Privacy: https://gethaloframe.com/privacy
Terms: https://gethaloframe.com/terms
```
