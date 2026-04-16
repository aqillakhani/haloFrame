# EternalFrame — Impeccable Polish Layer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Install Impeccable, teach it the Golden Hour Gallery design system, and weave its audit/polish commands into the existing visual redesign plan as quality gates at each phase boundary + a full Phase D replacement.

**Architecture:** This plan is a supplement to `docs/plans/2026-04-15-visual-redesign-plan.md`. That plan's Phases A–C are unchanged. This plan adds Phase 0 (setup) before them, inserts Impeccable gate tasks after each phase's smoke test, and replaces Phase D entirely. The executor should have both plans open.

**Tech Stack:** Impeccable skill (slash commands) + Impeccable CLI (`npx impeccable detect`), existing React 18 + Vite + TypeScript codebase.

**Design Reference:** `docs/plans/2026-04-15-impeccable-polish-design.md` — read this first; this plan implements that design.

---

## Phase 0 — Setup (do once before Phase A)

### Task 0.1: Clone Impeccable repo

> **COMPLETED 2026-04-15.** Actual paths differed from README — corrected below.

**Step 1: Clone.**

Run:
```bash
git clone https://github.com/pbakaus/impeccable.git /tmp/impeccable
```

**Step 2: Verify structure.**

The skill files are at the repo root (NOT `dist/claude-code/`):
```bash
ls /tmp/impeccable/.claude/skills/    # 18 skill directories
ls /tmp/impeccable/.claude/agents/    # 1 agent file (anti-patterns.md)
```

---

### Task 0.2: Install Impeccable skill files globally

> **COMPLETED 2026-04-15.** 18 skills + 1 agent installed. CLI v2.1.7 installed globally.

**Step 1: Copy skill files.**

Run:
```bash
cp -r /tmp/impeccable/.claude/skills/* ~/.claude/skills/
```

**Step 2: Copy agent files.**

Run:
```bash
mkdir -p ~/.claude/agents
cp /tmp/impeccable/.claude/agents/* ~/.claude/agents/
```

**Step 3: Verify files landed.**

Run:
```bash
ls ~/.claude/skills/ | grep -E "audit|critique|polish|typeset|colorize|layout"
```

Expected: all six directories listed.

**Step 4: Restart Claude Code session.**

The user must exit and re-enter Claude Code for the new skills to load. After restart, confirm `audit`, `critique`, `polish`, `typeset`, `colorize`, `layout` appear in the available skills list.

---

### Task 0.3: Install Impeccable CLI

**Step 1: Install globally.**

Run:
```bash
npm install -g impeccable
```

**Step 2: Verify.**

Run:
```bash
npx impeccable detect --help
```

Expected: usage info printed, no errors.

If `npx impeccable detect --help` fails, try:
```bash
npx impeccable --help
```

The CLI binary is `impeccable` per package.json `bin` field.

---

### Task 0.4: Run `/teach` to create project context

**Step 1: Invoke `/teach`.**

Run the `/teach` slash command in Claude Code. When prompted for project context, provide:

```
Project: EternalFrame — AI memorial photo tribute app
Platform: React (Vite) web, future React Native (Expo)
Design system: Golden Hour Gallery + Editorial Restraint
  (full spec at docs/plans/2026-04-15-visual-redesign-design.md)

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
  text.faint: #A89FA1 (captions >=17pt only, sub-AA)
  text.onBronze: #FFFBF5
  feedback.error: #B5605A (muted brick, NOT red)

Display font: Cormorant Garamond (>=24pt only, weights 400/500/600)
Body font: DM Sans (weights 400/500/700)

Rules:
  - No pure black (#000000), no pure gray — every neutral has warmth
  - No bounce easing, no springs
  - Tap targets >=44pt
  - Body text >=15px (override Impeccable's default 16px)
  - Line length <=75 characters
  - Photos are the hero — UI is quiet
  - Motion: opacity + translateY <=12px only. No rotation, skew, scale on screens.
  - Reduced motion: translateY->0, durations->120ms, pulses stop
  - No mix-blend-mode (RN portability)
  - No backdrop-filter (RN portability)
  - Errors use muted brick #B5605A, never harsh red
```

**Step 2: Verify `.impeccable.md` was created.**

Run:
```bash
cat apps/web/.impeccable.md
```

Expected: file exists with the project context. If `/teach` saved it elsewhere (e.g., `.impeccable.md` in repo root or `~/.impeccable.md`), note the location — all subsequent Impeccable commands read from this file.

If `/teach` is not available as a slash command after restart, manually create the file:

```bash
cat > apps/web/.impeccable.md << 'CONTEXT'
# EternalFrame Design Context

## Project
Memorial photo tribute app. React (Vite) web, future React Native (Expo).

## Design System: Golden Hour Gallery + Editorial Restraint
Full spec: docs/plans/2026-04-15-visual-redesign-design.md

## Palette
- bg.canvas: #FAF4EC
- bg.surface: #FFFBF5
- bg.surfaceRaised: #FFFFFF
- bg.subtle: #F2EAD9
- brand.primary: #B08A4F
- brand.primaryDeep: #8E6E3D
- brand.primarySoft: #EDD9B7
- accent.rose: #D4A8A0
- accent.roseDeep: #B5847A
- text.ink: #332938
- text.muted: #7A6F73
- text.faint: #A89FA1 (captions >=17pt only)
- text.onBronze: #FFFBF5
- feedback.error: #B5605A

## Typography
- Display: Cormorant Garamond (>=24pt, 400/500/600)
- Body: DM Sans (400/500/700)

## Rules
- No pure black or pure gray
- No bounce easing or springs
- Tap targets >=44pt
- Body text >=15px
- Line length <=75ch
- No mix-blend-mode or backdrop-filter
- Errors: muted brick, never red
CONTEXT
```

---

### Task 0.5: Activate Pro Max (optional)

**Step 1: Check if Pro Max skill is loaded.**

Look in Claude Code's available skills list for any skill mentioning "ui-ux-pro-max."

If already present: skip. If not:

Run:
```bash
# Pro Max is already at ~/.claude/plugins/marketplaces/ui-ux-pro-max-skill/
# Check if the plugin system recognizes it
cat ~/.claude/plugins/installed_plugins.json | grep -A5 "ui-ux-pro-max" || echo "NOT IN INSTALLED PLUGINS"
```

If not installed, try: `/plugin install ui-ux-pro-max-skill`

**This is non-blocking.** If it doesn't activate easily, skip. Golden Hour Gallery is the design; Pro Max is optional reference.

---

### Task 0.6: Baseline audit

**Step 1: Run `/audit`.**

Invoke the `/audit` slash command. Review the output. Don't fix anything yet — this is the baseline.

**Step 2: Run the CLI detector.**

Run:
```bash
cd C:/Users/claws/OneDrive/Desktop/haloFrame
npx impeccable detect apps/web/src/
```

**Step 3: Record the baseline.**

Note the total issue count from both `/audit` and `detect`. Save to a comment at the top of `apps/web/.impeccable.md`:

```
<!-- Baseline: /audit reported N issues, detect reported M anti-patterns. Date: 2026-04-15 -->
```

**Step 4: Commit setup files.**

```bash
cd C:/Users/claws/OneDrive/Desktop/haloFrame
git add apps/web/.impeccable.md
git commit -m "chore: add Impeccable project context for design enforcement"
```

---

## Phase Gates — Insert After Existing Phase Smoke Tests

These tasks are inserted into the existing plan (`2026-04-15-visual-redesign-plan.md`) at specific points. The executor should run them AFTER the phase smoke test and BEFORE committing the phase.

---

### Gate A: After Task A11 (Phase A smoke test)

**Insert after:** "→ Use @superpowers:verification-before-completion before declaring Phase A complete."

**Step 1: Run `/audit`.**

Review output. At this point, many issues are expected — old screen code hasn't been restyled yet. The goal is to confirm the count is LOWER than the Phase 0 baseline (new tokens + styles.css skeleton should eliminate some issues).

**Step 2: Run the detector.**

Run:
```bash
npx impeccable detect apps/web/src/
```

**Step 3: Record the count.**

Update the comment in `.impeccable.md`:
```
<!-- Phase A: /audit N issues (baseline was X), detect M anti-patterns (baseline was Y) -->
```

**Step 4: Fix only issues in NEW files.**

If `/audit` or `detect` flags issues in files you created or modified in Phase A (tokens.ts, cssVars.ts, styles.css, motion.ts, haptics.ts, Icon.tsx, HaloGlyph.tsx, App.tsx), fix them. Don't fix issues in files you haven't touched yet — those get fixed in Phase B/C.

**Step 5: Commit fixes (if any).**

```bash
git add apps/web/src/lib/ apps/web/src/components/icons/ apps/web/src/styles.css apps/web/.impeccable.md
git commit -m "fix(web): address Impeccable audit findings in Phase A files"
```

If no fixes needed, skip this commit.

---

### Gate B: After Task B8 (Phase B smoke test)

**Insert after:** Task B8 ("Walk both flows end-to-end. Take screenshots.")

**Step 1: Run `/typeset`.**

Review output. This checks typography across all restyled components — font sizes, line heights, font weights, heading hierarchy. Fix any issues flagged. Specifically watch for:
- Hardcoded font-sizes instead of token vars
- Missing line-height declarations
- Wrong font-family (should be DM Sans for body, Cormorant for display ≥24pt)

**Step 2: Run `/colorize`.**

Review output. This checks color palette application — hardcoded hex values instead of CSS vars, contrast issues, palette coherence. Fix any issues.

**Step 3: Run the detector.**

Run:
```bash
npx impeccable detect apps/web/src/
```

Count should be significantly lower than Phase A. All component files should be clean.

**Step 4: Fix all flagged issues in component files.**

Files in scope: `BackButton.tsx`, `BottomTabBar.tsx`, `UploadZone.tsx`, `LoadingOverlay.tsx`, `SubjectSelector.tsx`, `TemplateGallery.tsx`, `ImageViewer.tsx`, `styles.css`.

**Gate protocol:**
- **> 5 issues:** fix all, re-run `/typeset` + `/colorize`, confirm zero in component files.
- **1–5 issues:** fix, no re-run needed.
- **Design doc conflict:** design doc wins. Add override note to `.impeccable.md`.

**Step 5: Commit fixes (if any).**

```bash
git add apps/web/src/components/ apps/web/src/styles.css apps/web/.impeccable.md
git commit -m "fix(web): address Impeccable typeset + colorize findings in Phase B"
```

---

### Gate C: After Task C14 (Phase C smoke test)

**Insert after:** Task C14 (end-to-end smoke + impatient-user pass + screenshots).

**Step 1: Run `/layout`.**

Review output. This checks spacing, alignment, padding, visual hierarchy across all screens. Fix issues — specifically:
- Inconsistent padding between screens
- Cramped layouts (Impeccable enforces adequate padding)
- Alignment issues between elements

**Step 2: Run `/polish`.**

Review output. This is the "make it beautiful" pass — checks design-system alignment, visual consistency, finishing touches across the entire app. Fix issues.

**Step 3: Run the detector.**

Run:
```bash
npx impeccable detect apps/web/src/
```

**Target: ≤ 3 anti-patterns remaining.** Any remaining should be in files outside Phase C scope or documented overrides.

**Step 4: Fix all flagged issues.**

All screen files + styles.css are in scope.

**Gate protocol:** same as Gate B (> 5 = fix + re-run, 1–5 = fix only, conflict = design doc wins).

**Step 5: Commit fixes.**

```bash
git add apps/web/src/screens/ apps/web/src/styles.css apps/web/.impeccable.md
git commit -m "fix(web): address Impeccable layout + polish findings in Phase C"
```

---

## Phase D — Impeccable-Driven Polish (Replaces Existing Phase D)

This phase replaces the existing Phase D in `2026-04-15-visual-redesign-plan.md`. The executor should skip the old Phase D tasks (D1–D7) and run these instead.

---

### Task D1: Run `/critique` — UX design review

**Step 1: Read the design doc screen-by-screen specs.**

Run: `cat docs/plans/2026-04-15-visual-redesign-design.md` (sections §4.1 through §4.7)

You need this context so you can feed specific screen descriptions to the critique.

**Step 2: Run `/critique`.**

Provide the screen-by-screen context from the design doc when prompted. The critique should evaluate:
- Visual hierarchy (is the most important element on each screen obvious?)
- Information architecture (is the flow logical?)
- Emotional resonance (does it feel warm and memorial-appropriate?)
- Accessibility (can a 70-year-old grieving parent use this?)

**Step 3: Review and fix.**

Address every issue `/critique` flags. For each fix:
1. Make the change.
2. Verify visually in browser (hard-refresh).
3. Confirm the fix doesn't break the flow.

**Step 4: Commit.**

```bash
cd C:/Users/claws/OneDrive/Desktop/haloFrame
git add apps/web/src/
git commit -m "fix(web): address Impeccable critique findings"
```

If no changes needed, skip this commit.

---

### Task D2: Run `/audit` — final technical quality check

**Step 1: Run `/audit`.**

This covers a11y, performance, and responsive design. Different from `/critique` (which is UX/emotional).

**Step 2: Fix all issues.**

Focus on:
- Missing `aria-label` attributes
- Interactive elements without keyboard access
- Images without `alt` text
- Oversized assets or unnecessary re-renders

**Step 3: Commit.**

```bash
git add apps/web/src/
git commit -m "fix(web): address Impeccable audit findings — a11y and performance"
```

---

### Task D3: Anti-pattern sweep — zero detections

**Step 1: Run the detector.**

Run:
```bash
cd C:/Users/claws/OneDrive/Desktop/haloFrame
npx impeccable detect apps/web/src/
```

**Step 2: Fix every detection.**

For each anti-pattern found:
- If it's a real issue: fix it.
- If it's a false positive that conflicts with the Golden Hour Gallery design doc: add an override to `.impeccable.md` explaining why. Example:
  ```
  ## Overrides
  - body.md font-size is 15px, not 16px (DM Sans body.md token, approved in design doc §3.2)
  ```

**Step 3: Re-run until zero.**

Run:
```bash
npx impeccable detect apps/web/src/
```

Expected: `0 issues found` (or equivalent clean output).

If issues persist after overrides, use `--json` flag to identify exact files:
```bash
npx impeccable detect apps/web/src/ --json
```

**Step 4: Commit.**

```bash
git add apps/web/src/ apps/web/.impeccable.md
git commit -m "fix(web): zero Impeccable anti-patterns detected"
```

---

### Task D4: Manual — focus rings audit

**Step 1: Open the app in Chrome.**

Hard-refresh (`Ctrl+Shift+R`).

**Step 2: Tab through every screen.**

Press `Tab` repeatedly, starting from Home. Navigate into each flow. Every interactive element (buttons, links, form inputs, template tiles, upload zone) must show a **2pt bronze (`#B08A4F`) focus ring with 2pt offset** on `:focus-visible`.

**Step 3: Fix missing rings.**

If any element lacks a ring:

Check `apps/web/src/styles.css` for the `:focus-visible` rule. It should be global:
```css
:focus-visible {
  outline: 2px solid var(--c-brand-primary);
  outline-offset: 2px;
  border-radius: var(--r-xs);
}
```

If a specific component overrides `outline: none`, remove that override.

**Step 4: Verify on Enhance + Reunite flows.**

Tab through both flows completely. Confirm no missing rings.

**Step 5: Commit (if changes made).**

```bash
git add apps/web/src/styles.css apps/web/src/components/ apps/web/src/screens/
git commit -m "fix(web): focus ring coverage — keyboard accessibility"
```

---

### Task D5: Manual — reduced-motion enforcement

**Step 1: Enable reduced-motion emulation.**

Chrome DevTools → three-dot menu → More tools → Rendering → scroll to "Emulate CSS media feature prefers-reduced-motion" → select "reduce."

**Step 2: Walk both flows.**

Confirm:
- Page transitions: no translateY, only fade.
- Loading dots: stop pulsing (static rose dots at 60% opacity).
- Finalizing pill: stops pulsing (static bronze pill at 100% opacity).
- Card reveals on Home: no translateY stagger, only fade.
- Button presses: still scale (scale is fine in reduced-motion).

**Step 3: Fix anything that still animates.**

In `apps/web/src/styles.css`, verify the global `@media (prefers-reduced-motion: reduce)` block exists and catches all animations.

For framer-motion components, check that `useReducedMotion()` is imported from `framer-motion` and used to clamp `y: 0` in variant definitions. If not, add it to `apps/web/src/lib/motion.ts`:

```ts
import { useReducedMotion } from 'framer-motion';
```

**Step 4: Commit (if changes made).**

```bash
git add apps/web/src/
git commit -m "fix(web): reduced-motion enforcement"
```

---

### Task D6: Manual — ARIA live regions

**Step 1: Verify loading states.**

Check these components have `aria-live="polite"`:
- `LoadingOverlay.tsx` — segmenting + merging states
- Editor finalizing pill

Run:
```bash
grep -n "aria-live" apps/web/src/components/LoadingOverlay.tsx apps/web/src/screens/Editor.tsx apps/web/src/screens/EnhanceFlow.tsx apps/web/src/screens/ReuniteFlow.tsx
```

Expected: at least 2 matches (LoadingOverlay + finalizing pill).

**Step 2: Verify error states.**

Check that error displays use `role="alert"`:

Run:
```bash
grep -n "role=\"alert\"" apps/web/src/screens/*.tsx apps/web/src/components/*.tsx
```

Expected: matches in any component that renders error messages.

**Step 3: Screen-reader test (if NVDA available).**

Open NVDA, navigate to the app. Trigger a loading state (upload a photo). Confirm the announcement reads aloud.

If NVDA is not available, document this as "deferred to manual QA" and move on.

**Step 4: Commit (if changes made).**

```bash
git add apps/web/src/
git commit -m "fix(web): ARIA live regions for loading and error states"
```

---

### Task D7: Manual — color contrast

**Step 1: Run Lighthouse Accessibility audit.**

Chrome DevTools → Lighthouse → check "Accessibility" only → Analyze page load.

Run on:
- Home screen
- Editor screen (with a template selected)

**Step 2: Review contrast results.**

Expected: all text/background combinations pass WCAG AA (4.5:1 for normal text, 3:1 for large text).

**Step 3: Verify `text.faint` usage.**

Run:
```bash
grep -n "faint\|A89FA1" apps/web/src/styles.css apps/web/src/screens/*.tsx apps/web/src/components/*.tsx
```

Confirm `text.faint` / `#A89FA1` is ONLY used for captions at ≥17pt (Cormorant at 17pt+ or DM Sans body.lg at 17px). If used at smaller sizes, replace with `text.muted`.

**Step 4: Commit (if changes made).**

```bash
git add apps/web/src/
git commit -m "fix(web): color contrast — WCAG AA compliance"
```

---

### Task D8: Manual — font loading FOIT/FOUT

**Step 1: Throttle network.**

Chrome DevTools → Network → throttle to "Slow 4G."

**Step 2: Hard-refresh and observe.**

Watch for:
- Body text should appear immediately in DM Sans (or system fallback).
- Cormorant Garamond should swap in cleanly when loaded.
- No flash of invisible text lasting > 100ms.

**Step 3: If FOIT observed, verify font-display: swap.**

Check the Google Fonts URL in `apps/web/index.html`:

Run:
```bash
grep "fonts.googleapis" apps/web/index.html
```

The URL should contain `&display=swap`. If not, add it.

**Step 4: Commit (if changes made).**

```bash
git add apps/web/index.html
git commit -m "fix(web): font-display swap for FOIT prevention"
```

---

### Task D9: Final screenshots + comparison

**Step 1: Hard-refresh.**

`Ctrl+Shift+R` at `http://localhost:5173`.

**Step 2: Walk both flows end-to-end one more time.**

Enhance: Home → upload → SAM → tap subject → Editor → tap template → Save → 2K download.
Reunite: Home → upload × 2 → place → merge → review → Editor → tap template → Save → 2K download.

**Step 3: Capture final screenshots.**

Use Chrome DevTools MCP to navigate every screen and snapshot. Save to `.playwright-mcp/redesign-final-*.png`.

Screens: Home, Enhance upload, Enhance segmenting, Enhance select-subject, Enhance editor, Reunite upload, Reunite placement, Reunite merging, Reunite review, MyTributes, Settings, PrintShop.

**Step 4: Side-by-side comparison.**

Compare `redesign-final-*.png` to `baseline-*.png` (captured in Phase 0 / existing plan pre-flight). Confirm: every screen matches the Golden Hour Gallery design doc. Every flow works.

**Step 5: Final anti-pattern sweep.**

Run:
```bash
npx impeccable detect apps/web/src/
```

Expected: zero detections (already achieved in D3, this is confirmation after D4–D8 changes).

**Step 6: Update `.impeccable.md` with final counts.**

```
<!-- Final: /audit 0 issues, /critique 0 issues, detect 0 anti-patterns. Date: YYYY-MM-DD -->
```

**Step 7: Final commit.**

```bash
cd C:/Users/claws/OneDrive/Desktop/haloFrame
git add apps/web/.impeccable.md
git commit -m "docs: final Impeccable audit — zero anti-patterns"
```

→ Use **@superpowers:verification-before-completion** before declaring the redesign complete.

---

## Done

Final state:
- All 7 screens redesigned per Golden Hour Gallery design doc.
- All 7 reusable components restyled.
- `tokens.ts` is single source of truth (RN-portable).
- `framer-motion` + `lucide-react` integrated.
- Impeccable gates passed at every phase boundary.
- `/critique` + `/audit` — all issues addressed.
- `npx impeccable detect` — zero anti-patterns.
- Reduced-motion + AA contrast + focus rings honored.
- Both flows complete end-to-end with no functional regression.
- `.impeccable.md` documents the design system for ongoing enforcement.
