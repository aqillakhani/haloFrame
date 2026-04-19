// =============================================================================
// HaloFrame — Design System v1.2
// Warm, inviting palette for a memorial tribute app
// =============================================================================

export const Colors = {
  // PRIMARY PALETTE
  primary: '#4A6FA5',
  primaryLight: '#6B8FC5',
  primaryDark: '#345A8A',

  // WARM ACCENTS
  gold: '#D4A853',
  goldLight: '#E8C97A',
  goldSoft: '#F5E6C4',

  // BACKGROUNDS
  bgPrimary: '#FAF7F2',
  bgSecondary: '#F0EBE3',
  bgCard: '#FFFFFF',
  bgDark: '#1C2541',

  // TEXT
  textPrimary: '#2D3142',
  textSecondary: '#5C6378',
  textLight: '#8E95A7',
  textOnDark: '#FAF7F2',
  textGold: '#B8892E',

  // EMOTIONAL ACCENTS
  warmGlow: '#FFF3E0',
  skyBlue: '#E3F2FD',
  lavender: '#E8E0F0',
  roseGold: '#E8C4B8',

  // FUNCTIONAL
  success: '#4CAF7D',
  error: '#D4605A',
  errorBg: '#FFF0EF',
  disabled: '#C8CCD6',
  border: '#E2DDD5',
  borderStrong: '#D1CBC3',
  shadow: 'rgba(44, 49, 66, 0.08)',

  // BUTTON COLORS
  buttonPrimary: '#4A6FA5',
  buttonPrimaryText: '#FFFFFF',
  buttonSecondary: 'transparent',
  buttonSecondaryText: '#4A6FA5',
  buttonSecondaryBorder: '#4A6FA5',
  buttonGold: '#D4A853',
  buttonGoldText: '#FFFFFF',
} as const;

export const Typography = {
  displayFont: "'Playfair Display', Georgia, serif",
  bodyFont: "'DM Sans', system-ui, -apple-system, sans-serif",

  heading1: '1.75rem',
  heading2: '1.375rem',
  heading3: '1.125rem',
  body: '1rem',
  bodySmall: '0.875rem',
  caption: '0.75rem',
  button: '1rem',
  buttonSmall: '0.875rem',
} as const;

export const Spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  xxl: '3rem',
  screenPadding: '1.25rem',
  cardPadding: '1.25rem',
  cardRadius: '1rem',
  buttonRadius: '0.75rem',
  buttonHeight: '3.25rem',
} as const;
