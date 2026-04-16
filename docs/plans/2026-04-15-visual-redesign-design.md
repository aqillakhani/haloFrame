# EternalFrame — Visual Redesign Design

**Date:** 2026-04-15
**Status:** Approved
**Direction:** Golden Hour Gallery + Editorial Restraint
**Scope:** Visual layer of `apps/web` only. Mobile (Expo) inherits the same token system later.

---

## 1. Background

EternalFrame is an AI memorial photo & tribute app. Two flows ship today end-to-end on fal.ai (Enhance + Reunite). The functional surface is solid; the visual surface is a generic warm theme that doesn't yet feel like the premium, hopeful product the brief calls for.

The product is currently web-only (React 18 + Vite + TypeScript, plain CSS). It is intended to ship as a mobile app (Expo) eventually — web is the test harness. The redesign must therefore produce a **token system that ports cleanly to React Native** (no `mix-blend-mode`, no `backdrop-filter`, generous tap targets, transforms-only animation).

Functional code is **off-limits**: navigation state machine, Editor cache logic (`cacheRef`, `inflightRef`), API wiring, SAM 3 multi-concept logic, template combiner, error tagging, subject anchoring — all preserved verbatim.

---

## 2. Visual Direction

**Golden Hour Gallery** with an **Editorial Restraint** decoration budget.

- **Mood:** golden hour on a mantelpiece, leather-bound photo album, a grandmother's bronze frame.
- **References:** Aperture magazine layouts, Loro Piana / The Row e-commerce, Linear app but warmer.
- **Decoration budget:** photos are the hero. UI is quiet. Thin gold hairlines, generous whitespace, one halo glyph reserved for app header and empty states. No paper texture. No drop caps. No animated halos.

---

## 3. Design System Foundation

### 3.1 Color palette (semantic, RN-portable)

| Role | Hex | Use |
|---|---|---|
| `bg.canvas` | `#FAF4EC` | App background — sunset ivory |
| `bg.surface` | `#FFFBF5` | Cards, sheets — candlelit paper |
| `bg.surfaceRaised` | `#FFFFFF` | Editor canvas, photo frames — paper white |
| `bg.subtle` | `#F2EAD9` | Pressed state, dividers — linen |
| `brand.primary` | `#B08A4F` | Primary button, key actions — burnished bronze |
| `brand.primaryDeep` | `#8E6E3D` | Pressed/hover bronze |
| `brand.primarySoft` | `#EDD9B7` | Bronze tint for badges, focus rings |
| `accent.rose` | `#D4A8A0` | Selection, secondary tags — dusty rose |
| `accent.roseDeep` | `#B5847A` | Active rose state |
| `text.ink` | `#332938` | Primary text — aubergine graphite |
| `text.muted` | `#7A6F73` | Secondary text |
| `text.faint` | `#A89FA1` | Captions, helper text (≥17pt only) |
| `text.onBronze` | `#FFFBF5` | Text on bronze buttons |
| `feedback.success` | `#7A9B7A` | Success — soft sage |
| `feedback.warning` | `#C99450` | Warning — kept warm |
| `feedback.error` | `#B5605A` | Error — muted brick |
| `feedback.errorBg` | `#F7E8E5` | Error surface |
| `hairline` | `rgba(176,138,79,0.18)` | Bronze hairline at 18% |
| `scrim` | `rgba(51,41,56,0.55)` | Modal backdrop — warm not black |

**Principles:** No pure black, no pure gray. Every neutral has warmth. Bronze is the only saturated color the user sees often — reserved for "the next thing to do." Errors stay warm.

### 3.2 Typography

- **Display:** Cormorant Garamond (Google Fonts, weights 400/500/600). Used at 24pt and above only.
- **Body:** DM Sans (kept from current, weights 400/500/700).

| Token | Size | Line | Weight | Tracking |
|---|---|---|---|---|
| `display.xl` | 40 / 32 mobile | 1.05 | Cormorant 500 | -0.5 |
| `display.lg` | 32 / 28 | 1.1 | Cormorant 500 | -0.3 |
| `display.md` | 24 | 1.2 | Cormorant 500 | -0.2 |
| `body.lg` | 17 | 1.5 | DM Sans 400 | 0 |
| `body.md` | 15 | 1.5 | DM Sans 400 | 0 |
| `body.sm` | 13 | 1.45 | DM Sans 500 | 0.1 |
| `label.md` | 14 | 1.2 | DM Sans 500 | 0.3 |
| `label.sm` | 12 | 1.2 | DM Sans 700 | 0.6 |

### 3.3 Spacing & geometry

```
4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 56 / 80     (8pt grid)
screenPadding   20 mobile / 32 tablet
radius          4 / 8 / 12 / 20 / 9999             (xs / sm / md / lg / pill)
borderWidth     1 / 1.5 / 2
tap target      min 44pt
```

Cards: `radius.lg` (20). Buttons: `radius.md` (12). Pills: `radius.pill`. Photo frames: `radius.sm` (8) — keeps photos feeling like prints.

### 3.4 Elevation

```
shadow.soft     0  2  10  rgba(51,41,56,0.06)
shadow.lift     0  6  20  rgba(51,41,56,0.10)
shadow.float    0 16  40  rgba(51,41,56,0.14)
shadow.frame    0  1   2  rgba(176,138,79,0.20)    bronze halo on photos
```

All shadows aubergine-tinted, never gray.

### 3.5 Motion tokens

```
duration.fast       180ms       button press
duration.base       320ms       state changes, modal
duration.slow       560ms       screen transitions, photo reveal
duration.reverent   720ms       hero text fade-in

easing.standard     cubic-bezier(0.32, 0.72, 0, 1)
easing.gentle       cubic-bezier(0.22, 0.61, 0.36, 1)
easing.exit         cubic-bezier(0.4, 0, 1, 1)
```

All movement is opacity + translateY ≤ 12px. No rotation, no skew, no scale on screens. Photo reveals always fade in — never slide or zoom.

---

## 4. Per-Screen Redesign

### 4.1 Global app shell

- App canvas: `bg.canvas`. No background pattern.
- Sticky header on flow screens only (56pt). Left = `BackButton`. Center = current step name in `label.md` muted. Bottom hairline. No header on Home.
- Sticky bottom tab bar: 64pt + safe-area inset, `bg.surface`, top hairline. Active tab = bronze ink + 2pt × 8pt bronze underline. Lucide icons (1.5px stroke), 24pt.
- Page transitions: 320ms cross-fade + 8pt translateY on the entering screen.

### 4.2 Home

Hero spread, two flow cards.

- Eyebrow: "In loving memory." in display.lg Cormorant italic at 70% opacity.
- Headline: "Create a tribute that holds the feeling, not just the photo." in display.xl Cormorant.
- Bronze hairline below headline, 24pt long, left-aligned.
- Two cards stacked vertically (mobile) / side-by-side (tablet ≥768pt). Each card: tall 4:5 photo with 30% bronze gradient overlay, then "Honor a photo" / "Bring them back into the picture" in display.md, body.md muted subtitle, "Begin →" bronze button bottom-right.
- Mount: hero text fades 720ms with 12pt translateY. Cards stagger in 200ms after, 80ms apart.

### 4.3 EnhanceFlow

**Upload state.** Centered display.lg headline ("Choose a photo"), short bronze hairline, body.lg muted subtitle. Upload zone: 320pt min height, 2-dash bronze border, surface bg, ⊕ glyph, "Tap to choose or drag a photo here", "JPG · PNG · HEIC" caption. On drag-over: `brand.primarySoft` fill + solid bronze border. On accept: zone fades to surface, photo appears with bronze frame shadow, "Continue →" appears below.

**Segmenting state.** Photo at 40% opacity, three pulsing bronze-rose dots, Cormorant caption "Looking gently for the people in this photo." After 12s: "Almost there..." fades in.

**Select subject state.** Photo full-width with surface bg + bronze rim. Each subject: bronze ring around bbox at 1.5px 60% opacity, plus a rose pill anchored top-left labeled "Person 1" / "Pet 2" etc. Tap to select → ring becomes solid bronze 2pt; pill fills bronze. Sticky-bottom "Continue →" once one is selected. body.md muted helper line.

**Editor state.** See §4.5.

### 4.4 ReuniteFlow

**Upload (two-photo).** Two stacked upload zones, each labeled in Cormorant display.md ("The photo they belong in." / "The loved one to add."). After both filled: shrink to 80pt thumbnails side-by-side with a soft "+" between them.

**Placement state.** Main photo full-screen with surface bg. Added person drags around at 60% opacity, 100% on release. Bronze snap-guides fade in within 16pt of thirds (160ms). Vertical bronze track on right edge for size; `behind` / `same` / `front` pills above. Sticky-bottom "Looks right →".

**Merging state.** Same contemplative loading as Enhance segmenting. Caption: "Bringing them together..."

**Review state.** Merged photo full-width with bronze rim. Two buttons: ghost "Try again" + bronze "Yes, this looks right →".

**Editor state.** See §4.5.

### 4.5 Editor

- Sticky header: ← BackButton, "Editing tribute" muted center, "Save" right (opens bottom sheet: "Save to phone" bronze + "Order a print" ghost).
- Photo viewer: bronze rim, surface raised bg, pinch-to-zoom (1×–4×), double-tap-to-fit.
- Section title "Choose a feeling" in display.md with short hairline.
- Template tiles: 2-col mobile / 3-col tablet, 16pt gap, radius.md. Photo on top (1:1), name + category eyebrow on bottom inside surface strip. Selected = 2pt bronze ring + bronze checkmark in upper-right of photo. Not-ready = 50% opacity + slow rose-dot pulse top-left.
- "Finalizing your tribute in 2K…" pill at bottom of scroll area (not floating). Bronze fill, white ink, 2s soft pulse.

### 4.6 Empty states (MyTributes / Settings / PrintShop)

Same template:
- Bronze line illustration (96pt, 1.5px stroke, ink at 30%): halo glyph for MyTributes, envelope for Settings, framed picture for PrintShop. Same family across all three.
- Long Cormorant headline.
- Soft body copy.
- One bronze action button.

### 4.7 Reusable component touch-ups

| Component | Change |
|---|---|
| `BackButton` | 44pt circular, surface bg, ink chevron, `shadow.soft`. Press = `bg.subtle` fill. |
| `BottomTabBar` | Lucide icons 24pt at 60% ink. Active = bronze + 2pt × 8pt bronze underline 4pt below icon. label.sm caption. |
| `UploadZone` | Above. |
| `LoadingOverlay` | Three pulsing rose dots (1.4s cycle, staggered) + Cormorant caption. No spinner. |
| `SubjectSelector` | Bronze rings + numbered rose pills. |
| `TemplateGallery` | Tile structure above. |
| `ImageViewer` | Bronze rim, surface bg, no `mix-blend-mode`. |

### 4.8 Iconography

Lucide React (line, 1.5px stroke). Set: `arrow-left`, `home`, `images`, `printer`, `settings`, `upload`, `check`, `x`, `download`, `loader-circle`, `circle`. Inherits `currentColor`. Custom `HaloGlyph` SVG (two concentric bronze arcs) used only in app header and MyTributes empty state.

---

## 5. Motion, Interaction & Accessibility

### 5.1 Animation library

`framer-motion` for web. RN later: `react-native-reanimated` 3 (same mental model, tokens reused).

### 5.2 Motion catalog

| Surface | Trigger | Animation | Duration / easing |
|---|---|---|---|
| Screen transition | Push/pop | Cross-fade + 8pt translateY (entering) | 320ms / standard |
| Tab swap | Tab tap | Cross-fade only | 240ms / standard |
| Hero text mount | Mount | Fade + 12pt translateY | 720ms / gentle |
| Card reveal | Mount, after hero | Stagger fade + 8pt translateY | 400ms each, 80ms stagger |
| Photo reveal | Image loaded | Fade only | 560ms / gentle |
| Button press | pointerdown | Scale 0.97 + bg.subtle overlay | 180ms / exit |
| Card press | pointerdown | shadow.soft → shadow.lift + 1pt translateY | 180ms / standard |
| Selection | Tap | Bronze ring 0%→100%, 1.5pt → 2pt | 200ms / gentle |
| Bottom sheet | Open | Slide from bottom + scrim fade | 320ms / standard |
| Toast / error | Mount | Fade + 16pt translateY from below | 320ms / standard |
| Loading dots | Always | 3 dots opacity 0.3→1→0.3, staggered 200ms | 1.4s / sine |
| Tile shimmer | Pending | Slow rose-dot pulse top-left, opacity 0.4→1 | 2s / sine |
| Finalizing pill | Active | Bronze fill pulse 0.85↔1 | 2s / sine |
| Drag snap-guides | Within 16pt | Fade in/out | 160ms / exit |
| Pinch zoom | Multi-touch | Real-time scale, clamped 1×–4× | n/a |
| Double-tap-to-fit | Tap×2 | Animate to fit | 320ms / standard |
| Disabled state | Always | opacity 0.45 | n/a |

**Reduced-motion mode:** translateY → 0, durations → 120ms. Loading dots → static bronze dot. Pulse animations stop.

### 5.3 Touch & input

- Min tap target 44pt × 44pt everywhere.
- Hit-slop 8pt outside visual on small interactives.
- Drag activation threshold: 6pt minimum.
- Pinch zoom: Editor photo only.
- Double-tap-to-fit: Editor photo only.
- No long-press anywhere (no hidden gestures).

### 5.4 Haptics (mobile, deferred to Expo phase)

| Event | Haptic |
|---|---|
| Button press | Light |
| Selection | Selection |
| Render finished | Notification.Success |
| Error appears | Notification.Warning |
| Drag snap | Selection |

Web has no haptics — pure visual feedback. A no-op shim lives in `lib/haptics.ts` so call sites are already wired.

### 5.5 Focus & accessibility

- Focus ring: 2pt brand.primary, 2pt offset, `:focus-visible` only.
- Tab order = reading order. No `tabindex > 0`.
- Skip-to-content link.
- Loading states: `aria-live="polite"`.
- Errors: `role="alert"` for assertive announcement.
- SubjectSelector buttons: `aria-label="Select person 1"`.
- TemplateGallery: `role="radiogroup"` + `role="radio"` with `aria-checked`.

### 5.6 Color contrast

All text/background combinations pass WCAG AA. `text.faint` (#A89FA1) is reserved for `body.sm` captions ≥17pt only and is annotated in `tokens.ts`.

### 5.7 Photo treatment

- Bronze rim: 1pt brand.primary at 25% + shadow.frame.
- Preview overlay during template apply: `opacity: 0.92` (replaces `mix-blend-mode: screen` for RN portability).
- Aspect ratios preserved everywhere except thumbnails (1:1) and Home cards (4:5 cover).

### 5.8 Explicitly NOT doing

No springs. No parallax. No animated halos around faces. No skeleton screens for photos (photos fade in). No success confetti. No animated background gradients on Home.

---

## 6. Implementation Scope & Sequencing

### 6.1 Touched files

```
apps/web/index.html                              swap font links + favicon/theme-color
apps/web/src/styles.css                          full rewrite
apps/web/src/lib/design-system.ts  →  tokens.ts  replaced (single source of truth)
apps/web/src/lib/motion.ts                       NEW — framer-motion variants
apps/web/src/lib/cssVars.ts                      NEW — generates :root vars from tokens
apps/web/src/lib/haptics.ts                      NEW — no-op shim
apps/web/src/components/icons/                   NEW — HaloGlyph.tsx, Icon.tsx
apps/web/src/components/illustrations/           NEW — 3 SVG empty-state illustrations
apps/web/src/components/BackButton.tsx           visual rebuild
apps/web/src/components/BottomTabBar.tsx         icons + active underline
apps/web/src/components/UploadZone.tsx           visual rebuild
apps/web/src/components/LoadingOverlay.tsx       dots replace spinner
apps/web/src/components/SubjectSelector.tsx      bronze rings + rose pills
apps/web/src/components/TemplateGallery.tsx      tile rebuild
apps/web/src/components/ImageViewer.tsx          bronze rim + remove mix-blend-mode
apps/web/src/screens/HomeScreen.tsx              full reskin
apps/web/src/screens/EnhanceFlow.tsx             reskin per state
apps/web/src/screens/ReuniteFlow.tsx             reskin per state
apps/web/src/screens/Editor.tsx                  reskin (cache logic untouched)
apps/web/src/screens/MyTributesScreen.tsx        empty state
apps/web/src/screens/SettingsScreen.tsx          empty state
apps/web/src/screens/PrintShopScreen.tsx         empty state
apps/web/package.json                            +framer-motion +lucide-react
```

### 6.2 Off-limits

```
apps/web/src/lib/navigation.tsx                  navigation state machine
apps/web/src/screens/Editor.tsx                  cacheRef, inflightRef, render logic
apps/web/src/lib/api.ts                          API wiring
apps/web/src/lib/preloadSamples.ts               sample preload
apps/api/**                                      backend
packages/shared/**                               types/constants
supabase/**                                      schema
```

### 6.3 Phasing (4 commits)

**Phase A — Foundation.** tokens.ts + cssVars.ts + new styles.css skeleton + index.html font swap + framer-motion + lucide-react + Icon wrapper + HaloGlyph + app shell rebuild (header, tab bar, page transition wrapper).

**Phase B — Reusable components.** All seven components restyled.

**Phase C — Screen-by-screen redesign.** Home, Enhance, Reunite, Editor, three empty states.

**Phase D — Polish.** Focus rings, reduced-motion, aria-live, contrast verification, font-loading FOIT/FOUT cleanup, empty-state illustrations finalized.

Each phase is one commit on `main`. Verification gate between phases.

### 6.4 Verification protocol

1. `npm run typecheck` — must pass.
2. `npm run dev` — start both api + web.
3. Real user flow via Chrome DevTools MCP, never scripted API calls:
   - Home → Enhance → upload `family.jpg` → SAM → tap subject 3 → Editor → tap `halo_and_wings` → save 2K.
   - Home → Reunite → upload `portrait.jpg` + `face.jpg` → place → merge → review → Editor → tap `heavens_light` → save.
4. Impatient-user pass: tap during loading, double-tap save, navigate mid-render.
5. Visual smoke screenshots per screen to `.playwright-mcp/redesign-phase-X-*.png` (gitignored).
6. After Phase D: keyboard-only walk-through.
7. Hard-refresh (`Ctrl+Shift+R`) at the start of each phase verification.

### 6.5 Risks & mitigations

| Risk | Mitigation |
|---|---|
| Token rename misses | Grep `var(--` and `palette.` / `colors.` before deleting old tokens; keep aliases for one phase |
| `mix-blend-mode` removal changes preview look | Side-by-side screenshot before/after; fall back to opacity + cream-tinted overlay if visibly worse |
| Cormorant Garamond load time | font-display: swap, preconnect, only weights 400/500/600 |
| Lucide bundle bloat | Tree-shake imports; ~3–4kb final |
| framer-motion bundle bloat | LazyMotion `m` imports; ~12kb |
| Subject rings lose clarity with many subjects | Numeric label inside rose pill — handles 10-person `family.jpg` |
| Bronze ring on photo competing with template borders | Photo rim 1pt 25%, template selection 2pt — different weight |

### 6.6 Out of scope

Dark mode. Settings build-out. PrintShop build-out. MyTributes gallery functionality. Auth UI. Backend / API change. RN-specific code (porting happens when Expo lands).

### 6.7 Tradeoffs accepted

1. framer-motion over pure CSS (12kb for cleaner enter/exit + reduced-motion).
2. lucide-react over hand-rolled SVGs (consistency + RN compat).
3. Single styles.css over CSS Modules (smaller diff, easier RN port).
4. Bronze ring + numbered rose pill on subject selector.
5. Cormorant only at ≥24pt; DM Sans for body.
6. One commit per phase on main.

---

## 7. Success Criteria

- All 7 screens redesigned per §4.
- All 7 reusable components restyled per §4.7.
- Token system in `tokens.ts` is single source of truth; CSS variables generated from it.
- TypeScript clean (`npm run typecheck`).
- Both flows complete end-to-end via real user flow.
- WCAG AA color contrast across all text/background pairs.
- Reduced-motion mode honored.
- Bundle size delta ≤ 25kb (framer-motion + lucide combined).
- Cormorant + DM Sans font loading does not cause >100ms FOIT.
- Stale-bundle warning issued at start of each verification phase.
