# App Store + Play Store Launch — Production-Readiness Design

**Date:** 2026-04-25
**Status:** Design approved by Aqil (all 4 sections), ready for `writing-plans` skill in a fresh session
**Target branch:** `appstore-launch` (off `prod-ready/main`)
**Research artifact:** `APPSTORE_PLAYSTORE_RESEARCH.md` (committed 2026-04-25, ~1000 lines, primary-source citations)
**Anchor date:** Day 0 = Sat 2026-04-25; target launch window = Sat 2026-05-30 → Sat 2026-06-06 (Days 35-42)

---

## 1. TL;DR

Take the haloFrame codebase from "web-shipped, Capacitor-scaffolded" to "live on Apple App Store and Google Play." 5-6 weeks, two-track parallel work. Code work is ~1300 LOC across ~35 files. Dashboard/infra work is ~12-15h across RevenueCat, App Store Connect, Play Console, Cloudflare, Codemagic. Spend is ~$15-65 plus existing accounts. Calendar is fixed by two store-imposed clocks (Apple TestFlight 7-30d + Google Closed Testing 14d) that we start ticking together on Day 14.

The single biggest schedule killer is the Google Closed Testing 14-day rule for new developer accounts; mitigated by recruiting 15-18 testers (target 12 actively engaged) on Day 0.

The single biggest approval risk is Apple guideline 5.1.2(i) (third-party AI disclosure, Nov 2025); mitigated by an in-app AI consent modal before first photo upload, plus explicit privacy-policy disclosure naming fal.ai.

---

## 2. Current state (as of Day 0)

Repo state confirmed at `.worktrees/prod-ready` on branch `prod-ready/main`:

**Already shipped (Phases A-K from `docs/WHATS_DONE.md`):**
- React/Vite web app at `apps/web` with full screen suite (Auth, Editor, EnhanceFlow, ReuniteFlow, Paywall, MyTributes, PrintShop, Settings, Legal)
- Express API at `apps/api` with routes: spike (AI pipeline), tribute (save bridge), subscription (RC webhook + Stripe checkout), webhook (Stripe), me (export + delete), prints, templates, report (NEW in this design)
- Capacitor 8.x scaffold (`apps/web/capacitor.config.ts`, plugins: app, camera, filesystem, haptics, preferences, share)
- Bundle ID `com.haloframe.app`
- Per-flow free tier (1 enhance + 1 reunite) via `supabase/migrations/20260421000001_per_flow_free_tier.sql`
- Stripe checkout for canvas prints + subscription web fallback
- RevenueCat **server webhook handler** at `apps/api/src/routes/subscription.ts:234-353` with product mapping + idempotent `grant_credits` RPC
- Privacy + Terms templates at `apps/web/src/screens/LegalScreen.tsx` (with `{{PLACEHOLDER}}` tokens)
- Account export + delete at `apps/api/src/routes/me.ts`
- Health probes (`/healthz`, `/readyz`), structured logging (Pino), Sentry, rate limiting, CORS

**Confirmed missing (gaps this design fills):**
1. RevenueCat **client SDK** (`@revenuecat/purchases-capacitor` not installed; PaywallScreen uses Stripe regardless of platform)
2. `apps/web/ios/` and `apps/web/android/` directories (`npx cap add` never run)
3. AI consent modal (Apple 5.1.2(i) gate)
4. AI-generated badge + watermark (deepfake mitigation)
5. User-reporting flow (Google AI Content policy mandate)
6. Native photo picker (Apple 5.1.1(iii) — out-of-process picker required)
7. Restore Purchases UI button (Apple-required)
8. Privacy/Terms placeholder fills + 2026 store-policy clauses (fal.ai disclosure, GDPR/CCPA, retention SLA)
9. Public hosted privacy/terms URLs
10. App icon, splash, screenshots
11. Domain (`haloframe.app`), DNS, support email
12. RevenueCat dashboard products (server expects them; dashboard not configured)
13. App Store Connect app + IAP product config
14. Play Console app + IAP product config
15. Codemagic CI for iOS (no-Mac build pipeline)
16. Beta tester recruits (12+ for Google Closed Testing)
17. Demo account for App Review (`reviewer@haloframe.app`)

---

## 3. Constraints (locked by Aqil)

| Constraint | Value | Implication |
|---|---|---|
| Mac access | None | iOS archives go through Codemagic CI (free tier 500 min/mo) |
| Timeline | Balanced 5-6 weeks, both stores | Two-track parallel; Day 14 dual submission |
| Account state | Apple Developer + Google Play + RevenueCat all active | $0 additional account spend |
| Domain | Not registered | Day 0 task — `haloframe.app` (~$15) |
| Legal review | Use existing template + my fills, no lawyer | Saves ~1-2 weeks; standard for solopreneur launch |
| Beta testers | Self-recruit | Day 0 task — 18 DMs sent, target 12 active |
| AI safety badge | Always-visible "✨ AI-generated" | Maximizes approval probability; minor UX cost |

---

## 4. Approach: Two-track parallel (chosen over Sequential / Android-first)

Track A (infrastructure): domain, hosting, legal, support email, RC/ASC/Play dashboards, icons, screenshots, beta recruits, Codemagic. Mostly clicking through dashboards, ~12-15h spread across the 5-6 weeks.

Track B (engineering): RevenueCat client SDK, AI safety UX (consent + badge + reporting + watermark), native photo picker, Capacitor scaffolds, content-policy compliance code. ~1300 LOC across ~35 files, ~3-4 focused days.

The two tracks meet on **Day 14 (Sat 2026-05-09)** — a single dual-submit day where TestFlight external review and Google Closed Testing both kick off. The 7-30d Apple clock and 14d Google clock then run in parallel during weeks 3-4. Production submits on Day 28 (Sat 2026-05-23) for Google, Day 29-30 for Apple (after TestFlight clears).

---

## 5. Architecture after changes

```
                 BEFORE                                          AFTER
   ┌──────────────────────────┐         ┌──────────────────────────────────────┐
   │ Web (Vite/React)         │         │ Web (Vite/React) ─── Stripe checkout │
   │   ↓ Stripe everywhere    │         │ iOS app (Capacitor) ┐                │
   │ Express API (Railway)    │         │ Android app (Capacitor) ─── RC SDK   │
   │ Supabase + Stripe + fal  │         │   ↓ RC SDK → Apple IAP / Google Play │
   └──────────────────────────┘         │ Express API (Railway) ── unchanged   │
                                        │ Supabase + Stripe (canvas) + fal     │
                                        │ + RevenueCat dashboard webhook       │
                                        └──────────────────────────────────────┘
```

**Key structural changes:**
- Three clients, one backend. Web/iOS/Android share the React codebase via Capacitor — no React Native rewrite.
- Web stays on Stripe (browser, no IAP requirement). iOS/Android route subscription purchases through RevenueCat SDK → Apple IAP / Google Play Billing. RC webhook hits the existing `/api/subscription/webhook` and grants credits via the same `grant_credits` RPC.
- Stripe stays for canvas prints on all 3 surfaces (physical-goods exception).
- AI-safety surface is new: consent modal, watermark, "✨ AI-generated" badge, user-reporting sheet.
- Privacy/Terms hosted at public URLs (`haloframe.app/privacy`, `/terms`); in-app `LegalScreen.tsx` keeps its template form for in-app reading.

---

## 6. Critical-path calendar (concrete dates)

### Week 1 — Foundation (Days 0-7, Apr 25 → May 2)

| Day | Date | Track A | Track B |
|---|---|---|---|
| 0 | Sat Apr 25 | Register `haloframe.app` (Cloudflare); Cloudflare Email Routing → Gmail; **send 18 beta DMs** | Branch off `prod-ready/main` → `appstore-launch`; install `@revenuecat/purchases-capacitor` + `@capacitor/assets` |
| 1 | Sun Apr 26 | Apply DB migration `20260425000001_app_store_compliance.sql` (dev); Aqil supplies `{{COMPANY_LEGAL_NAME}}` + `{{JURISDICTION}}` | Build `purchases.ts` + `useRevenueCat()` hook + branched PaywallScreen |
| 2 | Mon Apr 27 | DNS propagating; SSL verified; legal docs drafted with 2026 fills | Build AIConsentModal + consent.ts + useConsent hook + wire to flows |
| 3 | Tue Apr 28 | Apply prod DB migration; deploy `/privacy` + `/terms` live; confirm support email reachable; **Day-3 follow-up DMs** | Build AIBadge + bake into Editor + MyTributes; build ReportContentSheet + `/api/report` route |
| 4 | Wed Apr 29 | RC dashboard: project, apps, products, entitlement, offering, webhook | Server-side watermark service (sharp.composite); pipe through tribute output |
| 5 | Thu Apr 30 | App Store Connect: bundle ID, app, sub group, 5 IAP products, API key → RC; run `seed-reviewer-account.mjs` | Native photo picker + wire to flows; Restore Purchases button |
| 6 | Fri May 1 | Play Console: app, listing skeleton, IAP products, service account → RC | E2E Stripe canvas-print smoke ($1 test order) |
| 7 | Sat May 2 | App icon V1 + asset generation; Aqil approves/iterates | Typecheck + unit + Playwright; commit `appstore-launch.v0` |

### Week 2 — Native scaffolds + first builds (Days 8-14, May 3 → May 9)

| Day | Date | Track A | Track B |
|---|---|---|---|
| 8 | Sun May 3 | Beta DM follow-up — confirm 12+ firm yeses (target 15+) | `npx cap add android` + `npx cap add ios`; commit scaffolds |
| 9 | Mon May 4 | Codemagic.io: connect repo, paste codemagic.yaml, encrypt ASC API key + p8 + issuer ID + key ID | Edit Info.plist + AndroidManifest.xml; `capacitor-assets generate` |
| 10 | Tue May 5 | Capture 5-7 screenshots (Pixel 7 AVD + Figma overlays) OR fire off Fiverr | First iOS archive on Codemagic → App Store Connect Builds |
| 11 | Wed May 6 | Paste store-listing copy into both consoles; complete App Privacy + Data Safety questionnaires | First Android AAB built locally via `./gradlew bundleRelease`; sign + upload Internal Testing |
| 12 | Thu May 7 | TestFlight Internal demo (Aqil only): consent modal, AI badge, restore purchases | Same on Play Internal: consent modal, AI badge, restore purchases on real Android device |
| 13 | Fri May 8 | Final pre-flight: review notes, screenshots, demo account, metadata. Last bug-fix window | Ship final pre-submission build to both pipelines |
| **🔒 14** | **Sat May 9** | **🔒 SUBMIT TestFlight external review** + **🔒 Promote AAB Internal → Closed Testing + add 12 testers + send Play invites** | Tag `v1.0.0-rc1`; freeze main app behavior |

### Week 3 — Beta + iterate (Days 15-21, May 10 → May 16)

| Day | Date | Activity |
|---|---|---|
| 15 | Sun May 10 | Confirm all 12 testers accepted Play invite + installed; bump slow ones |
| 16-19 | Mon-Thu May 11-14 | OTA bug-fix branch via Capgo for non-functional issues; **functional changes wait until Day 21+**; monitor Sentry + RC + `/api/report` mailbox |
| 20 | Fri May 15 | TestFlight feedback check — address per risk register if rejected |
| 21 | Sat May 16 | Mid-window beta tester check-in DM |

### Week 4 — Final iteration (Days 22-28, May 17 → May 23)

| Day | Date | Activity |
|---|---|---|
| 22-26 | Sun-Thu | Continue Sentry/feedback triage; lock metadata final; draft launch announcement |
| 27 | Fri May 22 | Verify Google "active testing" health (12 testers, recent installs, 14-day window closing) |
| **🔒 28** | **Sat May 23** | **🔒 Google production submit** (review 3-7d). If TestFlight cleared → **🔒 Apple App Store production submit** (review 24-72h) |

### Week 5-6 — Production review + launch (Days 29-42, May 24 → Jun 6)

| Day | Date | Activity |
|---|---|---|
| 29-31 | Sun-Tue May 24-26 | Apple App Store review window (24-72h post-TestFlight) |
| 32-34 | Wed-Fri May 27-29 | Google production review (3-5d typical) |
| **35** | **Sat May 30** | **🎯 Both stores LIVE (optimistic)** |
| 36-42 | Sun May 31 → Sat Jun 6 | Buffer for late-arriving feedback; latest realistic public launch announcement |

---

## 7. Code changes (Section 2 detail)

Total: ~1300 LOC across ~35 files (15 new, 20 modified).

### A. Native IAP integration — ~250 LOC

| File | Change |
|---|---|
| `apps/web/package.json` | Add `@revenuecat/purchases-capacitor@^9.x` |
| `apps/web/src/lib/purchases.ts` | NEW ~80 LOC: `initRC()`, `getOfferings()`, `purchasePackage()`, `restorePurchases()`, `getCustomerInfo()` — no-op on web |
| `apps/web/src/main.tsx` | MODIFY ~5 LOC: call `initRC(apiKey)` if `Capacitor.isNativePlatform()` |
| `apps/web/src/hooks/useSubscription.ts` | MODIFY ~30 LOC: native sources entitlement from RC, reconciles with backend `/api/subscription/status` |
| `apps/web/src/screens/PaywallScreen.tsx` | MODIFY ~40 LOC: branch on `Capacitor.isNativePlatform()` in `handlePurchase` — native = `purchasePackage()`, web = existing Stripe |
| `apps/web/src/screens/SettingsScreen.tsx` | MODIFY ~25 LOC: add Restore Purchases button (native only) + Manage Subscription link |
| `packages/shared/src/subscription.ts` | MODIFY ~10 LOC: confirm product IDs match RC dashboard |

### B. AI-safety UX — ~400 LOC

| File | Change |
|---|---|
| `apps/web/src/components/AIConsentModal.tsx` | NEW ~120 LOC: shown before first photo upload; explicit "I understand"; persists to localStorage + Supabase |
| `apps/web/src/components/AIBadge.tsx` | NEW ~40 LOC: small "✨ AI-generated" pill, always-visible on every composite |
| `apps/web/src/components/ReportContentSheet.tsx` | NEW ~80 LOC: bottom sheet w/ reason picker → POSTs to `/api/report` |
| `apps/web/src/lib/consent.ts` | NEW ~50 LOC: `hasConsented()`, `recordConsent()`, syncs to profile.ai_consent_at |
| `apps/web/src/hooks/useConsent.ts` | NEW ~30 LOC: gates uploads; auto-triggers AIConsentModal |
| `apps/web/src/screens/ReuniteFlow.tsx` | MODIFY ~10 LOC: gate upload on `useConsent()` |
| `apps/web/src/screens/EnhanceFlow.tsx` | MODIFY ~10 LOC: same |
| `apps/web/src/screens/Editor.tsx` | MODIFY ~15 LOC: render AIBadge + Report trigger |
| `apps/web/src/screens/MyTributesScreen.tsx` | MODIFY ~15 LOC: same in lightbox |
| `apps/web/src/lib/api.ts` | MODIFY ~15 LOC: add `reportContent({tributeId, reason, note})` |
| `apps/web/src/lib/copy.ts` | MODIFY (scrub-pass): remove "deepfake," "alive again," "resurrect," "bring back" → "honor," "memorial," "tribute," "remember" |

### C. Server-side watermark + report endpoint — ~150 LOC

| File | Change |
|---|---|
| `apps/api/src/services/watermark.ts` | NEW ~80 LOC: takes composite buffer, overlays bottom-right "✨ AI-generated · haloframe.app" via sharp.composite |
| `apps/api/src/routes/spike.ts` (or `tribute.ts`) | MODIFY ~10 LOC: pipe composite through `applyWatermark()` before signed-URL upload |
| `apps/api/src/routes/report.ts` | NEW ~50 LOC: POST `/api/report`, validates body (zod), updates `tributes.flagged_at`, fires Sentry tag, emails admin via Resend |
| `apps/api/src/index.ts` | MODIFY ~3 LOC: register `reportRouter` |
| `apps/api/src/routes/me.ts` | AUDIT (no expected change) — verify DELETE cascades to: tributes rows, Supabase storage objects, credit_ledger, profile |

### D. Database migration — ~30 LOC SQL

`supabase/migrations/20260425000001_app_store_compliance.sql`:
- ADD COLUMN `profiles.ai_consent_at TIMESTAMPTZ NULL`
- ADD COLUMN `tributes.flagged_at TIMESTAMPTZ NULL`
- ADD COLUMN `tributes.flagged_reason TEXT NULL`
- CREATE TABLE `reports` (id, tribute_id, user_id, reason, note, created_at)

### E. Native photo picker — ~80 LOC

| File | Change |
|---|---|
| `apps/web/src/lib/photoPicker.ts` | NEW ~50 LOC: `pickPhoto()` — Capacitor `Camera.pickImages()` on native, `<input type=file>` on web |
| `apps/web/src/screens/EnhanceFlow.tsx` | MODIFY ~15 LOC: use `pickPhoto()` |
| `apps/web/src/screens/ReuniteFlow.tsx` | MODIFY ~15 LOC: same |

### F. Public legal hosting — ~10 LOC config + content gen

| File | Change |
|---|---|
| `apps/web/public/privacy.html` | NEW: static HTML mirror, generated from `LegalScreen.tsx` source |
| `apps/web/public/terms.html` | NEW: same |
| `apps/web/public/support.html` | NEW: simple support page (mailto + 3 FAQ entries) |
| `scripts/build-legal.mjs` | NEW ~40 LOC: extracts PRIVACY/TERMS arrays from LegalScreen, renders to plain HTML |
| `apps/web/package.json` | MODIFY: prebuild step `node scripts/build-legal.mjs` runs before `vite build` |

### G. Capacitor scaffolds + native config — ~50 LOC config + generated trees

| File | Change |
|---|---|
| `apps/web/ios/` | SCAFFOLDED via `npx cap add ios` (Windows-OK for scaffold; build on Codemagic) |
| `apps/web/android/` | SCAFFOLDED via `npx cap add android` |
| `apps/web/ios/App/App/Info.plist` | EDIT: NSPhotoLibraryUsageDescription, CFBundleDisplayName |
| `apps/web/android/app/src/main/AndroidManifest.xml` | EDIT: READ_MEDIA_IMAGES (Android 13+), INTERNET, android:label |
| `apps/web/resources/icon.png` | NEW 1024×1024 PNG |
| `apps/web/resources/splash.png` | NEW 2732×2732 PNG |
| `apps/web/package.json` | ADD `@capacitor/assets` devDep + `assets:gen` script |
| `apps/web/capacitor.config.ts` | MODIFY ~5 LOC: Camera plugin config (`allowEditing: false`, `presentationStyle: 'popover'`), tighten SplashScreen |

### H. Codemagic iOS CI — ~80 LOC YAML

`codemagic.yaml` (repo root) + `.codemagic/secrets.md` doc.

### I. Demo account seeder — ~60 LOC

`scripts/seed-reviewer-account.mjs` — idempotent script creating `reviewer@haloframe.app` + 4 sample portrait photos.

### J. Tests — ~150 LOC

| File | Coverage |
|---|---|
| `apps/web/src/lib/purchases.test.ts` | Web returns null offerings; native (mocked) returns mocked offerings |
| `apps/web/src/components/AIConsentModal.test.tsx` | Renders, accepts, persists |
| `apps/api/src/services/watermark.test.ts` | Output dims preserved + bottom-right pixel sample matches |
| `apps/web/tests/e2e/consent.spec.ts` | First upload triggers modal; declining blocks; accepting persists |

### K. Docs — ~3 new files

| File | Content |
|---|---|
| `docs/STORE_LISTINGS.md` | Full App Store + Play Store listing copy (title, subtitle, descriptions, keywords, age-rating answers, demo account, review notes) |
| `docs/REVIEWER_NOTES.md` | Exact text to paste into App Review Information |
| `docs/DEPLOY.md` | MODIFY § 4: replace "later" hand-wave with Codemagic walkthrough |
| `docs/MORNING_CHECKLIST.md` | MODIFY: add "what's left for Aqil" section after this work lands |

### Explicitly NOT doing (locked decisions)

- ❌ Server-side NSFW pre-AI-call moderation (user-reporting + watermark + AI badge satisfy minimum; add only if Google rejects)
- ❌ Push notifications / Local Notifications (bare Capacitor footprint already passes 4.2)
- ❌ React Native rewrite (Capacitor is the chosen architecture)
- ❌ Subscription cancellation UI in-app (Apple/Google manage cancellation in their Settings; "Manage Subscription" link is enough)
- ❌ DEFERRED:B5 full /api/tribute rewire (bridge works; out of scope)
- ❌ fal.ai content moderation pre-call (their model has built-in safety; user-reporting catches gaps)
- ❌ Multi-language localization (English-only at v1)

---

## 8. Outside-code work (Section 3 detail)

### 8.1 Domain, DNS, support email — Day 1, ~30 min, $15
- Cloudflare Registrar: `haloframe.app`
- DNS TTL 300: A `haloframe.app` → Vercel; CNAME `www` → Vercel; CNAME `api` → Railway
- Cloudflare Email Routing: `support@haloframe.app` → Gmail; Gmail filter "haloFrame" label

### 8.2 Legal docs — Day 1-2, ~3 hours, $0
**Aqil supplies:** `{{COMPANY_LEGAL_NAME}}`, `{{CONTACT_EMAIL}}` = `support@haloframe.app`, `{{JURISDICTION}}` (your state).

**Privacy doc additions (research-cited):** explicit fal.ai/AI partner paragraph; "We never train AI on your photos"; 30-day deletion SLA; GDPR Art. 15/17 + CCPA §1798.100/.105 callouts; processor list (Supabase, fal.ai, Stripe, Resend, Vercel, Railway, RevenueCat, Sentry); retention schedule; "no ad tracking" section.

**Terms doc additions:** auto-renewal disclosure with Apple-required wording; acceptable-use prohibitions on deepfakes-of-others / sexually explicit / defamatory; AI-accuracy disclaimer; user content license grant (non-exclusive, royalty-free, only for processing); arbitration clause (binding, individual, in your state).

**Hosting:** `scripts/build-legal.mjs` extracts content arrays from `LegalScreen.tsx`, writes `apps/web/public/privacy.html` + `terms.html` + `support.html`. Vercel serves at `https://haloframe.app/privacy`, `/terms`, `/support`.

### 8.3 RevenueCat dashboard — Day 2-3, ~2 hours, $0
1. New project "haloFrame" (separate from existing Lumore)
2. Add iOS app `com.haloframe.app`; Add Android app `com.haloframe.app`
3. Products (matching `apps/api/src/routes/subscription.ts:168-204`):
   - `haloframe_keepsake_monthly` — $9.99/mo auto-renew
   - `haloframe_heritage_monthly` — $24.99/mo auto-renew
   - `haloframe_heritage_annual` — $199/yr auto-renew
   - `haloframe_topup_4pack` — ~$7.99 non-renewing
   - `haloframe_topup_single` — ~$2.49 non-renewing
4. Entitlement `tributes` — attach all subscription products
5. Offering `default` — packages: monthly_keepsake, monthly_heritage, annual_heritage, topups
6. Webhook: `https://api.haloframe.app/api/subscription/webhook`, Authorization header = `REVENUECAT_WEBHOOK_AUTH_HEADER` env on Railway
7. API keys (iOS public, Android public) → `apps/web/.env` as `VITE_RC_IOS_KEY` / `VITE_RC_ANDROID_KEY`

### 8.4 App Store Connect — Day 3-5, ~3 hours, $0
1. Apple Developer Portal → register `com.haloframe.app` App ID with In-App Purchase capability
2. New App: `haloFrame`, bundle `com.haloframe.app`, SKU `haloframe-ios-001`
3. App Information: subtitle "Memorial portraits, made with care", category Photo & Video (primary) / Lifestyle (secondary)
4. App Privacy questionnaire:
   - Data: Photos, Email, User ID, Purchase History, Crash Data
   - Use: App Functionality, Analytics, Product Personalization
   - Linked: Photos / Email / Purchase History → yes
   - Tracking: **No**
5. Subscription group "tributes" → 3 auto-renewing + 2 non-renewing products
6. Each subscription: localized display name + description, review screenshot
7. ASC API key (Users and Access → Keys, role App Manager) → upload p8 + issuer ID + key ID to RC
8. Listing: description (4000ch), promotional text (170ch), keywords (100ch), Support URL `https://haloframe.app/support`, Privacy Policy URL `https://haloframe.app/privacy`
9. Age Rating questionnaire — expected 4+
10. App Review Information: paste from `docs/REVIEWER_NOTES.md`

### 8.5 Google Play Console — Day 3-5, ~3 hours, $0
1. New app: `haloFrame`, Free with IAP, English (US)
2. App content: privacy URL, demo account, ads No, content rating, target audience 13+, news/COVID/government No
3. Data Safety form (research §2.6 + STORE_LISTINGS.md):
   - Photos: collected, shared with fal.ai, encrypted in transit, deletable
   - Email: collected, not shared
   - Purchase history: via Google Play Billing
   - User ID: collected
   - Crash logs: via Sentry (declare if SENTRY_DSN set)
4. Store listing: short desc 80ch, full desc 4000ch, icon 512×512, feature graphic 1024×500, phone screenshots 4-8 (1080×1920)
5. Subscriptions: matching IDs to RC + ASC
6. Service account `revenuecat-haloframe`: invite to Play Console with Financial Editor role; download JSON → upload to RC
7. Closed Testing track: Google Group `haloframe-beta@googlegroups.com`, add 12+ testers, upload first AAB Day 14

### 8.6 Codemagic CI — Day 8-10, ~2 hours, $0 (free tier)
1. Sign up codemagic.io with GitHub
2. Connect repo, paste `codemagic.yaml`
3. Encrypt env vars: `APP_STORE_CONNECT_KEY_IDENTIFIER`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_PRIVATE_KEY` (p8), `APPLE_TEAM_ID`
4. First trigger: tag push `v1.0.0-rc1` → archive → TestFlight upload (~15 min)

### 8.7 App icon + splash + screenshots — Day 4-10, ~4-6h or ~$50 outsourced
- Icon (1024×1024 PNG, no transparency, no rounded corners): warm beige `#FAF3E2`, gold halo ring `#C9A971`, simple mark
- Splash (2732×2732 PNG): same palette, centered ornament, no text
- `npx capacitor-assets generate` produces all sizes
- Screenshots: 5-7 frames per platform (Apple needs only 6.9" 1290×2796; Google needs 1080×1920 + 1024×500 feature graphic)
- Workaround for no-Mac: capture from Pixel 7 AVD, frame in Figma (AppLaunchpad/Previewed templates), or hire Fiverr ~$50

### 8.8 Beta-tester recruitment — Day 0, Aqil self-execute
- DM template (in `docs/STORE_LISTINGS.md` or as separate `docs/BETA_RECRUITMENT.md`)
- Where: family group chats, friends, r/genealogy, Facebook memorial groups, Discord
- Incentive: lifetime Heritage tier ($24.99/mo retail)
- Buffer: recruit 15-18 → target 12 actively engaged in 14-day window
- Day 5 + Day 10 reminder DMs

### 8.9 Demo account seeding — Day 5, ~30 min
Run `node scripts/seed-reviewer-account.mjs` against prod Supabase. Creates `reviewer@haloframe.app` with strong random password (saved to 1Password + ASC App Access fields + Play Console App Access fields) and 4 sample portrait photos.

### 8.10 Existing accounts — verify
| Service | What to confirm |
|---|---|
| Vercel | Web app at `haloframe.app`; main branch auto-deploy |
| Railway | API at `api.haloframe.app`; env vars complete |
| Stripe | Live keys, products, webhook `https://api.haloframe.app/api/webhook/stripe`, `STRIPE_WEBHOOK_SECRET` |
| Resend | Domain verified, `RESEND_FROM=orders@haloframe.app` |
| Supabase | OAuth (Google, Apple) enabled; anonymous sign-ins enabled; new migration applied |
| Sentry | Optional — `SENTRY_DSN` (Railway) + `VITE_SENTRY_DSN` (Vercel) |

---

## 9. Risk register

| # | Risk | Probability | Trigger | Response |
|---|---|---|---|---|
| 1 | Apple 5.1.2(i) AI disclosure incomplete | Very low | Reviewer says modal not explicit | Adjust copy, name fal.ai, add data-flow diagram. +24h |
| 2 | Apple 4.2 minimum functionality | Low | Reviewer flags webview wrapper | Camera+Haptics+Share+native picker+Restore already present; if rejected, add Local Notifications. +48h |
| 3 | Apple 3.1.1 IAP rule violation | Very low | Stripe path visible to native | Audit `Capacitor.isNativePlatform()` branching. +24h |
| 4 | Apple 5.1.1 privacy gaps | Low | Reviewer asks about retention or processors | Privacy doc has both; cite paragraph. +24h |
| 5 | Apple 1.1/1.2 distasteful memorial AI | Very low | Concept flagged | MyHeritage Deep Nostalgia precedent in App Review Notes; phone call if escalated. +3-5d |
| 6 | Google AI Content Policy moderation insufficient | Low | Wants more proactive filtering | Add Sightengine NSFW pre-call gate (~$10/1k, 2d impl). +72h |
| 7 | **Google Closed Testing 14-day rule failed** | **Medium** | Testers didn't actually use app | Add 3 more testers, ask all to open + generate one tribute, restart 14-day clock. **+14d ⚠** |
| 8 | Google Data Safety form mismatch | Low | Form vs privacy mismatch | Update form. +24-48h |
| 9 | Codemagic build failure | Medium | Cert/signing/pod | Iterate via logs; Day 11-12 buffer. No timeline impact if caught week 2 |
| 10 | Domain registration surprise | Very low | `haloframe.app` taken | Fallback `haloframe.io` / `gethaloframe.com`. +1h |
| 11 | Beta tester dropout | Medium | <12 active in 14d window | Recruited 15-18 buffer; Reddit/FB if short. No timeline impact if caught Day 5-10 |
| 12 | fal.ai outage during demo/review | Low | 500 mid-test | Backend surfaces clearly; reviewer retries. Mock-mode env-flag if chronic. +4h |
| 13 | ASC/Google service account expiry | Very low | Keys rotate | Calendar reminder 1 month pre-expiry; rotate manually |

**Top schedule killer:** #7. Mitigation = active reminder DMs Days 5/10, frame the lifetime-Heritage incentive as requiring weekly login.

**Top approval blocker:** #1, mitigated by AIConsentModal.

---

## 10. Definition of "done"

- ✅ App Store: "Ready for Sale" + downloadable from public US App Store search
- ✅ Play Store: "Published" + downloadable via direct link AND search (search indexing lags 2-3d)
- ✅ One real purchase from a non-tester flowed through RC webhook → backend → user got credits
- ✅ One real canvas-print order flowed through Stripe → email → fulfillment notification reached `ORDER_NOTIFICATION_EMAIL`
- ✅ Account deletion verified end-to-end on a non-test account
- ✅ No CRITICAL or HIGH Sentry issues open in launch-week dashboard
- ✅ Both stores' Reviews tabs being monitored

---

## 11. Post-launch ops (Days 35+)

| Cadence | Activity |
|---|---|
| Daily for 2 weeks | Sentry + RC + Stripe quick scan; respond to reviews <24h |
| Weekly | Cost report (fal.ai + Railway + Vercel + RC + Supabase); user-acquisition source mix |
| Monthly | Subscription tier mix, churn, top-up vs subscription ratio; iterate price points |
| Quarterly | Re-audit privacy/terms; review Apple/Google policy changelog; rotate credentials approaching expiry |

---

## 12. Subscription product IDs (canonical reference)

These IDs MUST match exactly across: backend code (`apps/api/src/routes/subscription.ts:168-204`), shared types (`packages/shared/src/subscription.ts`), RevenueCat dashboard, App Store Connect, Play Console.

| ID | Type | Price | Cadence | Credits |
|---|---|---|---|---|
| `haloframe_keepsake_monthly` | Auto-renew sub | $9.99 | Monthly | 5/mo |
| `haloframe_heritage_monthly` | Auto-renew sub | $24.99 | Monthly | 20/mo |
| `haloframe_heritage_annual` | Auto-renew sub | $199 | Annual | 20/mo (240/yr) |
| `haloframe_topup_4pack` | Non-renewing | ~$7.99 | One-time | 4 (90d expiry) |
| `haloframe_topup_single` | Non-renewing | ~$2.49 | One-time | 1 (90d expiry) |

Top-up exact prices: TBD (Aqil decides on Day 4 when configuring App Store Connect; should be Apple Tier 2/4 or Google equivalent).

---

## 13. Research summary

Full research at `APPSTORE_PLAYSTORE_RESEARCH.md`. Highlights:

1. **Apple guideline 5.1.2(i) (Nov 2025)** — third-party AI disclosure mandatory. In-app modal required.
2. **TestFlight reviews currently 7-30 days** in 2026 (not historical 24-48h).
3. **Google Closed Testing 14-day rule** for new developer accounts: 12 testers × 14 consecutive days, cannot skip.
4. **Memorial AI precedent** mostly OK (MyHeritage Deep Nostalgia, Reface approved). Generative composites ~one notch riskier; mitigated by AI labels + watermarks + user reporting.
5. **Stripe OK for canvas prints** (physical-goods exception). Subscriptions MUST go through Apple IAP / Google Play Billing.
6. **Account deletion** in-app + web endpoint mandatory both stores.
7. **Privacy policy URL** must be live at submission time.
8. **Conservative marketing** — frame as "honor / memorial / tribute," not "deepfake / resurrect / alive again."

Primary sources: developer.apple.com/app-store/review/guidelines, support.google.com/googleplay/android-developer, revenuecat.com docs.

---

## 14. Next session kickoff

This design doc is the input to the implementation plan. To execute in a fresh Claude session:

```
I'm picking up app-store launch work for haloFrame.

Read first:
- docs/plans/2026-04-25-app-store-launch-design.md (the approved design — start here)
- APPSTORE_PLAYSTORE_RESEARCH.md (research backing)
- docs/WHATS_DONE.md (current state)
- docs/MORNING_CHECKLIST.md (manual prereqs)

Active worktree: .worktrees/prod-ready (branch prod-ready/main).

Today's task: invoke the superpowers:writing-plans skill to produce
a detailed file-by-file implementation plan from the design doc above.
```

The new session should:
1. Read the design doc end-to-end
2. Invoke `superpowers:writing-plans` to produce a TDD-ordered implementation plan
3. Save the plan to `docs/plans/2026-04-25-app-store-launch-implementation.md`
4. Commit
5. Then optionally invoke `superpowers:executing-plans` to start work

---

**Approved by Aqil 2026-04-25. Implementation begins next session.**
