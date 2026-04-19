# HaloFrame Visual Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the visual layer of `apps/web` end-to-end per the approved Golden Hour Gallery + Editorial Restraint direction, while preserving every line of functional code (navigation state machine, Editor cache logic, API wiring, SAM logic).

**Architecture:** Single source of truth `tokens.ts` consumed by both styles.css (via a generated `:root` block) and any inline TSX styles. Visual layer rebuilt in 4 phases; each phase ends in a verifiable shippable commit. framer-motion handles enter/exit animation; lucide-react replaces emoji/inline-SVG iconography. Tokens are RN-portable so a future Expo build inherits the system unchanged.

**Tech Stack:** React 18, Vite, TypeScript, plain CSS (no preprocessor), framer-motion, lucide-react, Cormorant Garamond + DM Sans (Google Fonts).

**Design Reference:** `docs/plans/2026-04-15-visual-redesign-design.md` — read this first; this plan implements that design and assumes its vocabulary.

---

## Pre-flight (do once before Phase A)

**Step 1: Read the design doc.**

Run: `cat docs/plans/2026-04-15-visual-redesign-design.md` (or open in editor)

You need to internalize the token names, motion catalog, and per-screen redesign before writing any code.

**Step 2: Confirm clean tree.**

Run: `cd C:/Users/claws/OneDrive/Desktop/haloFrame && git status`
Expected: `nothing to commit, working tree clean` on branch `main`

**Step 3: Confirm dev environment runs.**

Run (in two terminals):
```bash
cd C:/Users/claws/OneDrive/Desktop/haloFrame
npm run dev    # starts api on :4000, web on :5173
```
Expected: web app loads at http://localhost:5173, both flows complete (Enhance + Reunite).

**Step 4: Take baseline screenshots.**

Use Chrome DevTools MCP to navigate every screen and snapshot. Save to `.playwright-mcp/baseline-*.png`. This is how you'll know the redesign hasn't regressed anything.

Screens to capture: Home, Enhance upload, Enhance segmenting, Enhance select-subject, Enhance editor, Reunite upload, Reunite placement, Reunite merging, Reunite review, MyTributes, Settings, PrintShop.

---

## Phase A — Foundation

Goal of phase: tokens + fonts + libs + app shell. End state: app loads with new background, fonts, header (on flow screens), and bottom tab bar — but old chrome inside individual flows is still mostly visible. Nothing functional broken.

### Task A1: Install dependencies

**Files:**
- Modify: `apps/web/package.json`

**Step 1: Install.**

Run: `cd apps/web && npm install framer-motion lucide-react`

**Step 2: Verify.**

Run: `cd apps/web && cat package.json | grep -E "framer-motion|lucide-react"`
Expected: both listed under `dependencies`.

**Step 3: Confirm dev server still runs.**

Restart `npm run dev` from repo root. Expected: clean start.

**Step 4: Commit.**

```bash
cd C:/Users/claws/OneDrive/Desktop/haloFrame
git add apps/web/package.json apps/web/package-lock.json package-lock.json
git commit -m "chore: add framer-motion and lucide-react"
```

---

### Task A2: Create `tokens.ts` — single source of truth

**Files:**
- Create: `apps/web/src/lib/tokens.ts`
- Will replace later: `apps/web/src/lib/design-system.ts`

**Step 1: Write `tokens.ts`.**

```ts
// apps/web/src/lib/tokens.ts
// Single source of truth for visual tokens.
// Consumed by cssVars.ts (which generates :root vars) and any inline TSX styles.
// Designed to port to React Native StyleSheet without modification.

export const color = {
  bg: {
    canvas: '#FAF4EC',
    surface: '#FFFBF5',
    surfaceRaised: '#FFFFFF',
    subtle: '#F2EAD9',
  },
  brand: {
    primary: '#B08A4F',
    primaryDeep: '#8E6E3D',
    primarySoft: '#EDD9B7',
  },
  accent: {
    rose: '#D4A8A0',
    roseDeep: '#B5847A',
  },
  text: {
    ink: '#332938',
    muted: '#7A6F73',
    /** Reserved for body.sm captions only; sub-AA for smaller body text */
    faint: '#A89FA1',
    onBronze: '#FFFBF5',
  },
  feedback: {
    success: '#7A9B7A',
    warning: '#C99450',
    error: '#B5605A',
    errorBg: '#F7E8E5',
  },
  hairline: 'rgba(176, 138, 79, 0.18)',
  scrim: 'rgba(51, 41, 56, 0.55)',
} as const;

export const space = {
  '0': 0,
  '1': 4,
  '2': 8,
  '3': 12,
  '4': 16,
  '5': 20,
  '6': 24,
  '7': 32,
  '8': 40,
  '10': 56,
  '12': 80,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  pill: 9999,
} as const;

export const borderWidth = {
  hairline: 1,
  thin: 1.5,
  thick: 2,
} as const;

export const font = {
  display: '"Cormorant Garamond", Georgia, serif',
  body: '"DM Sans", system-ui, -apple-system, sans-serif',
} as const;

export const type = {
  displayXl:    { size: 40, lineHeight: 1.05, weight: 500, tracking: -0.5, mobileSize: 32 },
  displayLg:    { size: 32, lineHeight: 1.1,  weight: 500, tracking: -0.3, mobileSize: 28 },
  displayMd:    { size: 24, lineHeight: 1.2,  weight: 500, tracking: -0.2 },
  bodyLg:       { size: 17, lineHeight: 1.5,  weight: 400, tracking: 0 },
  bodyMd:       { size: 15, lineHeight: 1.5,  weight: 400, tracking: 0 },
  bodySm:       { size: 13, lineHeight: 1.45, weight: 500, tracking: 0.1 },
  labelMd:      { size: 14, lineHeight: 1.2,  weight: 500, tracking: 0.3 },
  labelSm:      { size: 12, lineHeight: 1.2,  weight: 700, tracking: 0.6 },
} as const;

export const shadow = {
  soft:  '0 2px 10px rgba(51, 41, 56, 0.06)',
  lift:  '0 6px 20px rgba(51, 41, 56, 0.10)',
  float: '0 16px 40px rgba(51, 41, 56, 0.14)',
  frame: '0 1px 2px rgba(176, 138, 79, 0.20)',
} as const;

export const duration = {
  fast: 180,
  base: 320,
  slow: 560,
  reverent: 720,
} as const;

export const easing = {
  standard: 'cubic-bezier(0.32, 0.72, 0, 1)',
  gentle:   'cubic-bezier(0.22, 0.61, 0.36, 1)',
  exit:     'cubic-bezier(0.4, 0, 1, 1)',
} as const;

export const layout = {
  screenPaddingMobile: 20,
  screenPaddingTablet: 32,
  maxWidth: 1200,
  tapTargetMin: 44,
  headerHeight: 56,
  tabBarHeight: 64,
} as const;

export const zIndex = {
  base: 0,
  raised: 10,
  sticky: 50,
  tabBar: 100,
  modal: 1000,
  toast: 1100,
} as const;

export type TokenColorPath =
  | `bg.${keyof typeof color.bg}`
  | `brand.${keyof typeof color.brand}`
  | `accent.${keyof typeof color.accent}`
  | `text.${keyof typeof color.text}`
  | `feedback.${keyof typeof color.feedback}`;
```

**Step 2: Verify it typechecks.**

Run: `cd apps/web && npm run typecheck`
Expected: PASS (no errors related to tokens.ts).

**Step 3: Commit at end of Task A6 (no commit yet — bundle these together).**

---

### Task A3: Create `cssVars.ts` — generates `:root` block from tokens

**Files:**
- Create: `apps/web/src/lib/cssVars.ts`

**Step 1: Write `cssVars.ts`.**

```ts
// apps/web/src/lib/cssVars.ts
// Builds a CSS string that exposes tokens.ts as :root custom properties.
// Mounted once by main.tsx.

import { color, space, radius, borderWidth, shadow, duration, easing, layout } from './tokens';

function flatten(obj: Record<string, unknown>, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}-${k}`;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else {
      out[key] = String(v);
    }
  }
  return out;
}

export function buildRootCss(): string {
  const vars: Record<string, string> = {
    ...flatten(color, '--c'),
    ...flatten(space, '--s'),
    ...flatten(radius, '--r'),
    ...flatten(borderWidth, '--bw'),
    ...flatten(shadow, '--sh'),
    ...flatten(duration, '--d'),
    ...flatten(easing, '--e'),
    ...flatten(layout, '--l'),
  };
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  return `:root {\n${lines.join('\n')}\n}\n`;
}

export function injectRootVars(): void {
  const id = 'haloframe-tokens';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = buildRootCss();
  document.head.appendChild(style);
}
```

**Step 2: Wire into `main.tsx`.**

Modify `apps/web/src/main.tsx`. Add at the top of the file (after React imports), call `injectRootVars()` before `createRoot(...)`.

```ts
import { injectRootVars } from './lib/cssVars';
injectRootVars();
```

**Step 3: Verify in browser.**

Open DevTools → Elements → `<head>` → confirm a `<style id="haloframe-tokens">` element exists with `--c-bg-canvas: #FAF4EC;` etc.

---

### Task A4: Create `haptics.ts` no-op shim

**Files:**
- Create: `apps/web/src/lib/haptics.ts`

**Step 1: Write `haptics.ts`.**

```ts
// apps/web/src/lib/haptics.ts
// No-op on web. RN replaces with expo-haptics later.
// Centralizes haptic call sites so the swap is one file.

export type HapticEvent =
  | 'press'        // Light
  | 'select'       // Selection
  | 'success'      // Notification.Success
  | 'warning'      // Notification.Warning
  | 'snap';        // Selection (very light)

export function haptic(_event: HapticEvent): void {
  // Web: no-op.
}
```

**Step 2: Typecheck.** `cd apps/web && npm run typecheck` → PASS.

---

### Task A5: Create `motion.ts` — framer-motion variants

**Files:**
- Create: `apps/web/src/lib/motion.ts`

**Step 1: Write `motion.ts`.**

```ts
// apps/web/src/lib/motion.ts
// framer-motion Variants + transition presets shared across screens.

import type { Variants, Transition } from 'framer-motion';
import { duration, easing } from './tokens';

const ms = (n: number) => n / 1000;

export const transition = {
  fast:     { duration: ms(duration.fast),     ease: easing.exit }     as Transition,
  base:     { duration: ms(duration.base),     ease: easing.standard } as Transition,
  slow:     { duration: ms(duration.slow),     ease: easing.gentle }   as Transition,
  reverent: { duration: ms(duration.reverent), ease: easing.gentle }   as Transition,
};

export const screenFade: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: transition.base },
  exit:    { opacity: 0,        transition: transition.fast },
};

export const tabFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.24, ease: easing.standard } },
  exit:    { opacity: 0, transition: { duration: 0.18, ease: easing.exit } },
};

export const heroText: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: transition.reverent },
};

export const cardReveal: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.4, ease: easing.gentle, delay: 0.2 + i * 0.08 },
  }),
};

export const photoFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transition.slow },
};

export const sheetSlide: Variants = {
  initial: { y: '100%' },
  animate: { y: 0, transition: transition.base },
  exit:    { y: '100%', transition: transition.fast },
};

export const toastEnter: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: transition.base },
  exit:    { opacity: 0, y: 16, transition: transition.fast },
};
```

**Step 2: Typecheck.** PASS.

---

### Task A6: Update `index.html` — fonts, favicon, theme-color

**Files:**
- Modify: `apps/web/index.html`

**Step 1: Write new head.**

Replace the existing Google Fonts link with:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />

<meta name="theme-color" content="#FAF4EC" />
<meta name="description" content="Honor the people you love with quiet, premium photo tributes." />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

**Step 2: Create `apps/web/public/favicon.svg`.**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="6" fill="#FAF4EC"/>
  <circle cx="16" cy="16" r="6.5" stroke="#B08A4F" stroke-width="1.5"/>
  <circle cx="16" cy="16" r="10" stroke="#B08A4F" stroke-width="1" opacity="0.5"/>
</svg>
```

**Step 3: Hard-refresh and verify.**

Run dev, hard-refresh (`Ctrl+Shift+R`), confirm:
- Browser tab shows the bronze halo favicon.
- Body text renders in DM Sans (sans-serif).
- No console errors related to font loading.
- Network tab shows Cormorant Garamond + DM Sans loading from gstatic.com.

**Step 4: Commit (bundles A2–A6).**

```bash
cd C:/Users/claws/OneDrive/Desktop/haloFrame
git add apps/web/src/lib/tokens.ts apps/web/src/lib/cssVars.ts apps/web/src/lib/motion.ts apps/web/src/lib/haptics.ts apps/web/src/main.tsx apps/web/index.html apps/web/public/favicon.svg
git commit -m "feat(web): visual tokens, motion variants, fonts, favicon"
```

---

### Task A7: Rewrite `styles.css` skeleton — base only

This step replaces the entire `styles.css` with the *foundation* layer only — resets, base typography, layout primitives, button + card classes. Per-screen styles get added in Phase B/C.

**Files:**
- Replace: `apps/web/src/styles.css`

**Step 1: Replace the file.**

```css
/* apps/web/src/styles.css
   HaloFrame visual layer — Golden Hour Gallery direction.
   Tokens come from :root vars injected by lib/cssVars.ts. */

*,
*::before,
*::after {
  box-sizing: border-box;
}

html, body, #root {
  margin: 0;
  padding: 0;
  min-height: 100%;
  background: var(--c-bg-canvas);
  color: var(--c-text-ink);
  font-family: var(--font-body, "DM Sans", system-ui, -apple-system, sans-serif);
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

body {
  font-family: "DM Sans", system-ui, -apple-system, sans-serif;
}

/* ---- Display type ---- */

.t-display-xl,
.t-display-lg,
.t-display-md {
  font-family: "Cormorant Garamond", Georgia, serif;
  font-weight: 500;
  color: var(--c-text-ink);
  margin: 0;
}

.t-display-xl { font-size: 32px; line-height: 1.05; letter-spacing: -0.5px; }
.t-display-lg { font-size: 28px; line-height: 1.1;  letter-spacing: -0.3px; }
.t-display-md { font-size: 24px; line-height: 1.2;  letter-spacing: -0.2px; }

@media (min-width: 768px) {
  .t-display-xl { font-size: 40px; }
  .t-display-lg { font-size: 32px; }
}

/* ---- Body type ---- */

.t-body-lg { font-size: 17px; line-height: 1.5; }
.t-body-md { font-size: 15px; line-height: 1.5; }
.t-body-sm { font-size: 13px; line-height: 1.45; font-weight: 500; letter-spacing: 0.1px; }

.t-label-md { font-size: 14px; line-height: 1.2; font-weight: 500; letter-spacing: 0.3px; }
.t-label-sm { font-size: 12px; line-height: 1.2; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; }

.t-muted { color: var(--c-text-muted); }
.t-faint { color: var(--c-text-faint); }
.t-italic { font-style: italic; }

/* ---- Layout primitives ---- */

.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-width: 600px;
  margin: 0 auto;
  background: var(--c-bg-canvas);
}

@media (min-width: 768px) {
  .app-shell {
    max-width: 720px;
  }
}

.screen {
  flex: 1;
  padding: 24px var(--l-screenPaddingMobile);
  padding-bottom: calc(var(--l-tabBarHeight) + 24px + env(safe-area-inset-bottom));
}

@media (min-width: 768px) {
  .screen {
    padding-left: var(--l-screenPaddingTablet);
    padding-right: var(--l-screenPaddingTablet);
  }
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hairline {
  height: 1px;
  background: var(--c-hairline);
  border: 0;
  margin: 0;
}

.hairline-short {
  width: 24px;
  height: 1.5px;
  background: var(--c-brand-primary);
  border: 0;
  margin: 0;
  opacity: 0.6;
}

/* ---- Buttons ---- */

button {
  font: inherit;
  margin: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  color: var(--c-text-ink);
}

button:disabled { cursor: not-allowed; opacity: 0.45; }

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: var(--l-tapTargetMin);
  padding: 12px 20px;
  border-radius: var(--r-md);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.3px;
  transition: background var(--d-fast) ms var(--e-exit), transform var(--d-fast) ms var(--e-exit), box-shadow var(--d-fast) ms var(--e-exit);
}

.btn-primary {
  background: var(--c-brand-primary);
  color: var(--c-text-onBronze);
  box-shadow: var(--sh-soft);
}

.btn-primary:hover:not(:disabled),
.btn-primary:focus-visible:not(:disabled) {
  background: var(--c-brand-primaryDeep);
  box-shadow: var(--sh-lift);
}

.btn-primary:active:not(:disabled) {
  transform: scale(0.97);
}

.btn-ghost {
  background: transparent;
  color: var(--c-text-ink);
  border: 1px solid var(--c-hairline);
}

.btn-ghost:hover:not(:disabled),
.btn-ghost:focus-visible:not(:disabled) {
  background: var(--c-bg-subtle);
  border-color: var(--c-brand-primary);
}

.btn-ghost:active:not(:disabled) {
  transform: scale(0.97);
}

/* Bronze icon-only round button */
.btn-icon {
  width: 44px;
  height: 44px;
  border-radius: 9999px;
  background: var(--c-bg-surface);
  color: var(--c-text-ink);
  box-shadow: var(--sh-soft);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-icon:hover:not(:disabled),
.btn-icon:focus-visible:not(:disabled) {
  background: var(--c-bg-subtle);
}

.btn-icon:active:not(:disabled) {
  transform: scale(0.94);
}

/* ---- Card ---- */

.card {
  background: var(--c-bg-surface);
  border-radius: var(--r-lg);
  box-shadow: var(--sh-soft);
  padding: 24px;
}

.card-frame {
  background: var(--c-bg-surfaceRaised);
  border-radius: var(--r-sm);
  padding: 8px;
  box-shadow: var(--sh-frame), var(--sh-soft);
}

/* ---- Focus ring ---- */

:focus-visible {
  outline: 2px solid var(--c-brand-primary);
  outline-offset: 2px;
  border-radius: var(--r-xs);
}

/* ---- Reduced motion ---- */

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 120ms !important;
    animation-duration: 120ms !important;
    animation-iteration-count: 1 !important;
  }
}

/* ---- App shell scaffolding (header, tab bar) ----
   Per-component styles live in component-scoped sections below. */

.app-header {
  position: sticky;
  top: 0;
  z-index: var(--l-zIndex-sticky, 50);
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--l-headerHeight);
  padding: 0 var(--l-screenPaddingMobile);
  background: var(--c-bg-canvas);
  border-bottom: 1px solid var(--c-hairline);
}

.app-header-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--c-text-muted);
  letter-spacing: 0.3px;
}

/* (per-screen styles get appended in Phase B/C) */
```

**Step 2: Make sure the app loads without crashing.**

Hard-refresh. Expected: app loads with sunset-ivory background, DM Sans body text, but most screens look broken because all the old class names are gone. That's fine — fix them screen-by-screen in Phase C. For now, only confirm: no JS errors in console.

---

### Task A8: Create `Icon.tsx` lucide wrapper

**Files:**
- Create: `apps/web/src/components/icons/Icon.tsx`

**Step 1: Write `Icon.tsx`.**

```tsx
// apps/web/src/components/icons/Icon.tsx
// Single import surface for lucide icons. Forces consistent stroke + size.

import { ArrowLeft, Home, Images, Printer, Settings, Upload, Check, X, Download, LoaderCircle, Circle, Plus, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const ICONS = {
  back: ArrowLeft,
  home: Home,
  images: Images,
  printer: Printer,
  settings: Settings,
  upload: Upload,
  check: Check,
  close: X,
  download: Download,
  spinner: LoaderCircle,
  dot: Circle,
  plus: Plus,
  chevronRight: ChevronRight,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 24,
  strokeWidth = 1.5,
  className,
  'aria-label': ariaLabel,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  'aria-label'?: string;
}) {
  const Cmp: LucideIcon = ICONS[name];
  return (
    <Cmp
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden={!ariaLabel}
      aria-label={ariaLabel}
    />
  );
}
```

**Step 2: Typecheck.** PASS.

---

### Task A9: Create `HaloGlyph.tsx`

**Files:**
- Create: `apps/web/src/components/icons/HaloGlyph.tsx`

**Step 1: Write `HaloGlyph.tsx`.**

```tsx
// apps/web/src/components/icons/HaloGlyph.tsx
// The proprietary mark — two concentric bronze arcs, one closed circle.
// Used in app header on Home and in the MyTributes empty state. Nowhere else.

export function HaloGlyph({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle cx="16" cy="16" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 12 a 11 5 0 0 1 22 0" stroke="currentColor" strokeWidth="1" opacity="0.55" />
    </svg>
  );
}
```

**Step 2: Typecheck.** PASS.

---

### Task A10: Rebuild app shell — App.tsx with header, tab bar, page transitions

**Files:**
- Modify: `apps/web/src/App.tsx`

**Step 1: Read current App.tsx to understand the screen-switch mechanism.**

Run: `cat apps/web/src/App.tsx`

Note the current screen-switching pattern (likely a switch statement on `nav.screen`).

**Step 2: Wrap screen-switch in `AnimatePresence` + `motion.div`.**

Inside `App.tsx`:

```tsx
import { AnimatePresence, motion } from 'framer-motion';
import { screenFade } from './lib/motion';
import { useNavigation } from './lib/navigation';
import { BottomTabBar } from './components/BottomTabBar';
// ...screen imports

export function App() {
  const nav = useNavigation();

  return (
    <div className="app-shell">
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={nav.screen}
          variants={screenFade}
          initial="initial"
          animate="animate"
          exit="exit"
          className="screen"
        >
          {renderScreen(nav.screen)}
        </motion.main>
      </AnimatePresence>
      <BottomTabBar />
    </div>
  );
}

function renderScreen(screen: string) {
  switch (screen) {
    case 'HOME':         return <HomeScreen />;
    case 'ENHANCE_FLOW': return <EnhanceFlow />;
    case 'REUNITE_FLOW': return <ReuniteFlow />;
    case 'MY_TRIBUTES':  return <MyTributesScreen />;
    case 'SETTINGS':     return <SettingsScreen />;
    case 'PRINT_SHOP':   return <PrintShopScreen />;
    default:             return <HomeScreen />;
  }
}
```

(The exact name `nav.screen` might differ — preserve whatever the existing code uses; only wrap, do not refactor the navigation reducer.)

**Step 3: Verify in browser.**

Hard-refresh. Click between Home, Settings, MyTributes, PrintShop. Expected: each transition fades + slides up 8pt.

**Step 4: Commit (bundles A7–A10).**

```bash
cd C:/Users/claws/OneDrive/Desktop/haloFrame
git add apps/web/src/styles.css apps/web/src/components/icons/ apps/web/src/App.tsx
git commit -m "feat(web): styles foundation, icons, app shell with page transitions"
```

---

### Task A11: Phase A smoke test

**Step 1: Hard-refresh and walk every screen.**

In browser:
- Home loads with new background. Old screen content visible inside new shell. No console errors.
- Tab bar visible at bottom. Click each tab → screen swaps with cross-fade.
- Both flows still complete end-to-end (chrome looks broken inside, but the flow finishes and a 2K image saves).

**Step 2: Capture phase-A screenshots.**

Use Chrome DevTools MCP. Save to `.playwright-mcp/redesign-phase-A-*.png`.

**Step 3: Mark Phase A done.** No additional commit (already committed in A6 + A10).

→ Use **@superpowers:verification-before-completion** before declaring Phase A complete.

---

## Phase B — Reusable components

End state: every reusable component restyled per design doc §4.7. Functionality unchanged.

### Task B1: BackButton

**Files:**
- Modify: `apps/web/src/components/BackButton.tsx`
- Modify: `apps/web/src/styles.css` (append component section)

**Step 1: Replace the BackButton return JSX.**

```tsx
import { Icon } from './icons/Icon';
// ...keep existing imports + nav usage

return (
  <button
    type="button"
    className="btn-icon back-btn"
    onClick={handleClick}
    aria-label="Go back"
  >
    <Icon name="back" size={20} />
  </button>
);
```

**Step 2: Append CSS.**

```css
/* ---- BackButton ---- */
.back-btn {
  /* uses .btn-icon base; no overrides needed yet */
}
```

**Step 3: Visual smoke.**

Navigate into Enhance flow → confirm BackButton is a 44pt circular surface bg with a chevron. Click → still navigates back.

**Step 4: Commit at end of Task B7.**

---

### Task B2: BottomTabBar

**Files:**
- Modify: `apps/web/src/components/BottomTabBar.tsx`
- Modify: `apps/web/src/styles.css` (append)

**Step 1: Replace the JSX.**

```tsx
import { Icon } from './icons/Icon';
import type { IconName } from './icons/Icon';

const TABS: Array<{ id: string; label: string; icon: IconName }> = [
  { id: 'HOME',         label: 'Home',     icon: 'home' },
  { id: 'MY_TRIBUTES',  label: 'Tributes', icon: 'images' },
  { id: 'PRINT_SHOP',   label: 'Prints',   icon: 'printer' },
  { id: 'SETTINGS',     label: 'Settings', icon: 'settings' },
];

return (
  <nav className="tab-bar" aria-label="Primary">
    {TABS.map(t => {
      const active = nav.activeTab === t.id;
      return (
        <button
          key={t.id}
          type="button"
          className={`tab-item ${active ? 'tab-item--active' : ''}`}
          aria-current={active ? 'page' : undefined}
          aria-label={t.label}
          onClick={() => nav.setTab(t.id as never)}
        >
          <Icon name={t.icon} size={22} />
          <span className="tab-item-label">{t.label}</span>
          <span className="tab-item-underline" aria-hidden />
        </button>
      );
    })}
  </nav>
);
```

(The exact `nav.setTab` / `nav.activeTab` surface might differ — match whatever exists.)

**Step 2: Append CSS.**

```css
/* ---- BottomTabBar ---- */
.tab-bar {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 600px;
  height: calc(var(--l-tabBarHeight) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--c-bg-surface);
  border-top: 1px solid var(--c-hairline);
  display: flex;
  align-items: stretch;
  z-index: var(--l-zIndex-tabBar, 100);
}

@media (min-width: 768px) {
  .tab-bar { max-width: 720px; }
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 0;
  color: var(--c-text-muted);
  position: relative;
  transition: color var(--d-fast)ms var(--e-standard);
}

.tab-item:hover, .tab-item:focus-visible {
  color: var(--c-text-ink);
}

.tab-item--active {
  color: var(--c-brand-primary);
}

.tab-item-label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
}

.tab-item-underline {
  position: absolute;
  bottom: 6px;
  width: 8px;
  height: 2px;
  border-radius: 2px;
  background: transparent;
  transition: background var(--d-base)ms var(--e-standard);
}

.tab-item--active .tab-item-underline {
  background: var(--c-brand-primary);
}
```

**Step 2: Visual smoke.**

Tab through. Active tab = bronze ink + 8pt underline.

---

### Task B3: UploadZone

**Files:**
- Modify: `apps/web/src/components/UploadZone.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Replace the visual JSX (keep all the file-input + drag-drop logic intact).**

```tsx
import { Icon } from './icons/Icon';

return (
  <label
    className={`upload-zone ${isDragging ? 'upload-zone--drag' : ''} ${preview ? 'upload-zone--filled' : ''}`}
    onDragOver={onDragOver}
    onDragLeave={onDragLeave}
    onDrop={onDrop}
  >
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/heic"
      onChange={onChange}
      className="upload-zone-input"
    />
    {preview ? (
      <img src={preview} alt="Selected photo preview" className="upload-zone-preview" />
    ) : (
      <div className="upload-zone-empty">
        <Icon name="upload" size={28} className="upload-zone-icon" />
        <p className="t-label-md">Tap to choose</p>
        <p className="t-body-sm t-faint">or drag a photo here</p>
        <p className="t-body-sm t-faint upload-zone-hint">JPG &middot; PNG &middot; HEIC</p>
      </div>
    )}
  </label>
);
```

**Step 2: Append CSS.**

```css
/* ---- UploadZone ---- */
.upload-zone {
  display: block;
  position: relative;
  min-height: 320px;
  padding: 32px;
  background: var(--c-bg-surface);
  border: 1.5px dashed var(--c-brand-primary);
  border-radius: var(--r-lg);
  cursor: pointer;
  transition: background var(--d-base)ms var(--e-standard), border-color var(--d-base)ms var(--e-standard);
}

.upload-zone:hover,
.upload-zone--drag {
  background: var(--c-brand-primarySoft);
  border-style: solid;
}

.upload-zone-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.upload-zone-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  min-height: 256px;
  text-align: center;
  color: var(--c-text-muted);
}

.upload-zone-icon { color: var(--c-brand-primary); }
.upload-zone-hint { margin-top: 8px; }

.upload-zone-preview {
  display: block;
  max-width: 100%;
  max-height: 60vh;
  margin: 0 auto;
  border-radius: var(--r-sm);
  box-shadow: var(--sh-frame), var(--sh-soft);
}
```

**Step 3: Smoke.** Try uploading. Drag-over state should fill bronze-soft.

---

### Task B4: LoadingOverlay → three pulsing dots

**Files:**
- Modify: `apps/web/src/components/LoadingOverlay.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Replace JSX.**

```tsx
import { useEffect, useState } from 'react';

export function LoadingOverlay({ message, hint }: { message: string; hint?: string }) {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowHint(true), 12000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <p className="loading-message t-display-md t-italic">{message}</p>
      <div className="loading-dots" aria-hidden>
        <span /><span /><span />
      </div>
      {(showHint || hint) && (
        <p className="loading-hint t-body-sm t-muted">{hint ?? 'Almost there…'}</p>
      )}
    </div>
  );
}
```

**Step 2: Append CSS.**

```css
/* ---- LoadingOverlay ---- */
.loading-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 48px 24px;
  text-align: center;
}

.loading-message {
  color: var(--c-text-ink);
  max-width: 320px;
}

.loading-dots {
  display: flex;
  gap: 12px;
}

.loading-dots span {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: var(--c-accent-rose);
  opacity: 0.3;
  animation: dot-pulse 1.4s ease-in-out infinite;
}

.loading-dots span:nth-child(2) { animation-delay: 0.2s; }
.loading-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes dot-pulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50%      { opacity: 1;   transform: scale(1.15); }
}

.loading-hint {
  animation: fade-in var(--d-slow)ms var(--e-gentle);
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .loading-dots span { animation: none; opacity: 0.6; }
}
```

**Step 3: Smoke.** Trigger an Enhance upload, watch the segmenting state. Should see three rose dots pulsing.

---

### Task B5: SubjectSelector — bronze rings + numbered rose pills

**Files:**
- Modify: `apps/web/src/components/SubjectSelector.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Replace the visual JSX (keep bbox math + selection state).**

```tsx
return (
  <div className="subject-canvas">
    <img src={imageSrc} alt="" className="subject-image" />
    {subjects.map((subj, i) => {
      const isSelected = selectedIndex === i;
      const label = `${subj.label === 'person' ? 'Person' : 'Pet'} ${i + 1}`;
      return (
        <button
          key={i}
          type="button"
          className={`subject-ring ${isSelected ? 'subject-ring--active' : ''}`}
          style={bboxStyle(subj.bbox)}
          onClick={() => onSelect(i)}
          aria-label={`Select ${label}`}
          aria-pressed={isSelected}
        >
          <span className="subject-pill">{label}</span>
        </button>
      );
    })}
  </div>
);
```

**Step 2: Append CSS.**

```css
/* ---- SubjectSelector ---- */
.subject-canvas {
  position: relative;
  display: inline-block;
  background: var(--c-bg-surfaceRaised);
  padding: 8px;
  border-radius: var(--r-sm);
  box-shadow: var(--sh-frame), var(--sh-soft);
}

.subject-image { display: block; max-width: 100%; height: auto; border-radius: var(--r-xs); }

.subject-ring {
  position: absolute;
  border: 1.5px solid var(--c-brand-primary);
  background: transparent;
  border-radius: var(--r-sm);
  opacity: 0.6;
  transition: opacity var(--d-base)ms var(--e-standard), border-width var(--d-base)ms var(--e-standard);
  cursor: pointer;
}

.subject-ring:hover, .subject-ring:focus-visible {
  opacity: 1;
}

.subject-ring--active {
  border-width: 2px;
  opacity: 1;
}

.subject-pill {
  position: absolute;
  top: -10px;
  left: -8px;
  padding: 4px 10px;
  border-radius: 9999px;
  background: var(--c-accent-rose);
  color: var(--c-text-ink);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.4px;
  box-shadow: var(--sh-soft);
  white-space: nowrap;
}

.subject-ring--active .subject-pill {
  background: var(--c-brand-primary);
  color: var(--c-text-onBronze);
}
```

**Step 3: Smoke.** Upload `family.jpg` (10 subjects). Confirm 10 numbered rose pills are distinguishable.

---

### Task B6: TemplateGallery — tile rebuild

**Files:**
- Modify: `apps/web/src/components/TemplateGallery.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Replace the tile JSX (keep selection state + ready/not-ready logic).**

```tsx
import { Icon } from './icons/Icon';

return (
  <div className="template-grid" role="radiogroup" aria-label="Template style">
    {templates.map(tpl => {
      const selected = selectedIds.includes(tpl.id);
      const ready = readyMap.get(tpl.id) ?? false;
      return (
        <button
          key={tpl.id}
          type="button"
          role="radio"
          aria-checked={selected}
          aria-label={tpl.name}
          aria-busy={!ready}
          disabled={!ready}
          className={`template-tile ${selected ? 'template-tile--selected' : ''} ${ready ? '' : 'template-tile--pending'}`}
          onClick={() => onSelect(tpl.id)}
        >
          <div className="template-tile-photo">
            <img src={tpl.sample} alt="" />
            {selected && (
              <span className="template-tile-check"><Icon name="check" size={14} /></span>
            )}
            {!ready && <span className="template-tile-dot" aria-hidden />}
          </div>
          <div className="template-tile-meta">
            <p className="t-label-sm t-faint">{tpl.category}</p>
            <p className="t-label-md">{tpl.name}</p>
          </div>
        </button>
      );
    })}
  </div>
);
```

**Step 2: Append CSS.**

```css
/* ---- TemplateGallery ---- */
.template-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-top: 16px;
}

@media (min-width: 600px) {
  .template-grid { grid-template-columns: repeat(3, 1fr); }
}

.template-tile {
  display: flex;
  flex-direction: column;
  background: var(--c-bg-surface);
  border-radius: var(--r-md);
  overflow: hidden;
  text-align: left;
  box-shadow: var(--sh-soft);
  transition: box-shadow var(--d-base)ms var(--e-standard), transform var(--d-base)ms var(--e-standard);
  position: relative;
}

.template-tile:hover:not(:disabled),
.template-tile:focus-visible:not(:disabled) {
  box-shadow: var(--sh-lift);
  transform: translateY(-1px);
}

.template-tile-photo {
  position: relative;
  aspect-ratio: 1 / 1;
  background: var(--c-bg-subtle);
}

.template-tile-photo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.template-tile--selected {
  outline: 2px solid var(--c-brand-primary);
  outline-offset: -2px;
}

.template-tile-check {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border-radius: 9999px;
  background: var(--c-brand-primary);
  color: var(--c-text-onBronze);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--sh-soft);
}

.template-tile--pending {
  opacity: 0.55;
  filter: grayscale(0.4);
  cursor: wait;
  pointer-events: none;
}

.template-tile-dot {
  position: absolute;
  top: 10px;
  left: 10px;
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: var(--c-accent-rose);
  opacity: 0.6;
  animation: dot-pulse 2s ease-in-out infinite;
}

.template-tile-meta {
  padding: 12px 14px 14px;
  background: var(--c-bg-surface);
}
```

**Step 3: Smoke.** Open Editor. Confirm tiles render. Selected tile gets bronze ring + checkmark. Pending tiles show rose pulse.

---

### Task B7: ImageViewer — bronze rim + remove `mix-blend-mode`

**Files:**
- Modify: `apps/web/src/components/ImageViewer.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Verify what `mix-blend-mode` is doing today.**

Run: `grep -n "mix-blend-mode" apps/web/src/styles.css`

**Step 2: Replace the overlay style.**

In the JSX, the overlay `<img>` element should change from `style={{ mixBlendMode: 'screen' }}` to `style={{ opacity: 0.92 }}`. The container gets the bronze rim:

```css
/* ---- ImageViewer ---- */
.image-viewer {
  position: relative;
  background: var(--c-bg-surfaceRaised);
  padding: 8px;
  border-radius: var(--r-sm);
  box-shadow: var(--sh-frame), var(--sh-soft);
  overflow: hidden;
}

.image-viewer-canvas {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--r-xs);
}

.image-viewer-overlay {
  position: absolute;
  inset: 8px;
  pointer-events: none;
  border-radius: var(--r-xs);
}

.image-viewer-overlay img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.92;
}
```

**Step 3: Side-by-side compare.**

Take a screenshot of EnhanceFlow editor with `classic_memorial` selected before this change and after. If the after-version looks materially worse than before, fall back to: keep `mix-blend-mode: screen` for now and flag for Phase D revisit. (The RN port doesn't matter yet for this specific overlay since RN editor is separate.)

**Step 4: Commit Phase B (bundles B1–B7).**

```bash
cd C:/Users/claws/OneDrive/Desktop/haloFrame
git add apps/web/src/components apps/web/src/styles.css
git commit -m "feat(web): redesign reusable components — buttons, tabs, upload, loading, subjects, gallery, viewer"
```

→ Use **@superpowers:verification-before-completion**.

---

### Task B8: Phase B smoke

Walk both flows end-to-end. Take screenshots → `.playwright-mcp/redesign-phase-B-*.png`. Compare to baseline.

---

## Phase C — Screen-by-screen redesign

### Task C1: HomeScreen

**Files:**
- Modify: `apps/web/src/screens/HomeScreen.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Read current HomeScreen.tsx.**

`cat apps/web/src/screens/HomeScreen.tsx`

**Step 2: Replace the JSX.**

```tsx
import { motion } from 'framer-motion';
import { useNavigation } from '../lib/navigation';
import { heroText, cardReveal } from '../lib/motion';
import { HaloGlyph } from '../components/icons/HaloGlyph';
import { Icon } from '../components/icons/Icon';

export function HomeScreen() {
  const nav = useNavigation();
  return (
    <div className="home">
      <header className="home-mark" aria-label="HaloFrame">
        <HaloGlyph size={28} />
      </header>

      <motion.section className="home-hero" variants={heroText} initial="initial" animate="animate">
        <p className="t-display-lg t-italic t-muted home-eyebrow">In loving memory.</p>
        <h1 className="t-display-xl">Create a tribute that holds the feeling, not just the photo.</h1>
        <hr className="hairline-short home-hr" />
      </motion.section>

      <div className="home-cards">
        {[
          { id: 'enhance', screen: 'ENHANCE_FLOW', title: 'Honor a photo', subtitle: 'Restore and adorn one you already have.', sample: '/samples/heavens_light.jpg' },
          { id: 'reunite', screen: 'REUNITE_FLOW', title: 'Bring them back', subtitle: 'Add a loved one into a photo they\u2019d belong in.', sample: '/samples/halo_and_wings.jpg' },
        ].map((c, i) => (
          <motion.button
            key={c.id}
            type="button"
            className="home-card"
            variants={cardReveal}
            initial="initial"
            animate="animate"
            custom={i}
            onClick={() => nav.push(c.screen as never)}
          >
            <div className="home-card-photo" style={{ backgroundImage: `url(${c.sample})` }} />
            <div className="home-card-body">
              <h2 className="t-display-md">{c.title}</h2>
              <p className="t-body-md t-muted">{c.subtitle}</p>
              <span className="home-card-cta">
                Begin <Icon name="chevronRight" size={16} />
              </span>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Append CSS.**

```css
/* ---- HomeScreen ---- */
.home { display: flex; flex-direction: column; gap: 32px; }

.home-mark {
  display: flex;
  align-items: center;
  color: var(--c-brand-primary);
  margin-bottom: 16px;
}

.home-hero { display: flex; flex-direction: column; gap: 16px; }
.home-eyebrow { margin: 0; opacity: 0.7; }
.home-hr { margin-top: 8px; }

.home-cards { display: flex; flex-direction: column; gap: 20px; }

@media (min-width: 768px) {
  .home-cards { flex-direction: row; }
}

.home-card {
  display: flex;
  flex-direction: column;
  background: var(--c-bg-surface);
  border-radius: var(--r-lg);
  overflow: hidden;
  box-shadow: var(--sh-soft);
  text-align: left;
  flex: 1;
  transition: box-shadow var(--d-base)ms var(--e-standard), transform var(--d-base)ms var(--e-standard);
}

.home-card:hover, .home-card:focus-visible {
  box-shadow: var(--sh-lift);
  transform: translateY(-1px);
}

.home-card-photo {
  aspect-ratio: 4 / 5;
  background-size: cover;
  background-position: center;
  position: relative;
}

.home-card-photo::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(176,138,79,0.0) 40%, rgba(176,138,79,0.30) 100%);
}

.home-card-body {
  padding: 20px 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.home-card-cta {
  align-self: flex-end;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--c-brand-primary);
  font-weight: 500;
  letter-spacing: 0.3px;
  margin-top: 12px;
  font-size: 14px;
}
```

**Step 4: Visual smoke.**

Reload Home. Confirm: hero text fades in over ~720ms; cards stagger in after; clicking each card pushes into the right flow.

---

### Task C2–C5: EnhanceFlow per state

**Files:**
- Modify: `apps/web/src/screens/EnhanceFlow.tsx`
- Modify: `apps/web/src/styles.css` (append .enhance-* sections)

**Approach:** EnhanceFlow renders one of `'upload' | 'segmenting' | 'select_subject' | 'editor'`. Replace the visual chrome of each state per design doc §4.3. Keep the state machine and SAM/template logic intact.

**Step 1: Map current state branches.**

`grep -n "case '" apps/web/src/screens/EnhanceFlow.tsx`

**Step 2: For each state, replace JSX:**

`'upload'` — header (display.lg "Choose a photo of someone you'd like to honor."), `<UploadZone>`, `Continue →` btn appears once file selected.

`'segmenting'` — `<LoadingOverlay message="Looking gently for the people in this photo." />`. Optionally render the source photo at 40% opacity behind it.

`'select_subject'` — `<SubjectSelector>` (already redesigned in B5), helper line below ("Tap the person or pet you'd like to honor."), sticky-bottom `Continue →` once one selected.

`'editor'` — delegates to `<Editor>` (no change here).

**Step 3: Append CSS.**

```css
/* ---- EnhanceFlow ---- */
.enhance-headline { text-align: center; margin-bottom: 12px; }
.enhance-helper   { text-align: center; margin: 16px 0 24px; }

.enhance-segmenting-photo {
  display: block;
  max-width: 100%;
  border-radius: var(--r-sm);
  box-shadow: var(--sh-frame), var(--sh-soft);
  opacity: 0.4;
  margin: 0 auto 24px;
}

.sticky-action {
  position: sticky;
  bottom: calc(var(--l-tabBarHeight) + 16px + env(safe-area-inset-bottom));
  display: flex;
  justify-content: center;
  padding: 12px 0;
  background: linear-gradient(to top, var(--c-bg-canvas) 60%, transparent);
}
```

**Step 4: Smoke.** Walk Enhance end-to-end with `family.jpg`. Each state should look per design.

---

### Task C6–C9: ReuniteFlow per state

**Files:**
- Modify: `apps/web/src/screens/ReuniteFlow.tsx`
- Modify: `apps/web/src/styles.css`

Same approach as Enhance:

`'upload'` (two-photo) — two stacked UploadZones with display.md labels above each. After both filled, optionally collapse to two 80pt thumbnails side-by-side.

`'placement'` — full-width source photo, draggable loved-one overlay (existing logic kept). Bronze snap-guides fade in within 16pt of thirds. Vertical bronze track on right edge for size + behind/same/front pills above.

`'merging'` — LoadingOverlay with "Bringing them together…"

`'review'` — merged photo full-width with bronze rim, two buttons under: ghost "Try again" + bronze "Yes, this looks right →".

Append a `.reunite-*` CSS section.

**Smoke:** walk Reunite end-to-end with `portrait.jpg` + `face.jpg`.

---

### Task C10: Editor

**Files:**
- Modify: `apps/web/src/screens/Editor.tsx` (visual JSX only — `cacheRef`, `inflightRef`, render logic UNTOUCHED)
- Modify: `apps/web/src/styles.css`

**Step 1: Locate the visual JSX vs the cache/render logic.**

`grep -n "cacheRef\|inflightRef\|applyTemplate" apps/web/src/screens/Editor.tsx`

The cache/render code is your no-touch zone. Only the surrounding JSX changes.

**Step 2: Replace the visual structure.**

```tsx
return (
  <div className="editor">
    <header className="app-header">
      <BackButton />
      <span className="app-header-title">Editing tribute</span>
      <button type="button" className="btn btn-primary editor-save" onClick={openSaveSheet}>Save</button>
    </header>

    <ImageViewer src={baseImage} overlay={previewImage} />

    <div className="editor-section">
      <h2 className="t-display-md">Choose a feeling</h2>
      <hr className="hairline-short" />
      <TemplateGallery
        templates={visibleTemplates}
        selectedIds={selectedIds}
        readyMap={readyMap}
        onSelect={onSelect}
      />
    </div>

    {finalizing && (
      <div className="editor-finalizing" role="status" aria-live="polite">
        <span className="finalizing-pill">Finalizing your tribute in 2K…</span>
      </div>
    )}

    {saveOpen && <SaveSheet onSavePhone={handleSavePhone} onClose={() => setSaveOpen(false)} />}
  </div>
);
```

`SaveSheet` is a small bottom-sheet component you create in this same file or alongside.

**Step 3: Append CSS.**

```css
/* ---- Editor ---- */
.editor { display: flex; flex-direction: column; gap: 24px; }

.editor-save { padding: 8px 18px; min-height: 36px; font-size: 13px; }

.editor-section { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }

.editor-finalizing {
  position: sticky;
  bottom: calc(var(--l-tabBarHeight) + 16px + env(safe-area-inset-bottom));
  display: flex;
  justify-content: center;
}

.finalizing-pill {
  background: var(--c-brand-primary);
  color: var(--c-text-onBronze);
  padding: 10px 18px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: var(--sh-lift);
  animation: pill-pulse 2s ease-in-out infinite;
}

@keyframes pill-pulse {
  0%, 100% { opacity: 0.85; }
  50%      { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .finalizing-pill { animation: none; opacity: 1; }
}

/* ---- SaveSheet ---- */
.save-sheet-scrim {
  position: fixed;
  inset: 0;
  background: var(--c-scrim);
  z-index: var(--l-zIndex-modal, 1000);
}

.save-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--c-bg-surface);
  border-top-left-radius: var(--r-lg);
  border-top-right-radius: var(--r-lg);
  padding: 20px 20px calc(20px + env(safe-area-inset-bottom));
  box-shadow: var(--sh-float);
  z-index: calc(var(--l-zIndex-modal, 1000) + 1);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
```

**Step 4: SaveSheet logic — create a small sub-component.**

```tsx
import { motion, AnimatePresence } from 'framer-motion';
import { sheetSlide } from '../lib/motion';

function SaveSheet({ onSavePhone, onClose }: { onSavePhone: () => void; onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div className="save-sheet-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div className="save-sheet" variants={sheetSlide} initial="initial" animate="animate" exit="exit">
        <h3 className="t-display-md">Save your tribute</h3>
        <button type="button" className="btn btn-primary" onClick={onSavePhone}>Save to phone</button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Order a print (coming soon)</button>
      </motion.div>
    </AnimatePresence>
  );
}
```

**Step 5: End-to-end smoke.** Save a 2K image. Confirm download still works (file blob, not cross-origin `<a download>`).

---

### Task C11–C13: Empty states (MyTributes, Settings, PrintShop)

**Files:**
- Create: `apps/web/src/components/illustrations/HaloIllustration.tsx`
- Create: `apps/web/src/components/illustrations/EnvelopeIllustration.tsx`
- Create: `apps/web/src/components/illustrations/FrameIllustration.tsx`
- Modify: `apps/web/src/screens/MyTributesScreen.tsx`
- Modify: `apps/web/src/screens/SettingsScreen.tsx`
- Modify: `apps/web/src/screens/PrintShopScreen.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Create the three illustration components.**

Each is a 96×96 SVG, 1.5px stroke, `currentColor`, opacity 0.3 from CSS.

```tsx
// HaloIllustration.tsx
export function HaloIllustration({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden>
      <ellipse cx="48" cy="40" rx="28" ry="6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="48" cy="56" r="14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M28 80 q20 -16 40 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
```

```tsx
// EnvelopeIllustration.tsx
export function EnvelopeIllustration({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden>
      <rect x="14" y="28" width="68" height="44" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14 32 L48 56 L82 32" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
```

```tsx
// FrameIllustration.tsx
export function FrameIllustration({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden>
      <rect x="18" y="14" width="60" height="68" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="26" y="22" width="44" height="52" rx="1" stroke="currentColor" strokeWidth="1" />
      <circle cx="48" cy="40" r="6" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
```

**Step 2: Replace each empty-state screen JSX.**

```tsx
// MyTributesScreen.tsx (other two follow the same shape)
import { useNavigation } from '../lib/navigation';
import { HaloIllustration } from '../components/illustrations/HaloIllustration';

export function MyTributesScreen() {
  const nav = useNavigation();
  return (
    <div className="empty">
      <hr className="hairline-short" />
      <div className="empty-illustration"><HaloIllustration /></div>
      <hr className="hairline-short" />
      <h1 className="t-display-lg empty-headline">Your tributes will live here.</h1>
      <p className="t-body-md t-muted empty-body">Once you've saved one, it'll appear in this gallery.</p>
      <button type="button" className="btn btn-primary" onClick={() => nav.setTab('HOME')}>Make a tribute</button>
    </div>
  );
}
```

**Step 3: Append CSS.**

```css
/* ---- Empty states ---- */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 20px;
  padding: 64px 24px 32px;
}

.empty-illustration {
  color: var(--c-text-ink);
  opacity: 0.3;
}

.empty-headline { max-width: 320px; }
.empty-body    { max-width: 320px; }
```

**Step 4: Commit Phase C.**

```bash
cd C:/Users/claws/OneDrive/Desktop/haloFrame
git add apps/web/src/screens apps/web/src/components/illustrations apps/web/src/styles.css
git commit -m "feat(web): redesign every screen — Home, Enhance, Reunite, Editor, empty states"
```

→ Use **@superpowers:verification-before-completion**.

---

### Task C14: Phase C end-to-end smoke

Walk Enhance: Home → upload `family.jpg` → SAM → tap subject 3 → Editor → tap `halo_and_wings` → Save → 2K download.

Walk Reunite: Home → upload `portrait.jpg` + `face.jpg` → place loved-one → merge → review → Editor → tap `heavens_light` → Save → 2K download.

**Impatient-user pass:** tap during loading, double-click Save, navigate mid-render, hit Back during Editor preload. Should never crash; pending requests resolve into cache.

Take screenshots → `.playwright-mcp/redesign-phase-C-*.png`.

---

## Phase D — Polish

### Task D1: Focus rings audit

Tab through the entire app with keyboard only. Confirm every interactive element shows a 2pt bronze focus ring with 2pt offset on `:focus-visible`.

If any element is missing a ring, audit its CSS — likely missing `:focus-visible` or has `outline: none`.

---

### Task D2: Reduced-motion enforcement

In Chrome DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion" → "reduce."

Walk both flows. Confirm:
- Page transitions no longer translate (only fade).
- Loading dots stop pulsing (single static rose dot).
- Finalizing pill stops pulsing.
- Card reveals on Home no longer translate.

If anything still animates, search styles.css for missing `@media (prefers-reduced-motion: reduce)` blocks and add them.

For framer-motion components, use the `useReducedMotion()` hook in `lib/motion.ts` — wrap variants to clamp `y: 0` when reduced.

---

### Task D3: ARIA live regions

For each loading state, confirm there's a polite `aria-live` region announcing it:
- Segmenting → "Looking gently for the people in this photo"
- Merging → "Bringing them together"
- Finalizing pill → "Finalizing your tribute in 2K"

Run a quick screen-reader test in NVDA or VoiceOver. Confirm announcements come through.

For error states, confirm `role="alert"`.

---

### Task D4: Color contrast audit

Run Lighthouse → Accessibility audit on Home, Editor, both flows. Confirm color-contrast pass.

Manually verify `text.faint` (#A89FA1) is only used at 17pt+ as documented.

---

### Task D5: Font loading FOIT/FOUT cleanup

Throttle network to "Slow 4G" in DevTools. Reload Home. Confirm:
- Body text appears immediately in DM Sans (or fallback).
- Cormorant Garamond swaps in cleanly when ready.
- No flash of invisible text > 100ms.

If FOIT is observed, `font-display: swap` may not be working — verify the Google Fonts URL has it.

---

### Task D6: Final commit

```bash
cd C:/Users/claws/OneDrive/Desktop/haloFrame
git add -A
git commit -m "feat(web): polish — focus rings, reduced motion, aria-live, contrast, font loading"
```

If nothing changed: `git status` will be clean and no commit needed. That's also fine — Phase D may just be verification.

---

### Task D7: Final verification & screenshot pack

1. Hard-refresh.
2. Walk both flows end-to-end one more time.
3. Take final screenshots → `.playwright-mcp/redesign-final-*.png`.
4. Side-by-side compare to `baseline-*.png`. Confirm: every screen looks per design doc, every flow still works.
5. Commit screenshots if you want them in git (they're gitignored by default).

→ Use **@superpowers:verification-before-completion** before declaring the redesign complete.

---

## Done

Final state:
- All 7 screens redesigned.
- All 7 reusable components restyled.
- `tokens.ts` is single source of truth (RN-portable).
- `framer-motion` + `lucide-react` integrated.
- Reduced-motion + AA contrast + focus rings honored.
- Both flows complete end-to-end with no functional regression.
- 4 commits on `main`, each shippable independently.
