# Screen contracts — invariants the redesign must preserve

**Date:** 2026-04-18
**Purpose:** Before any screen is redesigned, its inputs (hooks / props / state), user actions, and routes are frozen here. A redesigned screen that violates this manifest fails review, regardless of how it looks.

Routing lives in `apps/web/src/lib/navigation.tsx`. Screen enum: `HOME`, `ENHANCE_FLOW`, `REUNITE_FLOW`, `MY_TRIBUTES`, `SETTINGS`, `PRINT_SHOP`, `PAYWALL`. `push(screen)` / `pop()` / `reset()` / `setTab(tab)` are the available nav actions.

---

## HomeScreen

**File:** `apps/web/src/screens/HomeScreen.tsx`

**Hooks:** `useNavigation()`, `useSubscription()` (badge is gated on snapshot)

**Props:** none

**Reads:**
- `COPY.home.*` — eyebrow phase, headline parts, subcopy, section label/index, badge labels, `enhance`/`reunite` path objects, fine print
- `snapshot.planId`, `snapshot.creditsRemaining` — for the optional tributes-remaining badge

**Renders:**
- Wordmark header with decorative gold orb + a11y label "haloFrame"
- Optional right-aligned tributes badge (shown only when snapshot is loaded)
- Greeting section: dynamic eyebrow (`Weekday, a quiet {phase}`), italic-accented headline, subcopy
- Section label row ("Begin a tribute" / "Two paths")
- Two equal-weight path cards: **Enhance** (terracotta accent) and **Reunite** (plum accent), each with an inline decorative SVG illustration
- Quiet fine print at the bottom ("Your photos are yours...")

**User actions:**
- Click Enhance card → `nav.push('ENHANCE_FLOW')`
- Click Reunite card → `nav.push('REUNITE_FLOW')`

**Routes to:** ENHANCE_FLOW, REUNITE_FLOW

**Contract invariants:**
- Two primary CTAs, one each for Enhance and Reunite
- Must include brand mark somewhere with accessibility label "haloFrame"
- No pricing, feature comparison, or testimonials on Home
- Badge (if shown) must not display dollar amounts, tier names, or CTA-like copy — only the tribute count and a short descriptor
- `useSubscription` is read-only: Home never mutates credits or opens paywall directly

---

## EnhanceFlow

**File:** `apps/web/src/screens/EnhanceFlow.tsx`

**Hooks:** `useNavigation()`

**Props:** none

**Reads:**
- `fetchTemplates()` → populates `templates` state
- `uploadFile(file)` → returns `{url, mime, sizeBytes}`
- `segmentImage(imageUrl, detectPets=true)` → `SegmentResult` with `imageWidth`, `imageHeight`, `subjects[]`
- `COPY.enhance.*` (upload, segmenting, selectSubject)

**State machine (local):**
- `step`: `'upload' | 'segmenting' | 'select_subject' | 'editor'`
- `uploadedUrl`, `segmentation`, `selectedSubjectIndex`, `templates`, `error`

**User actions:**
- Upload photo in `upload` step → `handleUpload(file)` → transitions through `segmenting` to either `select_subject` (2+ subjects) or `editor` (1 subject)
- In `select_subject` step: pick a subject via `SubjectSelector`, then Continue → `editor`
- Back button semantics: pop nav from upload, else retreat one step
- No subjects detected → error copy, reset to upload

**Routes to:** PAYWALL (via Editor), PRINT_SHOP (via Editor), previous screen (via pop)

**Contract invariants:**
- Pet detection must still run on segment (`detectPets: true`)
- Subject-selector step only shown for 2+ detected subjects
- Editor mounted with `isPet`, `baseImageUrl`, `subjects`, `selectedSubjectIndex`, `imageWidth`, `imageHeight`, `templates`, `onOrderCanvas`, `onPaywall`, `onBack`
- AbortController cancels template fetch + preloads on unmount

---

## ReuniteFlow

**File:** `apps/web/src/screens/ReuniteFlow.tsx`

**Hooks:** `useNavigation()`

**Props:** none

**Reads:**
- `fetchTemplates()`, `uploadFile()`, `segmentImage()`, `mergePhotos()`
- `COPY.reunite.*`, `PLACEMENT_SUBJECT_DESCRIPTION` (in-file, anchors NB2)

**State machine (local):**
- `step`: `'upload' | 'placement' | 'merging' | 'review' | 'editor'`
- `mainUrl`, `lovedUrl`, `lovedCutoutUrl`, `lovedIsPet`, `placement` (default `'left'`), `mergedUrl`, `sizeAdjustment` (default 1.0), `savedModalOpen`, `templates`, `error`

**User actions:**
- Upload main + loved photos in `upload` → Continue to `placement`
- In `placement`: pick placement (`left|right|behind|front`), adjust size slider, Bring Together → `merging` → `mergePhotos` → `review`
- In `review`: Add Styles → `editor`, OR Save Photo → `triggerDownload` + open `SavedModal`
- In SavedModal: Order Canvas → PRINT_SHOP, Start Another → reset + nav.reset()

**Routes to:** PRINT_SHOP, PAYWALL (via Editor), previous screen

**Contract invariants:**
- Merge call always includes `lovedOneCutoutUrl` when cutout succeeded (server pre-composites for reliable sizing)
- Placement default is `'left'` (memory: user test showed starting at null forced an extra tap)
- `PLACEMENT_SUBJECT_DESCRIPTION` is threaded into Editor as `subjectName` so NB2 anchors to the just-added person
- Size slider range: 0.7–1.4
- Merging step has no back button (in-flight)
- `SavedModal` focus trap preserved

---

## Editor

**File:** `apps/web/src/screens/Editor.tsx`

**Hooks:** `useSubscription()` → `{snapshot, canAfford, refetch}`

**Props:**
```
baseImageUrl: string
subjects?: ApplySubjectContext[]
selectedSubjectIndex?: number
imageWidth?: number
imageHeight?: number
templates: TributeTemplate[]
onOrderCanvas: () => void
onPaywall: () => void
onBack?: () => void
isPet?: boolean
subjectName?: string
placement?: 'left' | 'right' | 'behind' | 'front'
```

**Reads:**
- `applyTemplate({imageUrl, templateIds, intensity, isPet, subjectName, subjects, selectedSubjectIndex, imageWidth, imageHeight, resolution: 'preview' | 'final', placement, saveId})`
- `snapshot.creditsRemaining` → top-right badge
- `canAfford('enhance_save' | 'reunite_save')` → save button gate
- Rich internal caches: `cacheRef` (combo+tier → url), `inflightRef` (dedupe in-flight requests), `requestIdRef` (stale-result rejection)
- `triggerDownload(url)` on successful save

**User actions:**
- Tap a template tile → selection toggled (multi-select) → fires 1K preview via `fetchRender`
- Tap Save → credit check via `canAfford` → if insufficient, push Paywall; if sufficient, fire 2K final render; on 402 throw, refetch snapshot + push Paywall; on success `triggerDownload` + refetch
- Hold to show original photo (toggle `showOriginal`)
- Back → `onBack()`

**Routes to:** PAYWALL (via `onPaywall()`), PRINT_SHOP (via `onOrderCanvas()`)

**Contract invariants (CRITICAL — this is the cost-bearing screen):**
- Every final render sends a stable `saveId` = `save-${comboKey}-${imageUrlSuffix}` so double-click is rejected by ledger dedupe
- 402 `insufficient_credits` caught in save handler MUST both refetch subscription AND push Paywall
- Preview cache hit returns url without an API call (never re-spends)
- Preview cache never serves a final (`tier==='final'` requests bypass preview cache)
- Save on empty selection downloads the source `baseImageUrl` (no charge)
- Save on cached final downloads without charging (re-download of a paid tribute)
- `AbortController` cancels inflight preview calls on unmount
- Badge displays `snapshot?.creditsRemaining ?? 0` — never hardcoded

---

## PaywallScreen

**File:** `apps/web/src/screens/PaywallScreen.tsx`

**Hooks:** `useSubscription()`, `useReducedMotion()`, `useNavigation()`

**Props:** none

**Reads:**
- `SUBSCRIPTION_PLANS_UI` (plans + top-ups)
- `COPY.subscription.*` — new keys added for the 2026-04-19 port: `paywallHeadingBefore`/`paywallHeadingItalic`/`paywallHeadingAfter` (italic-accent split), `paywallEyebrow`, `paywallNoSelectionCta`. Existing `paywallSubheadPlural`, `paywallFooterLine1`/`paywallFooterLine2`, `planCta`, `rolloverNone`/`rollover2Months`, `topupHeading`/`topupSubtitle`, `creditsPerCycle`, `continueCta` still used.
- `snapshot.planId`, `snapshot.creditsRemaining`
- `startPurchase({planId, successUrl, cancelUrl})` — returns `{checkoutUrl?}` on success, throws `ApiRequestError` with details.code on 501

**State:** `selected: SubscriptionPlanId | null`, `purchaseError: string | null`

**Renders:**
- Dismissable close button (X) top-right — 44×44 tap target with sunk-surface fill + rule-strong hover
- Hero: decorative gold `HaloOrnament` (desktop only), terracotta "MEMBERSHIP" eyebrow, italic-accented "Continue *honoring* them." headline with `honoring` in plum, italic subhead reporting tributes used
- Radiogroup of three plan cards (Keepsake, Heritage, Heritage Annual). Heritage Annual renders a gold-dotted "Best Value" kicker via its `tag` field. Selected card gets a 1.5px gold border + 3px gold-soft glow ring + subtle gold gradient hairline at the bottom edge.
- Each plan card shows: name, price + period, italic subtitle, rule hairline, credits line (annual plans use a composite "N a month · M a year" form), rollover line in mono caps.
- Single primary CTA below the plan cards — terracotta, disabled ("Choose a plan to begin") until a plan is selected, plan-specific copy once chosen ("Begin Keepsake membership", etc.).
- Error banner below the CTA for purchase failures — rose-tinted, `role="alert" aria-live="assertive"`, with info icon.
- "Add more tributes" section below a rule divider: serif heading + italic subhead + two side-by-side top-up chips (Tribute 4-pack, Single tribute). Top-ups are visually smaller and quieter than the plan cards.
- Footer: two mono-caps lines — "Subscriptions renew automatically." / "Cancel anytime in Settings."

**User actions:**
- Tap a plan card → `selected = planId` (visual highlight + SR announce). Keyboard: Enter/Space on a focused card also selects.
- Confirm → `startPurchase` → if `checkoutUrl` present, `window.location.assign(url)`; else refetch + pop
- On 501 with `details.code === 'web_checkout_not_configured'` → set friendly purchase error ("Web checkout is coming soon. Use the iOS or Android app to subscribe.")
- Close (X button or Escape key) → `nav.pop()`
- Top-up chips are currently visual-only (no purchase wiring yet) — they remain focusable and keyboard-reachable so the a11y tree is intact for when top-up checkout lands.

**Routes to:** previous screen (via pop), external Stripe/RC checkout (via URL assign)

**Contract invariants:**
- Plans come from `SUBSCRIPTION_PLANS_UI`, not hardcoded — adding a plan in shared adds it here automatically
- Focus-trap dialog behavior preserved (headingRef.focus on mount, restore on exit via post-unmount `main button` query)
- `aria-live="polite"` SR announcement for plan selection
- Purchase error rendered as `role="alert" aria-live="assertive"`
- Top-ups ("Tribute 4-pack", "Single tribute") rendered as a secondary section, not a primary plan card
- "Free" plan intentionally omitted (user is already free and out of credits)
- Primary CTA stays disabled until a plan is selected — no auto-selection of the "best" plan
- Escape key closes the modal (keyboard-first users never trap themselves)
- Heritage Annual's `tag === 'Best Value'` is the single source for the kicker; removing the tag in shared removes the kicker here automatically

---

## SettingsScreen

**File:** `apps/web/src/screens/SettingsScreen.tsx`

**Hooks:** `useSubscription()`, `useNavigation()`

**Props:** none

**Reads:**
- `snapshot.planId` → plan name (`planDisplayName(planId)`; differentiates `heritage_annual` → "Heritage Annual" vs `heritage_monthly` → "Heritage")
- `snapshot.creditsRemaining` → credits line + tributes badge count
- `snapshot.renewsOn` → formatted as "Renews April 19" for paid plans (free plans show "Membership" instead)
- `SUBSCRIPTION_PLANS_UI` for plan details
- `COPY.subscription.*` — includes the new `settingsPlanPrefix`, `settingsMembershipEyebrow`, `settingsRenewsOn`, `settingsTributesLabel`, `settingsNoteEyebrow`, `settingsNote.{free|keepsake|heritage|heritageAnnual}`, and the two-part `fineprint.{left|separator|right}`

**Renders:**
- Quiet "SETTINGS" nav-title eyebrow (no back button — the bottom tab bar owns navigation)
- Plan hero: gold-dotted eyebrow (renewal date on paid, "Membership" on free), italic "You're on {Plan}." headline, italic credit-state sentence, gold tributes-remaining badge
- Note card with plan-specific explanatory paragraph under "On your membership" eyebrow
- Primary terracotta "Extend…" CTA + ghost "Restore purchase" CTA
- Fine print: "Cancel anytime · No commitment" with the middle dot dimmed

**User actions:**
- Tap the Extend CTA → `nav.push('PAYWALL')`
- Tap "Restore purchase" → `handleRestore()` (currently no-op; will wire to RC restore when native lands)

**Routes to:** PAYWALL

**Contract invariants:**
- `planId === 'free'` shows lifetime-credits line; paid plans show remaining-this-period line (`COPY.subscription.creditsLifetime` vs `creditsRemaining`)
- CTA copy varies by plan: Free → extendCtaFree; Keepsake → extendCtaKeepsake; else → extendCta
- Note-card copy varies by plan: `free | keepsake | heritage | heritageAnnual`; `heritage_monthly` falls through to the `heritage` key
- Renewal eyebrow is only rendered when `snapshot.renewsOn` parses to a valid Date; otherwise falls back to "Membership" so free users never see a broken "Renews Invalid Date"
- Restore button remains rendered + focusable even while `handleRestore` is a no-op

---

## PrintShopScreen

**File:** `apps/web/src/screens/PrintShopScreen.tsx`

**Hooks:** none (static catalog for MVP)

**Props:** none

**Reads:**
- `CANVAS_OPTIONS` (9 sizes, inline — single-file change when provider lands)
- `COPY.printShop.*`
- `FrameIllustration` placeholder

**User actions:**
- Tap "Order" on any canvas card → `window.alert(COPY.printShop.comingSoon)` placeholder

**Routes to:** nothing yet (post-MVP: Stripe checkout or external print provider)

**Contract invariants:**
- 9 canvas sizes with exact prices from `memory/project_pricing_strategy.md`:
  - 8×10 $46.99, 8×12 $47.99, 12×12 $50.99, 12×16 $52.99, 16×16 $57.99, 16×20 $62.99, 16×24 $66.99, 20×20 $70.99, 20×24 $72.99
- Replacing the placeholder alert is intentionally a single-file change (stays inline, not in shared)

---

## MyTributesScreen

**File:** `apps/web/src/screens/MyTributesScreen.tsx`

**Hooks:** `useNavigation()`, `useReducedMotion()`

**Props:** none

**Reads:** `COPY.myTributes.*`, `HaloIllustration`

**User actions:**
- Tap primary CTA → `nav.setTab('HOME')`

**Routes to:** HOME (via setTab)

**Contract invariants:**
- Empty-state only (real saved-tribute list comes post-MVP). New design should preserve the illustration-led empty pattern.
- `useReducedMotion` respected for the gentle float animation.

---

## Shared components referenced by screens

These live under `apps/web/src/components/` and are contracted separately as they're ported:

- `BottomTabBar` — 4 tabs (HOME, MY_TRIBUTES, PRINT_SHOP, SETTINGS); hidden on PAYWALL
- `BackButton`
- `UploadZone` — handles drag/drop, previewUrl, onFileSelected callback
- `SubjectSelector` — SAM bbox tap targets
- `LoadingOverlay`
- `SavedModal` — focus trap, two CTAs
- `TemplateGallery` — consumed by Editor
- `ImageViewer`
- `Icon` (icon registry) / `HaloGlyph` / illustrations

When a screen is ported, any component it uses is either reused as-is or re-ported in the same commit — never left as a half-port.

---

## API contracts

These are frozen by the server as of commit `21ca7d1`. Any redesign JSX that calls a different shape violates the contract.

| Call | Method / path | Returns |
|---|---|---|
| Upload | `POST /api/spike/upload` | `{url, mime, sizeBytes}` |
| Segment | `POST /api/spike/segment` | `{imageWidth, imageHeight, subjects[], cutoutUrl?}` |
| Apply preview | `POST /api/spike/apply` `{resolution:'preview'}` | `{imageUrl, prompt, templateIds, intensity, resolution, skipped?}` (429 on rate limit) |
| Apply final | `POST /api/spike/apply` `{resolution:'final', saveId}` | as above + `creditsRemaining` (402 on insufficient) |
| Merge | `POST /api/spike/merge` `{saveId}` | `{imageUrl, prompt, placement, creditsRemaining}` (402 on insufficient) |
| Templates | `GET /api/spike/templates` | `{templates[]}` |
| Status | `GET /api/subscription/status` | `{planId, creditsRemaining, renewsOn}` |
| Purchase | `POST /api/subscription/purchase` `{planId, platform:'web'}` | `{checkoutUrl?}` (501 `web_checkout_not_configured` until Stripe lands) |

---

## Review checklist (per screen port)

- [ ] JSX + CSS only; no changes to hooks, API client, or server
- [ ] Every invariant in this file still holds
- [ ] `npm run typecheck` clean
- [ ] `scripts/smoke-redesign.mjs` green
- [ ] Manual mobile 360 + desktop 1440 eyeball
- [ ] `useReducedMotion` respected for new motion
- [ ] Focus order matches visual order
- [ ] `aria-live` preserved on async regions
- [ ] No inline hex or `rgb(...)` — tokens only
- [ ] No new dependencies unless explicitly approved
