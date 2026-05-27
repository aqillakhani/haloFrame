# Apple App Store — production-submit prep state

**Last updated:** 2026-05-26
**App:** `6768356716` · bundle `com.haloframe.app` · version 1.0 (`2b7114b1…`)
**Branch/worktree:** `appstore-launch` @ `.worktrees/prod-ready`

The 1.0 production version was driven from empty to near-submittable via the
ASC API this session. Re-check anytime:

```
node scripts/asc-verify-production.mjs
```

---

## ✅ Done via API (verified green)

| Item | State |
| --- | --- |
| Build attached | build #8 (`v1.0.0-rc5`, the approved TestFlight build) |
| Description / Keywords / Promo / Support+Marketing URL | set from `STORE_LISTINGS.md` §1.2–1.4 |
| Subtitle + Privacy Policy URL | `Honor loved ones in one photo` · `/privacy` |
| Age rating | questionnaire all-NONE → **4+** |
| App Review Information | contact + demo `reviewer@gethaloframe.com` + 2,736ch notes |
| App price | **Free** schedule set |
| Listing screenshots | 6 × 6.7″ (1290×2796) uploaded |
| IAP products (all 5) | created — productIds + types match RevenueCat + matrix |
| IAP localizations (all 5) | en-US name + description set |
| IAP review screenshots (all 5) | uploaded |
| One-time top-up prices | `topup_4pack` $7.99 · `topup_single` $2.49 |

TestFlight external beta review for build #8 was already **APPROVED** before this
session (live to external testers).

### Stale copy fixed (commit `0b9f5af`)
The 2026-05-01 Apple-3.1.1 fix missed the listing copy that actually ships.
`STORE_LISTINGS.md` §1.3/§1.10/§2.3 + `PLAYSTORE_WALKTHROUGH.md` advertised a
"90-day window" on top-up credits (which Apple forbids and which contradicts the
app's own "Credits never expire"). Corrected before the API push.

---

## ⚠️ Remaining — dashboard only (cannot be done via public ASC API)

These are the last items before "Submit for Review." All are standard ASC
dashboard tasks; the API either can't do them or the dashboard does them far
better (auto price-equalization across 175 territories).

1. **Subscription prices** — Monetization → Subscriptions → each product →
   set price, Apple auto-equalizes all territories:
   - `haloframe_keepsake_monthly` → **$9.99**
   - `haloframe_heritage_monthly` → **$24.99**
   - `haloframe_heritage_annual` → **$199.00**

   *(Why not API: `subscriptionPrices` POST needs `subscriptionAvailability`
   territories configured first + a per-territory price for each of 175
   territories. The dashboard does global equalization from one price entry.
   Products, localizations, and review screenshots are already created via API —
   only the price dropdown remains.)*

2. **App Privacy "nutrition label"** — App Privacy → data types (from
   `STORE_LISTINGS.md` §1.6–1.8): Email, User ID, Photos, Purchase History,
   Crash + Performance Data → all "linked to user, not used for tracking";
   Photos "shared with fal.ai"; **Tracking = None**. Not exposed by the public API.

3. **Confirm IAP "Missing Metadata" clears** — once subscription prices are set
   (#1), the 3 subs leave `MISSING_METADATA`. The 2 top-ups already have
   loc+price+screenshot; if either still shows Missing Metadata, the dashboard
   names the exact field (usually territory availability — set "Available in all
   territories").

4. **Submit for Review** — version 1.0 → Submit. Export Compliance prompt → No
   / exempt (`ITSAppUsesNonExemptEncryption=NO` is already in Info.plist). Do
   this only after #1–#3.

---

## Scripts added this session (`scripts/asc-*.mjs`)

All reuse the ES256-JWT auth + `.env.codemagic.local` creds shared with
`asc-build-status.mjs`. App ID + IDs resolved at runtime; all idempotent.

| Script | Does |
| --- | --- |
| `asc-prepare-production.mjs` | listing copy, age rating (self-correcting), App Review Info, build attach, app Free price |
| `asc-create-iap.mjs` | creates the 5 IAP products + localizations + review screenshots (skips existing) |
| `asc-fix-iap-prices.mjs` | sets one-time IAP prices (works); subscription prices need the dashboard — see above |
| `asc-upload-screenshots.mjs` | uploads 6.7″ listing screenshots |
| `asc-verify-production.mjs` | read-only readiness board |

---

## Next launch priority (not Apple)

**Google Play has not started** — its **14-day closed-testing clock + 12 active
testers** is the real launch bottleneck. After Apple is submitted: service-account
setup → first AAB to Internal Testing → promote to Closed Testing to start the
clock. See `docs/RESUME_HERE.md` Tasks 19–31.
