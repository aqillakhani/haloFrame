// Single source of truth for visual tokens.
// Consumed by cssVars.ts (which generates :root vars) and any inline TSX styles.
// Designed to port to React Native StyleSheet without modification.
//
// NOTE (2026-04-19): palette re-seeded from the claude.ai/design Home export.
// Legacy groups (bg/brand/accent) are preserved with updated hex so unported
// screens keep rendering; the new groups (surface, ink, rule, gold, plum,
// sage, terracotta) are what newly-ported screens consume.
//
// NOTE (2026-04-24): app background lightened from #FAF3E2 → #FDFBF6 and
// cards from #FFFBF2 → #FFFEFA ("slightly warm" near-white) + sunk from
// #F4ECD9 → #F6F1E4, per the claude.ai/design Settings refresh. Cards
// intentionally NOT pure white — the design showed #FFFFFF but the user
// wanted to preserve the warm paper feel.

export const color = {
  // === Legacy groups — still referenced by unported screens ===
  bg: {
    canvas: '#FDFBF6',
    surface: '#FFFEFA',
    surfaceRaised: '#FFFFFF',
    subtle: '#F6F1E4',
  },
  brand: {
    primary: '#A0503C',
    primaryDeep: '#753D2D',
    primarySoft: '#F0DCD1',
  },
  accent: {
    rose: '#D4A8A0',
    roseDeep: '#B5847A',
  },
  text: {
    ink: '#2A231B',
    muted: '#554A3D',
    /** Reserved for body.sm captions only; sub-AA for smaller body text */
    faint: '#8A7D6E',
    onBronze: '#FFFBF2',
  },
  feedback: {
    success: '#7A9B7A',
    warning: '#C99450',
    error: '#B5605A',
    errorBg: '#F7E8E5',
  },
  hairline: 'rgba(160, 80, 60, 0.18)',
  scrim: 'rgba(42, 35, 27, 0.55)',

  // === New groups (2026-04-19 redesign) ===
  /** Layered surfaces — from coolest (app) to brightest (card). */
  surface: {
    app: '#FDFBF6',
    card: '#FFFEFA',
    sunk: '#F6F1E4',
    base: '#FEFCF7',
  },
  /** Ink ladder — `_1` darkest, `_4` lightest. Numeric keys avoid `default`. */
  ink: {
    _1: '#2A231B',
    _2: '#554A3D',
    _3: '#8A7D6E',
    _4: '#B3A69A',
  },
  /** Borders/dividers — `base` for visible, `soft` for barely-there, `strong` for hover/focus. */
  rule: {
    base: '#DCD0BD',
    soft: '#E8DFCC',
    strong: '#C9BBA3',
  },
  /** Deep terracotta — the primary accent on the redesigned home. */
  terracotta: {
    base: '#A0503C',
    ink: '#753D2D',
    soft: '#F0DCD1',
  },
  /** Dusk plum — secondary accent for the Reunite path. */
  plum: {
    base: '#6F5179',
    ink: '#4B3455',
    soft: '#EDE1EE',
  },
  /** Muted sage — tertiary accent for in-progress / neutral glances. */
  sage: {
    base: '#7B9786',
    ink: '#556F5F',
    soft: '#E1EAE0',
  },
  /** Rose — reserved for gentle error/alert tints (info icons, banners).
   * Dimmer + warmer than a standard error red so memorial flows don't
   * feel like form-validation failures. */
  rose: {
    base: '#C48A7E',
    soft: '#F6E2D9',
    ring: '#EAC9BD',
  },
  /** Warm halo gold — signature color for the brand mark and halos. */
  gold: {
    base: '#D4A95C',
    ink: '#8D6727',
    soft: '#F5E8C8',
    halo: '#E8CA92',
  },
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
  '9': 56,
  '10': 72,
  '12': 80,
} as const;

export const radius = {
  xs: 4,
  sm: 6,
  md: 10,
  btn: 14,
  lg: 16,
  xl: 22,
  '2xl': 28,
  pill: 9999,
} as const;

export const borderWidth = {
  hairline: 1,
  thin: 1.5,
  thick: 2,
} as const;

export const font = {
  display: '"Source Serif 4", "Iowan Old Style", Georgia, serif',
  body: '"Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
} as const;

export const type = {
  displayXl: { size: 40, lineHeight: 1.05, weight: 300, tracking: -0.5, mobileSize: 30 },
  displayLg: { size: 32, lineHeight: 1.1, weight: 300, tracking: -0.3, mobileSize: 28 },
  displayMd: { size: 24, lineHeight: 1.2, weight: 400, tracking: -0.2 },
  bodyLg: { size: 17, lineHeight: 1.5, weight: 400, tracking: 0 },
  bodyMd: { size: 15, lineHeight: 1.5, weight: 400, tracking: 0 },
  bodySm: { size: 13, lineHeight: 1.45, weight: 500, tracking: 0.1 },
  labelMd: { size: 14, lineHeight: 1.2, weight: 500, tracking: 0.3 },
  labelSm: { size: 12, lineHeight: 1.2, weight: 700, tracking: 0.6 },
  eyebrow: { size: 10.5, lineHeight: 1.2, weight: 500, tracking: 1.4 },
} as const;

export const shadow = {
  soft: '0 2px 10px rgba(42, 35, 27, 0.06)',
  lift: '0 6px 20px rgba(42, 35, 27, 0.10)',
  float: '0 16px 40px rgba(42, 35, 27, 0.14)',
  frame: '0 1px 2px rgba(160, 80, 60, 0.18)',
} as const;

export const duration = {
  fast: 180,
  base: 320,
  slow: 560,
  reverent: 720,
} as const;

// Cubic-bezier control points as [x1, y1, x2, y2].
// Tuple form works directly for framer-motion `ease` and RN `Easing.bezier(...easing.standard)`.
// cssVars.ts wraps these as `cubic-bezier(...)` for CSS consumers.
export const easing = {
  standard: [0.2, 0.65, 0.25, 1] as const,
  gentle:   [0.22, 0.61, 0.36, 1] as const,
  exit:     [0.4, 0, 1, 1] as const,
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
  | `feedback.${keyof typeof color.feedback}`
  | `surface.${keyof typeof color.surface}`
  | `ink.${keyof typeof color.ink}`
  | `rule.${keyof typeof color.rule}`
  | `terracotta.${keyof typeof color.terracotta}`
  | `plum.${keyof typeof color.plum}`
  | `sage.${keyof typeof color.sage}`
  | `gold.${keyof typeof color.gold}`
  | `rose.${keyof typeof color.rose}`;
