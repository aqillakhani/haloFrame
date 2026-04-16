# EternalFrame — Impeccable Polish Layer Design

**Date:** 2026-04-15
**Status:** Approved
**Approach:** Refined-C — Impeccable enforcement gates layered on existing Golden Hour Gallery plan
**Scope:** Phase 0 (setup) + Phase D (replacement) + Impeccable gates at each phase boundary. Phases A–C hand-written code work unchanged.

---

## 1. Background

The Golden Hour Gallery visual redesign has an approved design doc (`2026-04-15-visual-redesign-design.md`) and a 4-phase implementation plan (`2026-04-15-visual-redesign-plan.md`). Both are committed to `main`.

This document adds an **Impeccable enforcement layer** — design audit commands and anti-pattern detection woven into the existing plan. It does NOT replace the hand-written code work in Phases A–C. It augments each phase with quality gates and replaces Phase D with an Impeccable-driven polish workflow.

### Why Impeccable

Impeccable (`impeccable@2.1.7`, `github.com/pbakaus/impeccable`) is a design skill + CLI for AI coding agents. It provides:
- **Slash commands** (`/audit`, `/critique`, `/polish`, `/typeset`, `/colorize`, `/layout`, etc.) — read the codebase and report or fix design issues against a project-specific context file.
- **CLI detector** (`npx impeccable detect src/`) — catches 24 anti-patterns (AI slop, a11y, general design quality). CI-compatible.
- **Project context** (`.impeccable.md`) — teaches Impeccable the project's specific tokens, fonts, and rules so commands enforce *our* system, not generic defaults.

### Why UI/UX Pro Max

UI/UX Pro Max (`uipro-cli@2.2.3`) is a knowledge skill — searchable databases of 67 styles, 161 palettes, 57 font pairings, 25 chart patterns, 15 stack guidelines. It's already installed at the marketplace path. It does NOT run commands; it's reference material the model consults when making design decisions. Since Golden Hour Gallery is already finalized, Pro Max is optional background reference for any future design iteration.

---

## 2. Architecture

### Files

```
docs/plans/2026-04-15-visual-redesign-design.md      UNCHANGED — source of truth for tokens/motion/screens
docs/plans/2026-04-15-visual-redesign-plan.md         Phase D rewritten + Phase 0 prepended
docs/plans/2026-04-15-impeccable-polish-design.md     THIS DOC — describes the Impeccable layer
docs/plans/2026-04-15-impeccable-polish-plan.md       Implementation plan for Phase 0 + revised Phase D

apps/web/.impeccable.md                               NEW — project context Impeccable reads on every command
~/.claude/skills/impeccable/                          NEW — copied from cloned repo, global install
```

### Relationship to existing plan

The existing plan's **Phases A → C are preserved as-is**. Each phase gains an Impeccable quality gate at the end (before committing). **Phase D is replaced** with an Impeccable-driven polish workflow plus manual checks for things outside Impeccable's domain.

---

## 3. Phase 0 — Setup

### 0.1: Install Impeccable skill (global)

```bash
git clone https://github.com/pbakaus/impeccable.git /tmp/impeccable
cp -r /tmp/impeccable/dist/claude-code/.claude/skills/* ~/.claude/skills/
cp -r /tmp/impeccable/dist/claude-code/.claude/commands/* ~/.claude/commands/
```

Verify: restart Claude Code session, confirm `/audit` appears as a recognized slash command.

### 0.2: Install Impeccable CLI (detector)

```bash
npm install -g impeccable
```

Verify: `npx impeccable detect --help` outputs usage info.

### 0.3: Run `/teach` to create `.impeccable.md`

Feed `/teach` the Golden Hour Gallery context — the *specific* approved tokens from the design doc, not a generic memorial app description:

```
Project: EternalFrame — AI memorial photo tribute app
Platform: React (Vite) web, future React Native (Expo)
Design system: Golden Hour Gallery + Editorial Restraint
  (see docs/plans/2026-04-15-visual-redesign-design.md)
Palette:
  bg.canvas: #FAF4EC (sunset ivory)
  bg.surface: #FFFBF5 (candlelit paper)
  bg.surfaceRaised: #FFFFFF (paper white)
  bg.subtle: #F2EAD9 (linen)
  brand.primary: #B08A4F (burnished bronze)
  brand.primaryDeep: #8E6E3D
  brand.primarySoft: #EDD9B7
  accent.rose: #D4A8A0 (dusty rose)
  accent.roseDeep: #B5847A
  text.ink: #332938 (aubergine graphite)
  text.muted: #7A6F73
  text.faint: #A89FA1 (captions >=17pt only)
  text.onBronze: #FFFBF5
  feedback.error: #B5605A (muted brick, NOT red)
Display font: Cormorant Garamond (>=24pt only, weights 400/500/600)
Body font: DM Sans (weights 400/500/700)
No pure black, no pure gray, no bounce easing, no springs
Tap targets >=44pt, body text >=15px, line length <=75ch
Photos are the hero — UI is quiet
Motion: opacity + translateY <=12px only. No rotation, no skew, no scale on screens.
Reduced motion: translateY->0, durations->120ms, pulses stop.
```

Output: `apps/web/.impeccable.md` — every Impeccable command reads this automatically.

### 0.4: Activate Pro Max (optional, low priority)

Already registered at marketplace path. To activate:

```
/plugin install ui-ux-pro-max-skill
```

Not blocking. Golden Hour Gallery is our design. Pro Max is reference material only.

### 0.5: Baseline audit

```
/audit
npx impeccable detect apps/web/src/
```

Capture the issue count. This is the "before" number. Goal is zero by end of Phase D.

---

## 4. Impeccable Gates at Phase Boundaries

Each phase from the existing plan keeps its hand-written tasks. Before committing the phase, run Impeccable commands as a quality gate. Fix anything flagged, then commit.

| Phase | Existing work (unchanged) | Impeccable gate after | Purpose |
|---|---|---|---|
| **A — Foundation** | tokens.ts, cssVars.ts, styles.css skeleton, fonts, app shell | `/audit` + `npx impeccable detect src/` | Baseline anti-pattern count. Expect MANY issues from old code still present — record the number. |
| **B — Components** | 7 components restyled | `/typeset` + `/colorize` | Catch typography drift (wrong font-size, missing line-height) and color drift (hardcoded hex instead of token var). |
| **C — Screens** | Home, EnhanceFlow, ReuniteFlow, Editor, 3 empty states | `/layout` + `/polish` | `/layout` catches spacing/alignment issues. `/polish` checks design-system alignment, visual consistency, finishing touches. |
| **D — Polish** | *(replaced — see §5)* | `/critique` + `npx impeccable detect src/` | Full UX critique + zero anti-patterns. |

### Gate protocol

- **> 5 issues flagged:** fix all, re-run the command, confirm zero before committing.
- **1–5 issues flagged:** fix, no re-run needed.
- **Conflict with design doc:** design doc wins. Document the override in `.impeccable.md` so it doesn't get flagged again.

---

## 5. Phase D — Impeccable-Driven Polish (Replaces Existing Phase D)

### D1: `/critique` — UX design review

Impeccable's critique covers visual hierarchy, clarity, emotional resonance. Feed it the screen-by-screen context from the design doc (§4) so it evaluates against our spec, not generic UX principles. Address any flagged issues.

### D2: `/audit` — final technical quality check

Covers a11y, performance, responsive. Distinct from `/critique` (which is UX/emotional). Fix everything flagged.

### D3: `npx impeccable detect apps/web/src/` — anti-pattern sweep

Catches 24 AI-slop patterns. **Goal: zero detections.** Fix and re-run until clean.

### D4: Manual — focus rings

Tab through entire app with keyboard. Every interactive element must show 2pt bronze focus ring with 2pt offset on `:focus-visible`. Impeccable cannot test interactive keyboard behavior.

### D5: Manual — reduced-motion enforcement

Chrome DevTools → Rendering → emulate `prefers-reduced-motion: reduce`. Walk both flows. Confirm translateY → 0, pulses stop, durations → 120ms.

### D6: Manual — ARIA live regions

Verify `aria-live="polite"` on loading states, `role="alert"` on errors. Screen-reader test if NVDA available.

### D7: Manual — color contrast

Lighthouse Accessibility audit on Home + Editor. Verify `text.faint` only used at ≥17pt.

### D8: Manual — font loading FOIT/FOUT

Slow 4G throttle, reload, confirm no invisible text > 100ms.

### D9: Final screenshots + comparison

Capture every screen via Chrome DevTools MCP. Side-by-side with Phase 0 baseline. Confirm visual match to design doc.

---

## 6. Success Criteria

All must pass before declaring the redesign complete:

- `npx impeccable detect apps/web/src/` → **zero detections**
- `/critique` and `/audit` → all issues addressed
- All 7 screens redesigned per Golden Hour Gallery design doc §4
- All 7 reusable components restyled per §4.7
- `tokens.ts` is single source of truth, RN-portable
- Both flows complete end-to-end (Enhance + Reunite) with real user flow
- WCAG AA color contrast across all text/background pairs
- Reduced-motion mode honored
- Focus rings on every interactive element
- Bundle size delta ≤ 25kb (framer-motion + lucide combined)

---

## 7. Anti-Patterns (Impeccable Detector + Project-Specific)

### Impeccable's 24-rule detector set (subset relevant to us)

- No purple gradients on white backgrounds
- No bounce easing on animations
- No dark glows or shadows
- No side-tab borders (AI-slop pattern)
- No nested cards inside cards
- No gradient text
- Adequate padding (never cramped)

### Project-specific additions (enforced via `.impeccable.md`)

- No Inter, Roboto, Arial, or system default fonts as primary
- No gray text on colored backgrounds
- No pure black `#000000` — always tint with brand color
- Body text minimum 15px (our token; Impeccable default is 16px — override)
- Touch targets minimum 44x44 points
- Line length maximum 75 characters
- Errors use muted brick `#B5605A`, never harsh red
- No `mix-blend-mode` (RN portability)
- No `backdrop-filter` (RN portability)

---

## 8. What NOT to Change

Carried from existing plan — functional code is off-limits:

```
apps/web/src/lib/navigation.tsx        navigation state machine
apps/web/src/screens/Editor.tsx        cacheRef, inflightRef, applyTemplate render logic
apps/web/src/lib/api.ts                API wiring
apps/web/src/lib/preloadSamples.ts     sample preload
apps/api/**                            backend
packages/shared/**                     types/constants
supabase/**                            schema
```

Also off-limits: subscription/paywall logic, template prompt definitions, navigation flow/routing.

---

## 9. Conflict Resolution

If Impeccable suggests something that contradicts the Golden Hour Gallery design doc:

1. **Design doc wins.** The approved palette, typography, motion catalog, and per-screen specs take precedence.
2. **Document the override** in `.impeccable.md` with a comment explaining why, so the command doesn't flag it again.
3. **Example:** Impeccable's default minimum body text is 16px; ours is 15px (DM Sans `body.md`). Override in `.impeccable.md`: `body text minimum: 15px (DM Sans body.md token, approved in design doc §3.2)`.

---

## 10. Out of Scope

Same as existing plan: dark mode, Settings build-out, PrintShop build-out, MyTributes gallery functionality, auth UI, backend/API changes, RN-specific code, Supabase schema application.
