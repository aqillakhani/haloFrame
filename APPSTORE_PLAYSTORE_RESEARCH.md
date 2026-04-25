# App Store & Play Store Approval Research: haloFrame

**Research Date:** April 25, 2026  
**App Profile:** haloFrame (memorial photo app with AI reunite feature)  
**Platform:** React/Vite web + Express API (Railway) + Capacitor iOS/Android wrapper + Supabase + Stripe + Resend

---

## Executive Summary

haloFrame presents **moderate-to-high risk on both platforms**, primarily due to:

1. **AI + deceased people:** Apple/Google have not explicitly approved memorial apps that generate new composite images. Related apps (MyHeritage Deep Nostalgia, Reface) exist but use animation/swaps, not generative synthesis. haloFrame's nano-banana-2 model creates *new* images, which lands in "deepfake/manipulated media" territory and triggers stricter scrutiny.

2. **AI data sharing disclosure:** Apple's Nov 2025 guideline 5.1.2(i) requires explicit disclosure + user permission before sharing personal data with third-party AI. Photos of deceased relatives are highly sensitive PII. Non-compliance results in **app removal**.

3. **Photo handling:** Both platforms require Privacy Labels, NSPhotoLibraryUsageDescription (iOS), data minimization, and explicit retention/deletion policies. Supabase + Resend email handling adds processor disclosure requirements.

4. **Subscriptions + physical goods:** Canon print orders can use Stripe (physical goods exception confirmed as of 2026), but subscription tiers must use App Store IAP or Google Play Billing. RevenueCat integration is standard but requires correct subscription group setup.

5. **Capacitor hybrid app:** Apple's "minimum functionality" bar (Guideline 4.2) will scrutinize whether the app is "just a website wrapper." Proof: native photo picker, haptics, or push notifications + meaningful iOS-specific UX will pass; bare WebView won't.

6. **First submission review timelines:** TestFlight currently 7-30 days (not 24-48h as historically quoted). Google Play closed testing: 12 testers, 14 days minimum for new accounts.

---

## 1. Apple App Store Review Guidelines — Critical Areas

### 1.1 Guideline 5.1 (Privacy) — HIGHEST RISK

**Guideline 5.1.1(i): Privacy Policy Required**

- All apps must include privacy policy covering:
  - **Data collected** (photos, user account info, IP address, etc.)
  - **How data is used** (AI processing, storage, billing)
  - **Third parties with access** (fal.ai, Supabase, Stripe, Resend)
  - **Data retention & deletion** (how long photos are kept, when deleted, user deletion request process)
  - **How users can withdraw consent and request deletion**

**For haloFrame, this means:**
- Privacy policy MUST explicitly state:
  - "Photos you upload are sent to fal.ai's nano-banana-2 model for AI processing"
  - "Processed photos are stored in Supabase [how long?]"
  - "You can request deletion of all photos via [in-app + web endpoint]"
  - "We do not sell or share your photos with third parties except as needed for processing"
  - If in EU/Canada: GDPR/CCPA data subject rights (access, portability, erasure)

**Guideline 5.1.2(i): Data Sharing with Third-Party AI — NEW (Nov 2025)**

- **Explicit requirement:** "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so."
- **Implementation:** Cannot rely on privacy policy link alone. Must show **in-app prompt** (pop-up or UI flow) saying "Your photos will be processed by fal.ai's AI. OK?"
- **Enforcement:** Apps violating this face removal from App Store.

**For haloFrame, this means:**
- Add **in-app modal before first upload** explaining:
  - "haloFrame uses AI to create composite portraits. Your uploaded photos will be sent to our AI partner for processing."
  - Require explicit "I understand" or "Agree" tap.
  - Store consent in Supabase.
- Log/timestamp consent per user.
- This is NOT optional; this is a blockers for first submission.

**Guideline 5.1.1(iii): Photo Access — Use Picker, Not Full Access**

- "Where possible, use the out-of-process picker or a share sheet rather than requesting full access to protected resources like Photos or Contacts."
- Capacitor Camera plugin supports photo picker; use it. Don't request blanket photo library access.

**Guideline 5.1.2(iv): Don't Build Databases from Photos**

- "Do not use information from Contacts, Photos, or other APIs that access user data to build a contact database for your own use or for sale/distribution to third parties"
- haloFrame doesn't build a contact database, so this is safe, but reviewers will check the terms.

**Data Deletion & Account Deletion**

- Guideline 5.1.1(ii): Apps must provide "easily accessible and understandable way to withdraw consent and/or request deletion of the user's data."
- Both Apple and Google now require **in-app account deletion UI** (not email support only).
- Timeline: User deletes account → all photos removed from Supabase → email confirmation.

**For haloFrame, this means:**
- Add **Settings > Delete Account** option.
- Backend deletes: auth record, all stored photos, all composite outputs.
- Supabase storage cleanup (automatic or manual?).
- Confirmation email via Resend.
- Document this in App Review notes.

---

### 1.2 Guideline 3.1 (In-App Purchase & Subscriptions)

**Guideline 3.1.1: In-App Purchase Required for Digital Features**

- Apps must use App Store IAP to unlock features, offer subscriptions, sell credits/premium content.
- **Exception: Physical goods.** "Real world goods and services (shipping, groceries, gas) do not require IAP."
- **Your situation:** Subscription tiers (Free 2 / Keepsake $9.99·5 / Heritage $24.99·20) are *digital services* → must use App Store IAP.
- Canvas prints ($49–$179) are *physical goods* → **can use Stripe + external web checkout.**

**For haloFrame, this means:**
- **Tributes (subscriptions) → App Store IAP only.** Set up via App Store Connect:
  - Create subscription group "tributes"
  - Add three products: free2, keepsake5, heritage20 (with matching price tiers)
  - Configure auto-renewal, grace periods, cancellation mechanics
  - Integrate via RevenueCat (easiest path)
- **Canvas prints → Stripe OK, but with conditions:**
  - Must display **external link to web checkout** (Epic v. Apple ruling, April 2025).
  - In US: No additional Apple fee if you use external link button.
  - Outside US: Apple may charge commission on physical goods; check your local App Store rules.
  - Make sure terms are clear: "Print orders processed by [third-party fulfillment] via Stripe"

**Guideline 3.1.2: Subscription Requirements**

- Minimum 7-day billing cycle.
- "Clearly communicate subscription details, including duration, what's included, price, renewal frequency, and how to cancel."
- Must be cancellable from device settings (managed by App Store; you configure in App Store Connect).
- Users can see all subscription details from the App Store app itself.

**For haloFrame, this means:**
- Make sure RevenueCat is correctly configured with App Store Connect.
- Subscription descriptions in App Store Connect must match in-app copy exactly (no hidden upsells).
- Include "Manage Subscription" link in app settings pointing to iOS Settings.app.

---

### 1.3 Guideline 4.2 (Minimum Functionality) — CAPACITOR RISK

**Guideline 4.2: Apps Must Provide Genuine App Experience**

- "Your app should include features, content, and UI that elevate it beyond a repackaged website."
- Bare WebView wrappers that just load a mobile website are rejected.
- Exceptions: apps that add *significant* native features, offline capability, push notifications, native menus, etc.

**Why this matters:** Apple reviewers see Capacitor apps and immediately ask "Is this just a web wrapper?" If yes, rejection under Guideline 4.2.

**For haloFrame, this means:**
- You need **at least one meaningful native integration:**
  - ✅ Native camera/photo picker (Capacitor Camera plugin)
  - ✅ Native sharing (Capacitor Share plugin)
  - ✅ Local notifications (Capacitor Local Notifications)
  - ✅ Haptic feedback (Capacitor Haptics)
  - ✅ Offline mode (Service Worker + local storage)
- Document these in **App Review notes:** "This app integrates native camera access, photo library picker, and haptic feedback to enhance the memorial experience beyond the web version."
- Screenshots should show **native chrome** (status bar, notch-aware UI) not just the web version.

**Capacitor OTA Updates Limitation:**
- Cannot update native code or change app structure remotely.
- Can update JavaScript, assets, web bundle only.
- Apple will reject apps that use OTA to add features Apple didn't review.

**For haloFrame, this means:**
- Use Capgo or similar *only* for bug fixes and UI tweaks, not feature additions.
- Be transparent with reviewers: "We use Capgo for security patches only, no functional changes."

---

### 1.4 Guideline 5.2 (Intellectual Property & Consent)

**Guideline 5.2.1: User-Generated Content Rights**

- Apps must respect intellectual property and user consent.
- When users upload photos, Apple expects you to have terms explaining how those photos are used.

**For haloFrame, this means:**
- **Terms of Service must state:**
  - "You own all photos you upload. By uploading, you grant haloFrame permission to process them using AI to create composite portraits."
  - "haloFrame does not share your photos with third parties except for AI processing."
  - "You can request deletion of all photos at any time."
  - "haloFrame does not use your photos to train AI models or for any purpose beyond what you authorize."
- Since photos are of *deceased relatives*, add: "You represent that you have the right to upload these photos and authorize their processing."

---

### 1.5 Guideline 2.5 & Metadata (Screenshots, Description)

**Guideline 2.3 (Accurate Metadata):**

- Screenshots, description, keywords, and app icon must reflect the *actual* submitted binary.
- No "coming soon" placeholders.
- Screenshots should show real usage, not marketing splash screens.

**For haloFrame, this means:**
- **App Store page needs:**
  - **Title:** "haloFrame: Reunion Photos" (or similar)
  - **Subtitle:** "AI-powered memorial portraits"
  - **Description (3-5 sentences):**
    ```
    Bring together loved ones in beautiful composite portraits.
    
    Upload photos of family members—living or deceased—and haloFrame's AI 
    creates a unified portrait showing you all together. Perfect for memorials, 
    anniversaries, and preserving family history.
    
    • AI-generated composite portraits
    • Print-ready canvases (12×16" to 36×48")
    • Subscription tiers for different needs
    • Your photos are never shared with third parties
    
    Start free with 2 tributes. Upgrade anytime.
    ```
  - **Screenshots (4-5 max):**
    1. Upload screen (showing camera + photo picker)
    2. Composite preview (showing AI result)
    3. Print shop (showing canvas options)
    4. Subscription tier selector
    5. One subscription benefit (e.g., "Heritage: 20 tributes")
  - **Keywords:** memorial, photo, AI, family, tribute, composite, deceased
  - **Age Rating:** Likely 4+ (no violence, nudity, or horror). Will be assigned based on content rating questionnaire.

**2026 Screenshot Update:**
- Only need to upload iPhone 6.9″ and iPad 13″ screenshots; Apple auto-scales for older devices.

---

### 1.6 AI Photo Disclosure (NEW 2025-2026 Concern)

**Status:** Apple has not issued explicit guidelines on "memorial AI apps" or "deepfake photos."

However, recent precedent suggests caution:

**Grok (xAI, April 2026):**
- Apple **threatened removal** over sexually explicit deepfake images.
- After complaints, Apple demanded safety fixes (content filters, age verification).
- Grok was approved after adding guardrails.
- Key lesson: Apple will remove AI image generation apps that generate "offensive" content without safeguards.

**haloFrame's position:**
- Memorial photos of deceased people are *not* in the "sexually explicit" or "defamatory" category.
- MyHeritage Deep Nostalgia (approved on both stores) animates photos of deceased relatives—precedent exists.
- Reface (approved on both stores) does AI face swaps without explicit "deceased people" framing.
- **But:** nano-banana-2 generates *new* images, not swaps or animations. This is less-tested legally.

**Recommendation:**
- Be conservative in marketing: Frame as "honoring memory," not "resurrecting" or "deepfaking."
- Include prominent disclaimer in app: "This composite portrait is AI-generated. [Person name] was created by AI based on photos you provided."
- Consider watermarking generated images or adding a "ℹ AI-generated" badge.
- Terms must state: "Photos are used solely to create memorial composites you request. No other use."

---

## 2. Google Play Store Review Guidelines — Critical Areas

### 2.1 AI-Generated Content Policy (Introduced 2024)

**Core Requirement:** Apps with AI-generated content must:

1. **Prevent harmful output**: "Developers are responsible for ensuring that their generative AI apps do not generate offensive content" (sexualized material, hate speech, deceptive images, etc.)
2. **User reporting**: Apps must include in-app flagging/reporting feature so users can report harmful AI output.
3. **Moderation**: Developers must actively filter and remove prohibited content.
4. **Disclosure**: Label AI-generated content visibly in the app.

**For haloFrame, this means:**
- Add **user-reporting feature**: "Flag this portrait as inappropriate" button in preview/gallery.
- Backend: Review flagged images, delete if they violate terms (nude/sexually explicit, hate symbols, defamatory content).
- Disclosure: Show "AI-generated portrait" label on every composite image.
- Terms must state: "Prohibited uses: creating deepfakes of people without consent, sexually explicit images, images intended to deceive."

### 2.2 Deepfake & Manipulated Media Policy

**Status (2026):** Google Play policy explicitly prohibits:
- Non-consensual deepfake sexual material
- Voice or video recordings of real people used for scams
- Election-related deepfakes

**Enforcement gap:** Despite policy, "nudify" apps with 483M downloads still exist on Google Play (as of April 2026). Enforcement is inconsistent.

**For haloFrame:**
- Memorial app is *consensual* (user uploads their own photos), so not in the banned category.
- But Google reviewers may ask: "How do you prevent misuse?" (e.g., user uploading someone else's photos without consent).
- Answer: "Photos are uploaded only by registered account holders. We cannot prevent misuse via external means, but users can report inappropriate portraits."

### 2.3 Personal & Sensitive Information Policy

**Guideline: Data Safety Form** (mandatory for all apps)

Google Play requires **Data Safety Form** declaring:
- **Data types collected:** Photos, video, personal info, contact info, user ID, purchase history, etc.
- **Sensitive info:** If you collect ethnicity/race (e.g., via facial analysis), must disclose.
- **Data retention:** How long data is kept.
- **Third-party sharing:** List all processors (fal.ai, Supabase, Stripe, Resend, Google Analytics, etc.).
- **Data deletion:** How users request deletion.
- **Encryption:** Whether data is encrypted in transit and at rest.

**For haloFrame, this means:**
- Complete Data Safety Form with:
  - ✅ Photos (collected)
  - ✅ Personal information (email, account)
  - ✅ Precise location (NO, unless you add geo-tagging)
  - ✅ Payment information (YES, for canvas orders via Stripe)
  - ✅ User ID (YES)
  - **Retention:** "Photos deleted within 30 days of account deletion. Processed images retained for [X] days for user download."
  - **Third parties:** fal.ai (AI processing), Supabase (storage), Stripe (payments), Resend (email), Google Analytics (optional, if you use it)
  - **Encryption:** TLS for transit; Supabase encryption at rest (check your plan)

---

### 2.4 Account Deletion Requirement (Mandatory since 2023/2024)

**Google Play Policy:**
- "If your app allows users to create an account, it must allow users to request account deletion **in-app** and via a **web resource**."
- User deletes account → all personal data must be deleted within 30 days.

**For haloFrame, this means:**
- **In-app:** Settings > Delete Account > Confirmation > "All photos and account data will be permanently deleted."
- **Web endpoint:** Create a `DELETE /user/:id` endpoint (can be gated by email verification token) that:
  - Deletes auth record
  - Deletes all photos from Supabase storage
  - Deletes user metadata
  - Returns 200 OK
- **Documentation:** Include endpoint URL in App Review notes: "Account deletion available at [URL]"

---

### 2.5 Google Play Closed Testing Requirement for New Developers

**Critical timeline risk:**

- New personal developer accounts created after Nov 2023 must run **closed testing** before production launch.
- **Minimum:** 12 testers opted-in for **14 consecutive days.**
- **Internal testing does NOT count** toward the 14 days.
- Failure to meet this blocks production publishing.

**For haloFrame:**
- If this is a new Google Play Developer account, you **cannot skip closed testing.**
- Plan: Create 12-15 test accounts, add to Play Console closed testing track, start 14-day clock now.
- Day 14: You can apply for production. Google review: ~7 days.
- **Total: ~3 weeks minimum from now if you haven't started.**

---

### 2.6 Data Safety Form Specifics

**Required declarations:**
- ☑ **Photos and Videos:** Yes (users upload for composite)
- ☑ **Personal Information:** Yes (email, account)
- ☑ **Financial Information:** Yes (Stripe for canvas orders)
- ☑ **Sensitive Categories:** If facial analysis (e.g., age detection), declare "facial recognition." If you use nano-banana-2 for appearance analysis, this may be flagged; check fal.ai's content moderation policy.
- ☑ **Third-party sharing:** fal.ai, Supabase, Stripe, Resend
- ☑ **Data deletion:** User can request via Settings > Delete Account

---

## 3. Cross-Platform Compliance (Both Stores)

### 3.1 Privacy Policy

**Must include (both platforms enforce):**

1. **Data collection:**
   - "We collect photos you upload, email address, and account metadata."
   - "We do not collect precise location, contacts, or health data."

2. **Use of data:**
   - "Photos are processed by fal.ai's nano-banana-2 AI model to create composite portraits."
   - "We retain photos in cloud storage for [X days] to allow you to download composites."
   - "We use [email provider] to send you account notifications and receipt emails."

3. **Third-party processors (critical for GDPR/CCPA):**
   - "Supabase (storage, authentication) - Privacy: supabase.com/privacy"
   - "fal.ai (AI processing) - Privacy: [fal.ai's privacy URL]"
   - "Stripe (payment processing) - Privacy: stripe.com/privacy"
   - "Resend (email) - Privacy: [Resend's privacy URL]"
   - "Railway (server hosting) - Privacy: [Railway's privacy URL]"

4. **User rights (GDPR/CCPA if applicable):**
   - "You have the right to access, correct, export, or delete your data. Contact [email] to request."
   - "EU residents: We comply with GDPR. You have rights to data portability and erasure."
   - "California residents: CCPA rights apply. See Privacy Policy for details."

5. **Retention & deletion:**
   - "We delete your account and all associated photos within 30 days of your deletion request."
   - "AI-processed images are retained for [X days] post-download, then deleted."

6. **AI disclosure:**
   - "Your photos are processed by fal.ai's AI. This photo composite is AI-generated."

7. **Contact:**
   - "Privacy questions? Contact [email]. We respond within 30 days."

**For haloFrame:**
- Use a privacy policy generator (TermsFeed, Free Privacy Policy) + customize for fal.ai, Supabase, Stripe.
- **Must be hosted at a web URL** (both Apple and Google require a live privacy policy link, not just in-app text).
- Example: `https://haloframe.com/privacy` or `https://support.haloframe.com/privacy`

---

### 3.2 Terms of Service

**Should include:**

1. **Photo ownership & rights:**
   - "You own all photos you upload. By uploading, you grant haloFrame permission to process them using AI."
   - "You represent that you have the legal right to upload these photos (your own or with consent from deceased's next of kin)."

2. **Permitted uses:**
   - "Composite portraits are for personal, non-commercial use only."
   - "You may not use haloFrame to create deepfakes of real people without their consent."
   - "You may not use the app to deceive or impersonate anyone."

3. **AI-generated content:**
   - "Composites are AI-generated and may not be perfectly accurate."
   - "Composite photos are not suitable for identity verification, legal documents, or official purposes."

4. **Subscription terms:**
   - "Subscriptions renew automatically. You can cancel anytime via Settings or account settings page."
   - "No refunds for partial month of cancellation."

5. **Acceptable use policy:**
   - "Prohibited: Nude or sexually explicit composites, composites intended to deceive, hate speech, defamatory content."

6. **Limitation of liability:**
   - "haloFrame is provided 'as is'. We are not liable for AI output errors or misuse of generated photos."

---

### 3.3 Age Rating

**Apple (4+ / 9+ / 12+ / 13+ / 16+ / 18+):**

For haloFrame, likely **4+** because:
- No violence, gore, or horror.
- No sexual content.
- No gambling or loot boxes.
- Grief/memorial context is not inherently objectionable (memorials are age-appropriate).
- Apple will ask content rating questions; answer honestly.

**Google Play (Everyone / 3+ / 7+ / 12+ / 16+ / 18+):**

Likely **Everyone** for the same reasons.

---

### 3.4 Account Deletion Requirement

**Both platforms now require:**
- ✅ In-app "Delete Account" option (prominent, in Settings)
- ✅ Web endpoint for account deletion (can be gated by email token)
- ✅ Documentation of both in App Review notes
- ✅ Deletion within 30 days; data removal confirmation

---

## 4. Sensitive Area: AI + Deceased People

### 4.1 Legal Landscape (April 2026)

**No explicit "memorial AI" prohibition** from Apple or Google, but context from recent events:

1. **Grok (xAI, April 2026):**
   - Apple threatened removal over sexually explicit deepfakes.
   - Grok was approved *after* adding content moderation.
   - Lesson: Apple will scrutinize AI image gen apps for abuse.

2. **Nudify apps (ongoing issue):**
   - 483M downloads despite policy ban.
   - Google Play / Apple App Store enforcement is inconsistent.
   - Lesson: Policy exists, enforcement is patchy.

3. **MyHeritage Deep Nostalgia (approved 2021, still live):**
   - Animates old family photos of deceased people.
   - No controversy; approved on both stores.
   - Lesson: Memorial framing + animation (not generation) is safe.

4. **Reface (approved 2021, still live):**
   - AI face swaps, used by millions.
   - No major app store issues.
   - Lesson: Face-swapping AI is accepted.

**haloFrame's position:**
- Composite portrait generation is more novel than animation/swapping.
- But it's *not* "deepfake porn" or "identity fraud."
- Risk is *moderate*: reviewers may ask for clarification, but approval is likely with proper framing and safeguards.

### 4.2 Risk Mitigation

1. **Marketing & framing:**
   - "Create memorial portraits" (not "resurrect," "deepfake," or "AI spouse")
   - Emphasize: "Honoring family history" and "Preserving memories"
   - Show real family photos in marketing, not fake-looking AI output

2. **In-app UI:**
   - Label every composite: "AI-generated portrait"
   - Add watermark or badge to prevent misuse
   - Disclaimer on preview: "This is an AI composite and may not be a perfect resemblance."

3. **Terms & policy:**
   - "Prohibited uses: Creating deepfakes to deceive, impersonate, or harass. Creating explicit or defamatory content."
   - "You represent you have the right to process these photos."

4. **User reporting:**
   - "Flag this portrait as inappropriate" feature (required by Google, recommended for Apple)
   - Backend review & deletion of flagged content

5. **Review notes:**
   - Proactively explain in App Review Information: "haloFrame creates AI-generated memorial portraits from user-uploaded photos. This is intended to honor family memories, not to deceive. Each composite is labeled as AI-generated and watermarked to prevent misuse."

---

## 5. Subscription Setup (RevenueCat Best Practices)

### 5.1 Apple App Store IAP Configuration

**Create in App Store Connect:**

1. **Subscription Group:** "tributes"
2. **Products:**
   - `com.haloframe.tributes.free2` (Free tier, 2 credits)
   - `com.haloframe.tributes.keepsake5` ($9.99/mo, 5 credits)
   - `com.haloframe.tributes.heritage20` ($24.99/mo, 20 credits)
3. **Subscription details:**
   - Renewal type: Auto-renewing
   - Billing period: 1 month
   - Grace period: 3 days (allow user to fix payment method)
   - Cancellation options: Full refund if cancelled within 14 days of purchase
4. **Localization:**
   - Display names: "Keepsake: 5 tributes/month", "Heritage: 20 tributes/month"
   - Descriptions: Bullet-point benefits (e.g., "Download high-res images, Print-ready versions, Priority support")

**RevenueCat Integration:**
- [RevenueCat iOS Product Setup Docs](https://www.revenuecat.com/docs/getting-started/entitlements/ios-products)
- Create RevenueCat "Offering" that maps to the three products above
- Configure App Store Connect API key in RevenueCat dashboard
- Test with TestFlight; restore purchases works automatically

---

### 5.2 Google Play Billing Configuration

**Create in Google Play Console:**

1. **Subscription products:**
   - `tributes.keepsake5` ($9.99/month)
   - `tributes.heritage20` ($24.99/month)
2. **Base plans:**
   - "monthly-autorenewing" (default)
   - Billing period: Monthly
   - Auto-renewal enabled
3. **Free trial (optional):**
   - "7-day-free-trial" offer on Keepsake tier to drive upgrades
4. **Grace period:**
   - 3 days (same as Apple)

**RevenueCat Integration:**
- [RevenueCat Google Play Setup Docs](https://www.revenuecat.com/docs/getting-started/entitlements/android-products)
- Create RevenueCat "Offering" with the products above
- Configure Google Play Service Account credentials in RevenueCat dashboard
- Test with internal testing first, then closed testing

---

### 5.3 Physical Goods (Canvas Prints via Stripe)

**Configuration:**
- Use Stripe Checkout (hosted payment page)
- Link from in-app "Print Shop" screen to Stripe web checkout
- On iOS: Requires external link disclosure per Apple's updated guidelines (April 2025)
- On Android: No additional requirement beyond Stripe integration

**Terms must state:**
- "Canvas orders are processed by [fulfillment partner] via Stripe. haloFrame does not collect a commission; we facilitate the order."
- "Shipping and returns: [Fulfillment partner's policy]"

---

## 6. Capacitor Submission Specifics

### 6.1 Native Feature Integration (Required)

To pass Apple's "minimum functionality" test (Guideline 4.2), integrate:

1. **Camera & Photo Picker:**
   - Use `@capacitor/camera` plugin
   - Request `NSPhotoLibraryUsageDescription` in Info.plist: "We need access to your photos to create memorial composites."
   - Show native photo picker (not web file input)

2. **Haptic Feedback (optional but recommended):**
   - Use `@capacitor/haptics` plugin
   - Fire haptics on upload success, composite generation
   - Creates "native feel" that reviewers appreciate

3. **Share Sheet (optional):**
   - Use `@capacitor/share` plugin
   - Allow users to share generated composites to Photos, Messages, etc.
   - Shows iOS integration

4. **Local Notifications (nice-to-have):**
   - Use `@capacitor/local-notifications` plugin
   - Notify user when composite is ready if processing is async
   - Shows meaningful native integration

**For haloFrame, this means:**
- Minimum: Use Camera plugin for photo picker + request photo library permission correctly.
- Recommended: Add haptics + share sheet.
- Avoid: Don't use WKWebViewConfiguration to load a website and call it an app.

### 6.2 App Review Notes

**Include in "Notes for Review" (App Store Connect):**

```
haloFrame is a memorial photo app that creates AI-generated composite portraits.

Native Integration:
- Uses Capacitor Camera plugin for native photo picker
- Integrates haptic feedback for user interactions
- Supports native sharing via iOS Share Sheet
- Requires NSPhotoLibraryUsageDescription permission

Feature Overview:
- Users upload photos of family members
- AI generates a composite portrait
- High-res download and print-shop integration

Privacy:
- Photos are processed by fal.ai's nano-banana-2 AI
- All photos are encrypted in transit (TLS) and at rest (Supabase)
- Users can delete all photos and account at any time
- No data is shared with third parties except for processing

Terms of Use:
- Users represent they have the right to process photos
- Composites are labeled as AI-generated
- Prohibited: deepfakes to deceive, explicit content

Subscriptions:
- Free tier (2 tributes/month)
- Keepsake ($9.99/month, 5 tributes)
- Heritage ($24.99/month, 20 tributes)
- Managed via App Store In-App Purchase

This app does not modify native code via OTA updates. 
Only JavaScript and assets are updated.
```

### 6.3 Screenshots & Metadata

**Recommended metadata:**

| Field | Value |
|-------|-------|
| **App Name** | haloFrame |
| **Subtitle** | AI-powered memorial portraits |
| **Category** | Photo & Video or Lifestyle |
| **Keywords** | memorial, family, photo, AI, tribute, composite |
| **Privacy Policy URL** | https://haloframe.com/privacy |
| **Support URL** | https://support.haloframe.com or email support@haloframe.com |
| **Age Rating** | 4+ |

**Screenshots (upload 6.9" iPhone set):**
1. Onboarding: "Create memorial portraits"
2. Upload flow: Camera picker + photo selection
3. Preview: Composite portrait with "AI-generated" label
4. Edit/download: High-res options
5. Print shop: Canvas size selector
6. Subscription tiers: Pricing + benefits

---

## 7. Submission Timeline & Phasing

### 7.1 Apple App Store

| Phase | Timeline | Notes |
|-------|----------|-------|
| **TestFlight Internal** | 1-5 minutes | Build available to internal testers immediately |
| **TestFlight Review (External)** | 7-30 days* | Currently much longer than historical 24-48h. Plan conservatively. |
| **App Store Review** | 24-72 hours (historically); 7-30 days (currently) | First submissions may take longer. |
| **Approved** | Launch in App Store | Live immediately or scheduled release |

*As of April 2026, TestFlight reviews are experiencing significant delays (7-30 days vs. 24-48h historically). Start now if you want to launch by end of April.

**Best practice:**
1. Complete development + all privacy/legal docs NOW.
2. Create TestFlight build → submit for external test review.
3. **Parallel:** Prepare App Store metadata, screenshots, age rating, review notes.
4. If TestFlight approved: update metadata based on feedback, submit to App Store.
5. Wait for App Store review (assume 2 weeks, hope for faster).

---

### 7.2 Google Play

| Phase | Timeline | Notes |
|-------|----------|-------|
| **Internal Testing** | 1-2 hours | Build available to self + trusted testers immediately |
| **Closed Testing** | 14+ days | Minimum 12 testers for 14 consecutive days (new accounts). |
| **Closed Testing Review** | 1-2 days | Google reviews the closed testing build for policy compliance. |
| **Production Submit** | 1 day | After 14-day closed testing, submit to production queue. |
| **Production Review** | 3-7 days | Google reviews production build. |
| **Approved** | Launch in Play Store | Live immediately or scheduled release |

**Best practice:**
1. **Now:** Set up closed testing with 12-15 test accounts.
2. **Start 14-day clock:** Add them to closed testing track, let clock run.
3. **Day 14:** Verify closed testing requirements met. Submit production build.
4. **Day 15-21:** Wait for Google review.

---

### 7.3 Capacitor iOS/Android Build Process

**iOS (via Xcode):**
```bash
npm run build
npx cap add ios
npx cap copy ios
open ios/App/App.xcworkspace
# Configure signing + provisioning profile in Xcode
# Product > Archive > Distribute App > App Store Connect
```

**Android (via Google Play Console):**
```bash
npm run build
npx cap add android
npx cap copy android
cd android
./gradlew bundleRelease
# Upload to Play Console via web UI
```

**TestFlight + Play Console UI:**
- Both platforms now have good web-based submission flows
- Apple: App Store Connect → TestFlight tab → external testing
- Google: Play Console → Releases → Closed testing → upload AAB (Android App Bundle)

---

## 8. Required Legal Documents

### 8.1 Privacy Policy

**Minimum length:** 1000-1500 words (you'll need this for GDPR/CCPA compliance anyway).

**Sections:**
1. What data we collect
2. How we use it
3. Third-party processors
4. User rights (GDPR/CCPA)
5. Retention & deletion
6. Contact info
7. Policy updates

**Hosted at:** `https://haloframe.com/privacy` (must be live at submission time)

**Tools:** TermsFeed, Free Privacy Policy, or hire a lawyer (~$500-1000 for custom)

---

### 8.2 Terms of Service

**Sections:**
1. User agreement & acknowledgment
2. Photo ownership & rights
3. Permitted & prohibited uses
4. AI-generated content disclaimer
5. Subscription terms (auto-renewal, cancellation)
6. Limitation of liability
7. Dispute resolution
8. Changes to terms

**Hosted at:** `https://haloframe.com/terms` (must be live at submission time)

---

### 8.3 GDPR / CCPA Compliance

**If you have EU/CA users:**

1. **GDPR (EU):**
   - Provide data export endpoint (GDPR Article 15: right to portability)
   - Provide account deletion (GDPR Article 17: right to erasure)
   - Privacy policy must explain legal basis (consent, contract, etc.)
   - Consider Data Processing Agreement (DPA) with Supabase + fal.ai

2. **CCPA (California):**
   - Provide data access (CCPA §1798.100)
   - Provide deletion (CCPA §1798.105)
   - Privacy policy must list categories of data collected
   - "Do Not Sell My Personal Information" link (if you sell data; haloFrame doesn't, so N/A)

**For haloFrame:**
- Privacy policy section: "EU users have rights to access, correct, export, and delete data. Contact [email]."
- California users: Same rights apply under CCPA.
- Implement: /user/:id/data (export) + DELETE /user/:id (deletion) endpoints.

---

## 9. Known Pitfalls & Preemption Strategy

### 9.1 Likely Rejection Triggers (and how to avoid)

| Issue | Why Rejected | Preemption |
|-------|-------------|-----------|
| **No privacy policy** | Guideline 5.1.1(i) | Publish privacy policy before submission |
| **Insufficient photo picker consent** | Guideline 5.1.1(iii) + 5.1.2(i) | Add in-app modal before upload: "Your photos will be processed by AI. OK?" |
| **No AI data-sharing disclosure** | Guideline 5.1.2(i) (NEW Nov 2025) | Explicit pop-up + privacy policy explaining fal.ai processing |
| **Bare webview, no native features** | Guideline 4.2 | Integrate Camera plugin + haptics + share sheet |
| **Subscription not in IAP** | Guideline 3.1.1 | Use App Store IAP for tributes; Stripe only for physical goods |
| **No account deletion** | Guideline 5.1.1 + Google Play policy | Add Settings > Delete Account; backend removes all photos |
| **Incomplete or false metadata** | Guideline 2.3 | Screenshots match actual app; description accurate; no placeholders |
| **No demo account** | Standard review process | Provide test account in review notes if login exists |
| **Deepfake concerns** | Policy on manipulated media | Prominent "AI-generated" label; watermark; terms prohibiting misuse |
| **Google Play: Closed testing incomplete** | New account requirement | Start 12 testers now; run 14 days before production submit |

---

### 9.2 Demo Account Strategy

**For Apple App Store:**

If haloFrame requires login (Supabase auth):
1. Create a test account: `reviewer@haloframe.test` / `TestPass123!`
2. Prepopulate with sample photos (can be generic family photos or stock images with proper licensing)
3. Include in App Review Information:
   ```
   Demo Account:
   Email: reviewer@haloframe.test
   Password: TestPass123!
   
   This account has sample family photos preloaded.
   Reviewers can tap "Create Portrait" to see the full flow.
   Subscription tiers can be tested via Settings > Manage Subscription.
   
   Note: Canvas orders will not process in test mode (Stripe test keys used).
   ```

---

## 10. RevenueCat Integration & Receipt Validation

### 10.1 Why RevenueCat?

- Handles subscription receipt validation for both Apple + Google
- Provides unified API (no need to call App Store + Play Console separately)
- Manages subscription lifecycle (upgrade, downgrade, cancellation, grace period)
- Analytics: LTV, churn, renewal rates
- Entitlement management: haloFrame can check "user entitled to 20 tributes?" via RevenueCat

### 10.2 Setup Checklist

**Apple:**
- [ ] Create App Store Connect API key (Service Account role)
- [ ] Copy key ID, key file, issuer ID into RevenueCat dashboard
- [ ] Create subscription products in App Store Connect
- [ ] Create RevenueCat "Offering" mapping products
- [ ] Test with TestFlight

**Google:**
- [ ] Create Google Cloud Service Account for Play Console API
- [ ] Grant "Admin" or "Financial Editor" role
- [ ] Download service account JSON key
- [ ] Upload to RevenueCat dashboard
- [ ] Create subscription products in Play Console
- [ ] Create RevenueCat "Offering" mapping products
- [ ] Test with closed testing

**In-app:**
- [ ] Call RevenueCat `getCustomerInfo()` on app load
- [ ] Check user's `activeSubscriptions` (array of product IDs)
- [ ] Gate features: If `heritage20` in active subscriptions → show 20 tributes
- [ ] Implement "manage subscription" button → RevenueCat web UI

---

## 11. Summary: Action Items for haloFrame

### Immediate (This Week - Before First Submission)

- [ ] **Privacy Policy:** Draft + host at `https://haloframe.com/privacy`
  - Include: fal.ai disclosure, data retention, user rights, GDPR/CCPA
- [ ] **Terms of Service:** Draft + host at `https://haloframe.com/terms`
  - Include: photo ownership, prohibited uses, AI disclaimer
- [ ] **In-app AI consent modal:** Add before first photo upload
  - "Your photos will be processed by fal.ai's AI. Do you consent?"
- [ ] **Settings screen:** Add "Delete Account" option (backend: cascade delete photos + user record)
- [ ] **Photo labeling:** Mark every composite as "AI-generated portrait"
- [ ] **Support URL:** Set up email support (support@haloframe.com) + response SLA

### Before TestFlight (This Week)

- [ ] **Capacitor Camera:** Use native photo picker, not web file input
- [ ] **Haptics:** Integrate `@capacitor/haptics` for upload/generation feedback
- [ ] **App icon:** Finalized 1024x1024 PNG, no rounded corners (iOS handles that)
- [ ] **Screenshots:** 4-5 real screenshots (not mocks) in 6.9" iPhone format
- [ ] **Metadata:** App Store Connect form filled out (name, subtitle, description, keywords)
- [ ] **Age rating:** Respond to Apple's content rating questionnaire (expect 4+)
- [ ] **Test account:** Create `reviewer@haloframe.test` with sample photos preloaded

### Before App Store / Play Console (Week 2-3)

- [ ] **RevenueCat:** App Store Connect API key + Google Service Account configured
- [ ] **Subscription products:** Created in App Store Connect + Play Console
- [ ] **Demo account:** Verified to work end-to-end (login, upload, composite, download)
- [ ] **Google Play:** 12 testers added to closed testing (start 14-day clock)
- [ ] **Receipt validation:** In-app tests `getCustomerInfo()` + check active subscriptions
- [ ] **Data Safety Form:** Completed (Google Play)
  - Photos: Yes
  - Personal info: Yes
  - Retention: [X days]
  - Third parties: fal.ai, Supabase, Stripe, Resend
  - Encrypted: Yes (TLS + Supabase)

### Launch Checklist (Week 3-4)

- [ ] **TestFlight approved** (or ~2 weeks have passed)
- [ ] **App Store submission:** All metadata finalized, review notes included
- [ ] **Google Play closed testing:** 14+ days elapsed, 12 testers present
- [ ] **Google Play production:** Submit after closed testing approved
- [ ] **Monitoring:** Set up error logging (Sentry or similar), analytics (Mixpanel or Firebase)
- [ ] **Launch communication:** Email, social, press release (optional)

---

## 12. Risk Summary Table

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| **AI disclosure missing (Apple 5.1.2(i))** | 🔴 CRITICAL | High | Add in-app consent modal + privacy policy disclosure |
| **No account deletion** | 🔴 CRITICAL | High | Implement Settings > Delete Account + web endpoint |
| **Bare webview fails "minimum functionality"** | 🔴 CRITICAL | Medium | Integrate Camera + Haptics + Share plugins |
| **Subscription not in IAP** | 🔴 CRITICAL | High | Use App Store IAP + RevenueCat |
| **Deepfake concerns** | 🟡 HIGH | Medium | Label as AI, watermark, terms prohibit misuse, user reporting |
| **Photo privacy insufficient** | 🟡 HIGH | Medium | Use picker not full access, encrypt in transit + rest |
| **Google closed testing incomplete** | 🟡 HIGH | High | Start testers now, run 14-day clock |
| **Metadata mismatch** | 🟡 HIGH | Medium | Screenshots reflect actual app, no placeholders |
| **Slow TestFlight/App Store review** | 🟡 HIGH | High (April 2026) | Submit now, assume 2-3 weeks, don't wait until end of April |
| **GDPR/CCPA non-compliance** | 🟡 HIGH | Medium (if EU/CA users) | Privacy policy + data export + deletion endpoints |
| **Stripe/third-party processor not disclosed** | 🟠 MEDIUM | Medium | Privacy policy names all processors, links to their DPAs |
| **Capacitor OTA changes functionality** | 🟠 MEDIUM | Low (if you're careful) | Only update JS/assets, not native code |
| **Memorial framing rejected as "disrespectful"** | 🟠 MEDIUM | Low | Market as "honoring memory," not "resurrection" |
| **NSPhotoLibraryUsageDescription missing** | 🟠 MEDIUM | Low | Capacitor handles this; double-check Info.plist |

---

## 13. References & Primary Sources

### Apple Official Documentation
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [App Privacy Details (Data Collection Transparency)](https://developer.apple.com/app-store/app-privacy-details/)
- [Account Deletion Requirement (June 2022 onward)](https://developer.apple.com/news/?id=mdkbobfo)
- [Updated App Review Guidelines (Nov 2025)](https://developer.apple.com/news/?id=ey6d8onl) — Includes guideline 5.1.2(i) on third-party AI
- [App Store Connect Help: In-App Purchases](https://developer.apple.com/help/app-store-connect/)
- [NSPhotoLibraryUsageDescription Documentation](https://developer.apple.com/documentation/BundleResources/Information-Property-List/NSPhotoLibraryUsageDescription)

### Google Official Documentation
- [Google Play Developer Policy Center](https://play.google.com/developer-content-policy/)
- [AI-Generated Content Policy](https://support.google.com/googleplay/android-developer/answer/14094294)
- [Data Safety Form (Personal & Sensitive Information)](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Account Deletion Requirements](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Closed Testing Requirements for New Developers](https://support.google.com/googleplay/android-developer/answer/14151465)

### Third-Party Sources (2024-2026 Precedent & Analysis)
- [Grok/xAI Deepfake Threat (April 2026)](https://9to5mac.com/2026/04/14/apple-reportedly-threatened-to-remove-grok-from-the-app-store-over-sexualized-deepfakes/)
- [Nudify Apps on App Store/Play (April 2026)](https://www.breitbart.com/tech/2026/04/16/apple-and-google-continue-to-offer-nudify-apps-that-use-ai-to-generate-deepfake-porn/)
- [Epic v. Apple Ruling Impact on Payment (April 2025)](https://techcrunch.com/2025/05/01/stripe-shows-ios-developers-how-to-avoid-apples-app-store-commission/)
- [TestFlight Review Delays (March 2026)](https://www.lowcode.agency/blog/ios-app-review-delays-march-2026/)
- [RevenueCat Subscription Setup (2026 Codelabs)](https://revenuecat.github.io/codelabs/google-play.html)
- [MyHeritage Deep Nostalgia (Approved Precedent)](https://www.aiaaic.org/aiaaic-repository/ai-algorithmic-and-automation-incidents/myheritage-deep-nostalgia)
- [Reface App (Approved AI Face-Swap Precedent)](https://apps.apple.com/us/app/reface-face-edit-ai-photo-app/id1488782587)
- [Stripe Physical Goods & External Payments (2026)](https://www.revenuecat.com/blog/engineering/can-you-use-stripe-for-in-app-purchases/)
- [Capacitor iOS Deployment Guide](https://capacitorjs.com/docs/ios/deploying-to-app-store)
- [GDPR Compliance for Apps (Supabase DPA)](https://supabase.com/legal/dpa)
- [Apple App Store Age Rating Updates (2026)](https://developer.apple.com/news/?id=ks775ehf)

---

## 14. Conclusion

haloFrame can likely **pass both app stores**, but success depends on:

1. **Explicit AI disclosure** (in-app modal + privacy policy) — Apple's Nov 2025 guideline 5.1.2(i) is non-negotiable.
2. **Meaningful native integration** (Camera + Haptics minimum) — Avoid bare webview rejection.
3. **Proper subscription setup** (App Store IAP + RevenueCat) — No workarounds.
4. **Clear account deletion** (in-app + web endpoint) — Both platforms require this.
5. **Conservative framing** (memorial, not deepfake) — Preempt deepfake concerns with labels, watermarks, terms.
6. **Timeline management** — Start TestFlight now (7-30 day review). Google Play: 14-day closed testing lock.

**Realistic timeline:**
- **This week:** Privacy policy, T&Cs, AI consent modal, delete account feature
- **Next 1-2 weeks:** TestFlight submission (assume 2+ week review)
- **Parallel:** Google Play closed testing (12 testers, 14 days)
- **Week 3-4:** App Store + Play Console submissions
- **Late May (optimistic) or early June (realistic):** Both stores live

**Estimated effort to resolve blockers:** 3-5 engineering days + 1-2 legal/compliance days for privacy docs.

Good luck with haloFrame. The memorial framing + real user need puts this in a strong position, but attention to Apple/Google's specific privacy and AI disclosure rules is critical.

