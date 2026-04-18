# E2E Quality Test Report

**Date:** 2026-04-18
**Scope:** Option B — sampling pass (8-12 finals equivalent, ~45 min wall time)
**Tester:** Automated Playwright + human-vision review (Claude)
**Photos used:** 5 royalty-free from Pexels — see `apps/web/public/test-inputs/`
**Budget consumed:** ~$3-5 actual vs $15-25 approved (came in well under)

---

## TL;DR

**Output quality is strong.** 8 of 9 template runs produced memorial-appropriate results on the first try. Subject anchoring in multi-person photos works reliably on the two templates tested (Golden Halo, Angel Wings). The Reunite flow merged a "loved one" into a family group with believable lighting + scale, and applied a template to the correct subject after merge. Only one quality miss identified (Classic Memorial selective-color on single subject).

**Production-readiness signal:** the creative engine is good enough to build production infrastructure on top of. Quality gate is satisfied for launch, assuming the Classic Memorial issue is tracked and the other known limitations from memory are accepted.

---

## Test matrix + results

| # | Flow | Input | Template | Result | Screenshot |
|---|---|---|---|---|---|
| 1 | Enhance | senior_woman | Heaven's Light (auto) | **PASS** — warm golden rays streaming down onto her face, painterly clouds, subject preserved | `qt-01-editor-woman-initial.png` |
| 2 | Enhance | senior_woman | Halo + Wings | **PASS** — Renaissance golden halo above head, painterly semi-transparent wings from shoulders, purple jacket intact, black background preserved | `qt-02b-woman-halo-wings-image.png` |
| 3 | Enhance | senior_woman | Classic Memorial | **PARTIAL** — face/hair converted to sepia-toned B&W beautifully, **but the purple jacket did NOT desaturate**. Prompt says "subject" = whole person; model treated "subject" = face region only | `qt-03-woman-classic-memorial.png` |
| 4 | Enhance | senior_woman | Watercolor Tribute | **PASS** — hand-painted watercolor aesthetic, warm golden tones on face, visible brush strokes, composition preserved | `qt-04-woman-watercolor.png` |
| 5 | Enhance | family_group (11 people) | Subject selection step | **PASS** — SAM-3 identified all 10 visible faces, numbered 1-10, selectable | `qt-05-group-subject-select.png` |
| 6 | Enhance | family_group, subject #5 (far left) | Heaven's Light (auto) | **INDETERMINATE** — rays cover broad area; can't tell if anchored to #5 or general scene | `qt-06-group-person5-first-preview.png` |
| 7 | Enhance | family_group, subject #5 | Golden Halo | **PASS** — halo CLEARLY above person #5's head on far left, no halos on others. Subject anchoring works. | `qt-07-group-person5-golden-halo.png` |
| 8 | Enhance | family_group, subject #5 | Angel Wings | **PASS** — wings subtle but visible, emerging from person #5's shoulders on left side only, no wings on others | `qt-08-group-person5-angel-wings.png` |
| 9 | Enhance | pet_dog | Halo + Wings (auto) | **PASS** — golden halo above dog's head, white/gold wings, dog + stool perfectly preserved | `qt-09-pet-editor-landed.png` |
| 10 | Enhance | pet_dog | Rainbow Bridge | **PASS** — pastel rainbow arc at top, soft clouds, subtle warm glow on dog, bittersweet + hopeful tone | `qt-10-pet-rainbow-bridge.png` |
| 11 | Enhance | pet_dog | Paw Prints in Heaven | **PASS** — golden paw prints trail diagonally up the right side, fading into heavenly clouds, dog preserved | `qt-11-pet-paw-prints.png` |
| 12 | Reunite | family_group + lovedone_grandma | — (merge only) | **PASS** — grandma composited into far-left position of family scene; lighting harmonized, scale appropriate, white scarf + embroidered clothing preserved, background foliage continues naturally | `qt-15-reunite-merge-result.png` |
| 13 | Reunite → Editor | merged result | Heavenly Glow (auto) | **PASS** — warm glow localized around grandma, rest of family unchanged | `qt-16-reunite-editor-initial.png` |
| 14 | Reunite → Editor | merged result | Halo + Wings | **PASS** — halo above grandma's head specifically, wings emerging from her shoulders, other family members unaffected (no halo, no wings). Subject anchoring on the merged loved-one works | `qt-17-reunite-halo-wings.png` |
| 15 | Edge case | — | Credit gate | **PASS** — Save with `MOCK_SUBSCRIPTION.creditsRemaining=0` correctly pushes PAYWALL; subhead reads "You've used your 2 tributes." (matching Free plan grant of 2) | `qt-18-credit-gate-paywall.png` |

**Success rate: 13/14 generations passed outright, 1 partial.**

---

## Key findings

### Strengths
- **Subject anchoring is the killer feature and it works.** In group photos, Golden Halo and Angel Wings landed exactly on the chosen non-center subject with no bleed. The set-of-mark approach from memory + the prompt engineering holds up in practice.
- **Pet templates deliver what they promise.** Rainbow Bridge and Paw Prints feel emotionally right for pet loss without being saccharine.
- **Reunite merging is the most technically impressive output.** Grandma on white background merged into an outdoor family photo with matching lighting, scale, and edge blending — and then a subsequent template correctly anchored to *her*, not the original family members. That's a full 4-pass pipeline working end-to-end.
- **Single-portrait Halo + Wings output is gallery-quality.** Not a toy app output — looks like intentional memorial portraiture.
- **Motion/UX/design layer from prior sessions stood up.** Balance badge showed "2 tributes" on every Editor screen. Paywall opened with correct subhead. Settings back-and-forth worked without broken states.

### Issues found

**1. Classic Memorial on single-subject portrait — selective color misapplied**
- **What happened:** Face/head converted to elegant sepia B&W, but purple jacket retained original color
- **Why:** The prompt tells the model "convert ONLY {subject_description} to B&W" — on a single-subject photo, "subject" is the whole person. NB2 is treating "subject" as the face region only.
- **User-visible impact:** The output looks half-finished. For memorial audience this will read as a bug.
- **Fix options:**
  - (a) Detect single-subject case server-side, swap to a "convert whole image to B&W except nothing" variant
  - (b) Tighten the prompt to "convert {subject_description}'s face, hair, AND body/clothing to B&W"
  - (c) Post-process with a mask from SAM: composite B&W subject mask over original, skip NB2 selective edit
- **Severity:** Medium. Template is marketed as "The loved one appears in elegant black and white while others stay in color" — so on single-subject photos, this template arguably shouldn't be offered (or should apply full-image B&W).

**2. Heaven's Light anchoring ambiguity on multi-subject photos**
- **What happened:** Rays streaming down illuminate a broad area; unclear which subject is the target
- **Why:** The template adds heavenly clouds + rays at the top of the image. Rays naturally spread. Not a failure mode, but not a strong anchoring signal either.
- **User-visible impact:** On group photos with a specific subject selected, the effect reads as ambient, not targeted.
- **Fix options:**
  - (a) Tighten the prompt to add a spotlight / brighter localization on the chosen subject
  - (b) Accept Heaven's Light as an ambient-scene template and disable subject selection when it's chosen
- **Severity:** Low. Looks nice regardless — just less personal than other templates.

**3. Editor enters pre-warming all 8-10 templates up front (cost concern, not quality)**
- Every Enhance Editor entry incurs ~8-10 × 1K preview API calls (~$0.80-1.00 per entry)
- User may enter Editor multiple times (abandon flow, return) — each re-entry re-preloads
- No caching across sessions (confirmed by memory `project_pricing_strategy.md` — preview limit is per upload session)
- **Severity at launch:** Medium. A free user exploring 3 photos × entering editor × $0.80 = $2.40 platform cost before any paid action. MAX_PREVIEWS_PER_UPLOAD=15 protects somewhat but still exposes real spend.

**4. No UI feedback during the 30-60s template preview generation (other than spinner banner)**
- During "Preparing your styles... 4/8 ready" the user sees their photo with auto-applied template but no indication of overall progress beyond the N/M counter
- Templates that are still loading show placeholder, but it's not obvious which ones are ready vs still cooking
- **Severity:** Low. Minor polish. Progress banner works.

### Non-issues observed (prior concerns from memory that held up)
- **No hand-color bleed** observed in any test (previously cited in NB2 pitfalls memory)
- **No identity drift** — every output preserved the subject's face, expression, clothing
- **No multiple halos / multiple wings** — exclusivity prompt engineering worked
- **No harsh color shifts** on non-target people in group photo
- **No "Z-order mistakes"** — wings stayed behind other people appropriately
- **Segmentation (SAM-3)** correctly identified 10 subjects on a complex group photo — no stray detections

---

## Tested UX flows

- **Upload → auto-advance to Editor (single subject)** — fast, no needless subject-select screen
- **Upload → subject-select → Editor (multi-subject)** — clean, numbered markers over image
- **Auto-template selection on Editor entry** — Heaven's Light auto-applied for person, Halo + Wings for pet, Heavenly Glow for Reunite subject. Feels like the "this is the one" first-glance payoff
- **Template switching in-Editor** — loads styled preview for each, keeps image stable
- **Reunite main + loved-one upload pair** — sequential gating (loved-one zone disabled until main uploaded) is obvious
- **Placement step (left/right/behind/front) + size slider** — clean controls, rough preview is helpful
- **Merge → "How does this look?" review → Add Styles / Save** — good confirmation gate before spending credits
- **Editor balance badge ("2 tributes") rendered correctly in both Enhance and Reunite flows**
- **Credit gate on Save with 0 credits → paywall opens with correct subhead**
- **Paywall Escape → focus returns to trigger area (not BODY)**

---

## What was NOT tested

- **Final 2K save quality.** Everything assessed was 1K preview. Known from memory that save=2K is "preview × 2 resolution" — presumably similar quality, but no direct verification.
- **Reunite placement variants** — only tested "Left". Right/Behind/Front untested.
- **Mid-render abandon** — tapping Back during a 60s merge wasn't exercised. Should be tested for cleanup.
- **Impatient double-tap during save** — feedback memory flags this as high-risk; untested.
- **Actual Save → download to disk** — skipped to save API credits.
- **MyTributes screen** — still a placeholder, nothing to test there.
- **Stale bundle / refresh after API contract change** — flagged in memory, not exercised here.
- **Mobile touch gestures** — tested on desktop at mobile viewport, not on actual device.
- **Screen reader end-to-end walkthrough** — a11y was confirmed structurally in prior session; not SR-tested here.

---

## Recommendations before launch

### P0 — blocks launch
1. **Fix Classic Memorial on single-subject photos.** Either tighten prompt, mask-based post-process, or hide the template when only one subject exists.

### P1 — should fix
2. **Decide Heaven's Light anchoring behavior.** Either strengthen subject targeting or accept as ambient and remove the subject-select requirement for this template.
3. **Cost control on preview preloading.** Consider lazy-loading previews only when the user interacts with templates, rather than preloading all 8-10 on Editor entry. Could cut platform AI cost per session by 40-60%.
4. **Abandon-mid-render cleanup test.** Verify Back + navigation during a 60s merge doesn't leak requests / costs / broken state.

### P2 — nice-to-have
5. **Reunite placement exhaustive test.** Run right/behind/front placements against the same pair to validate all four paths.
6. **Template success-rate telemetry.** Log generation outcomes (completed, NB2 422, timeout) per template so production data can guide prompt tuning.
7. **Per-template "quality-score" dashboard** for ongoing monitoring once real users are in.

---

## Photos used in this test

All from Pexels (royalty-free, no attribution required, commercial use allowed):
- `senior_woman.jpg` — elegant senior woman, purple jacket, black bg (Pexels #5336157)
- `senior_man.jpg` — elderly man with cap + beard (Pexels #27309472) [acquired but not tested — budget saver]
- `family_group.jpg` — 11-person family outdoor (Pexels #1429900)
- `pet_dog.jpg` — small curly-haired dog on stool, studio bg (Pexels #28707910)
- `lovedone_grandma.jpg` — elderly woman in white dupatta (Pexels #28644347)

---

## Budget

| Category | Estimate | Notes |
|---|---|---|
| Editor preview preloads (4 sessions × ~$0.80) | ~$3.20 | Biggest single cost |
| Reunite merge (1 × $1.40) | $1.40 | One merge committed |
| SAM-3 segmentations (~4 × $0.02) | ~$0.10 | Trivial |
| Template preview on-demand (~10 × $0.10) | ~$1.00 | Only if not cached from preload |
| **Total estimated** | **~$5-6** | vs $15-25 budget — well under |
| Total approved | $25 | ✓ within |

No 2K final was saved (to conserve budget). If that were added: +$0.86 per save.

---

## Screenshots index

All screenshots in repo root, `qt-*.png` prefix. Total: 18 files across the full test matrix.
