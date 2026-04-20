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

**Hooks:** `useNavigation()`, `useReducedMotion()` (on the breathing halo animation)

**Props:** none

**Reads:**
- `fetchTemplates()` → populates `templates` state
- `uploadFile(file)` → returns `{url, mime, sizeBytes}`
- `segmentImage(imageUrl, detectPets=true)` → `SegmentResult` with `imageWidth`, `imageHeight`, `subjects[]`
- `COPY.enhance.*` — new 2026-04-19 keys: `uploadEyebrow`, `segmentingEyebrow`, `selectEyebrow`, `stepLabel(current,total)`, `tryAgainCta`, `errorHint`, italic-split `*.headingBefore`/`headingItalic`/`headingAfter` for each step, `upload.prefaceLabel`, `upload.footText`, `selectSubject.helper`

**State machine (local):**
- `step`: `'upload' | 'segmenting' | 'select_subject' | 'editor'`
- `uploadedUrl`, `segmentation`, `selectedSubjectIndex`, `templates`, `error`

**Renders (per step):**
- **Chrome (always, except editor):** quiet 44×44 back button (sunk fill, rule border, terracotta focus ring) and a mono-caps stepdots pill ("STEP 01 / 03") with gold done-dots + terracotta on-dot. On error, the stepdots label swaps to the `errorHint` ("PLEASE TRY ANOTHER").
- **Upload:** plum eyebrow `PATH ONE · ENHANCE`, italic-accent heading ("Pick a *photograph* of the one you're honoring."), italic subhead, a gold-dot/diamond flourish rule, then a warm upload card — inner dashed frame, a frame-and-halo illustration (no camera/cloud/person), the italic "A single photograph, softly lit." preface, mono "ANY JPEG OR PNG" helper, a terracotta "Choose from Photos" button that wraps a hidden `<input type="file">`, and an italic foot "Take a quiet moment — there's no rush."
- **Segmenting:** plum eyebrow `STEP TWO · LOOKING`, heading "A quiet moment while we *look*.", a dimmed photo frame (gold corner L-marks), a slow-breathing gold halo overlay + pulsing gold ring, caption "Looking at your photo…" with mono "JUST A FEW SECONDS" sub. Back button disabled (in-flight).
- **Select subject:** terracotta eyebrow `STEP THREE · CHOOSE`, heading "Who is *this* for?", subhead "Tap their number.", flourish, the SubjectSelector photo frame with its numbered pill badges, and a Continue CTA that stays disabled until a pill is tapped.
- **Error banner:** rose-tinted inline banner above the upload card when `error` is set — carries either `COPY.enhance.noFaces` or `COPY.enhance.segmentFailed`.
- **Editor step** is rendered bare (no EnhanceFlow chrome) — the Editor screen owns its own header.

**User actions:**
- Upload photo in `upload` step → `handleUpload(file)` → transitions through `segmenting` to either `select_subject` (2+ subjects) or `editor` (1 subject)
- In `select_subject` step: pick a subject via `SubjectSelector`, then Continue → `editor`
- Back button semantics: pop nav from upload, else retreat one step; **disabled during `segmenting`** because the in-flight segment has no clean cancel path
- No subjects detected → error copy, reset to upload
- Reduced-motion users get a static halo (opacity 0.7, no breathe animation)

**Routes to:** PAYWALL (via Editor), PRINT_SHOP (via Editor), previous screen (via pop)

**Contract invariants:**
- Pet detection must still run on segment (`detectPets: true`)
- Subject-selector step only shown for 2+ detected subjects; single-subject photos skip straight to Editor
- Editor mounted with `isPet`, `baseImageUrl`, `subjects`, `selectedSubjectIndex`, `imageWidth`, `imageHeight`, `templates`, `onOrderCanvas`, `onPaywall`, `onBack`
- AbortController cancels template fetch + preloads on unmount
- Back button is disabled (not hidden) during `segmenting` so the tap target stays present but inert
- `SubjectSelector` keeps its force-relaxation logic (resolveBadgeOverlap) — only the pill visual changed (gold-bordered cream circle with dashed spinning ring; terracotta fill when selected)
- Error state renders inline above the upload card, not as a separate screen, so the user can retry in place

---

## ReuniteFlow

**File:** `apps/web/src/screens/ReuniteFlow.tsx`

**Hooks:** `useNavigation()`, `useReducedMotion()` (merging halo + motes guard)

**Props:** none

**Reads:**
- `fetchTemplates()`, `uploadFile()`, `segmentImage()`, `mergePhotos()`
- `COPY.reunite.*`, `PLACEMENT_SUBJECT_DESCRIPTION` (in-file, anchors NB2)

**State machine (local):**
- `step`: `'upload' | 'placement' | 'merging' | 'review' | 'editor'`
- `mainUrl`, `mainMeta`, `lovedUrl`, `lovedMeta`, `lovedCutoutUrl`, `lovedIsPet`, `placement` (default `'left'`), `mergedUrl`, `sizeAdjustment` (default 1.0), `savedModalOpen`, `templates`, `error`
- `mainMeta`/`lovedMeta` = `{name, sizeKb}` — file metadata for the filled-state preview chip (filename + KB · READY line)

**User actions:**
- Upload main + loved photos in `upload` → Continue to `placement`
- In `placement`: pick placement (`left|right|behind|front`), adjust size slider, Bring Together → `merging` → `mergePhotos` → `review`
- In `review`: Add Styles → `editor`, OR Save Photo → `triggerDownload` + open `SavedModal`, OR "Try a different arrangement" link → back to `placement` (clears `mergedUrl`)
- In SavedModal: Order Canvas → PRINT_SHOP, Start Another → reset + nav.reset(), Close (X or Esc or backdrop) → back to review with focus restored

**Routes to:** PRINT_SHOP, PAYWALL (via Editor), previous screen

**Contract invariants:**
- Merge call always includes `lovedOneCutoutUrl` when cutout succeeded (server pre-composites for reliable sizing)
- Placement default is `'left'` (memory: user test showed starting at null forced an extra tap)
- `PLACEMENT_SUBJECT_DESCRIPTION` is threaded into Editor as `subjectName` so NB2 anchors to the just-added person
- Size slider range: 0.7–1.4 (server accepts 0.5–2.0 but narrower range preserved for UI predictability)
- Merging step has no back button (in-flight, no cancel path)
- `SavedModal` focus trap + Esc close + backdrop click preserved; primary CTA gets initial focus
- Error shown as inline banner above pane, never as a separate screen — retry stays in context
- Reduced-motion users get static halo + halo-ring with zero motes (dust specks hidden), rotating caption stops cycling

**Visual port (2026-04-19 redesign):**
- 4-step stepdots ("STEP 01/04" … "STEP 04/04"), plum eyebrow on steps 1/3, terracotta eyebrow on 2/4
- Italic-split display headings with gold hand-drawn underline under accent word (`back` / `go` / `bringing` / `this`)
- Upload dual-card grid (mono kicker + serif h2 + sunk uploader → filled-state preview row with thumb + filename + KB·READY + Change btn)
- Placement photo-frame with gold L-corners + `.photo-inner[data-placement]` + `.cutout` overlay (absolutely positioned, left/right/behind/front variants) + `--scale` var driven by slider
- Placement segmented control: 4-up Left/Right/Behind/Front, gold-border cream active state with terracotta text
- Merging: breathing radial halo + pulsing halo-ring + 8 drifting gold dust motes + two arc sweeps + rotating italic caption (4s interval, 6 lines)
- Review: photo-frame with `reunite-arrival-glow` keyframe on mount + stacked primary/ghost CTAs + italic dotted-underline "Try a different arrangement"
- SavedModal: dark scrim, cream card with gold ornament (two hairlines + concentric circle) + h2 with trailing period + italic sub + primary/ghost stack + close X top-right + tab-trap focus management

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
- Stage reveal keeps the `stageRef + classList remove → forced reflow → classList add` pattern — DO NOT refactor to `useLayoutEffect` or `framer-motion`: the forced `offsetHeight` read is what makes the CSS animation restart on every styled URL change

**Visual port (2026-04-19 redesign):**
- `data-state` on `.editor` root drives all five states (`idle | loading-preview | preview-ready | saving | error`) — CSS reads it for halo visibility + photo dim + caption display + ready-rule opacity + finalizing-pill render
- Header: sunk-back button + serif "Editing tribute" + gold-tinted mono-caps credit badge (`N tributes` from `tributesShort()`)
- Stage: `.editor-frame` with gradient paper background + gold L-corners as siblings + `.image-viewport` (pinch/pan) with inner vignette + fine grain overlay. Stage reveal glow toggled via `.editor-stage--revealing` class driven by stageRef + forced reflow
- Breathing gold `.editor-halo` visible only during `loading-preview` + `saving`; static opacity for reduced-motion users
- Rotating italic stage caption (4s cycle) below the frame — `loadingCaptions` ladder during preview render, `savingCaptions` during save. Reduced-motion users see first line only.
- Italic serif viewer hint below caption ("Pinch to zoom · drag to pan · double-click to reset")
- Original/Styled chip toggle in a sunk-surface pill; both disabled until a styled preview exists
- Inline rose-tinted error banner INSIDE the stage section (italic serif, rose-dot prefix) — never a full-screen takeover
- Gallery section: italic-underlined "Pick a **style**" heading + gold hairline + mono-caps helper, rose-tinted preload banner while 1K previews batch-prepare
- Tile grid: 2-col mobile / 3-col desktop (≥768px). Selected tile: terracotta 2px border + terracotta-cream check chip in top-right. Pending tile: rose shimmer overlay (1.8s cycle) + rose dot + muted caption name; `aria-busy="true"`. Reduced-motion users lose the shimmer animation only.
- Fixed bottom action bar with a page-gradient fade: ghost "Order Canvas" + terracotta primary "Save to Photos" (swaps to "Making it perfect…" while saving). Gold ready-rule fades in above the bar once `hasStyled`. Italic finalizing pill floats above the bar during save.

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

**Hooks:** `useNavigation()` (only for the coming-soon modal's "Keep my tribute" → `nav.pop()`)

**Props:** none

**Reads:**
- `CANVAS_OPTIONS` (9 sizes, inline — single-file change when provider lands; each entry carries `group: 'small' | 'medium' | 'large'` and optional `mostLoved`)
- `COPY.printShop.*` (heading, filters, groupLabels, sizeDescriptions keyed by canvas id, mostLovedTag, contactPill, modal*)

**User actions:**
- Tap a filter chip ("All Sizes" / Small / Medium / Large) → sets local filter state
- Tap "Order" on any canvas card → opens local `ComingSoonModal` (focus-trapped, Escape + Tab-wrap)
- Tap "I'll wait — notify me" → closes modal, stays on PrintShop
- Tap "Keep my tribute" → `nav.pop()` (returns to Editor review or wherever the user came from)

**Routes to:** `pop()` only (no forward nav yet; post-MVP: Stripe checkout or external print provider)

**Contract invariants:**
- 9 canvas sizes with exact prices from `memory/project_pricing_strategy.md`:
  - 8×10 $46.99, 8×12 $47.99, 12×12 $50.99, 12×16 $52.99, 16×16 $57.99, 16×20 $62.99, 16×24 $66.99, 20×20 $70.99, 20×24 $72.99
- `canvas_12x16` carries `mostLoved: true` (reflected as gold chip in card corner)
- Replacing the placeholder modal with real checkout is intentionally a single-file change (stays inline, not in shared)

**Visual port checklist (screen 7, commit 9dd2b68):**
- Hero "viewing room" vignette: plaster noise background + brass rail + sconce glow + canvas mount with gold L-corners + silhouette + halo glyph
- Heading block: decorative numeral `07/09` next to section head, arc SVG underline on size heading
- Filter chips use `data-state="active"` for gold fill
- Size grid is 1/2/3-col responsive; card swatches scale via `swatchDimensions()` (width=140 / height capped at 170 from portrait aspect ratio)
- Card swatch art: nail + hanging thread + portrait swatch tinted per size group; "Most loved" gold chip lives inside the card corner for 12×16 only
- Coming-soon modal shares SavedModal's ornament language (two hairlines + dot + concentric ring), but is a **local** component to avoid premature extraction
- Focus trap: Escape closes, Tab wraps head↔tail focusable, initial focus on close button
- Contact pill lives below the grid, visually off-grid so it doesn't compete with cards

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
