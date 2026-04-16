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
  displayXl: { size: 40, lineHeight: 1.05, weight: 500, tracking: -0.5, mobileSize: 32 },
  displayLg: { size: 32, lineHeight: 1.1, weight: 500, tracking: -0.3, mobileSize: 28 },
  displayMd: { size: 24, lineHeight: 1.2, weight: 500, tracking: -0.2 },
  bodyLg: { size: 17, lineHeight: 1.5, weight: 400, tracking: 0 },
  bodyMd: { size: 15, lineHeight: 1.5, weight: 400, tracking: 0 },
  bodySm: { size: 13, lineHeight: 1.45, weight: 500, tracking: 0.1 },
  labelMd: { size: 14, lineHeight: 1.2, weight: 500, tracking: 0.3 },
  labelSm: { size: 12, lineHeight: 1.2, weight: 700, tracking: 0.6 },
} as const;

export const shadow = {
  soft: '0 2px 10px rgba(51, 41, 56, 0.06)',
  lift: '0 6px 20px rgba(51, 41, 56, 0.10)',
  float: '0 16px 40px rgba(51, 41, 56, 0.14)',
  frame: '0 1px 2px rgba(176, 138, 79, 0.20)',
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
  standard: [0.32, 0.72, 0, 1] as const,
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
  | `feedback.${keyof typeof color.feedback}`;
