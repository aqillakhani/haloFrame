// =============================================================================
// EternalFrame — shared constants
// =============================================================================
import type {
  SubscriptionTier,
  SubscriptionTierConfig,
  TributeTemplate,
  TributeState,
  PrintProduct,
} from '../types/index.js';

// -----------------------------------------------------------------------------
// Color palette (referenced from mobile and from server-rendered fallbacks)
// -----------------------------------------------------------------------------
export const COLORS = {
  midnightBlue: '#1a1a3e',
  warmGold: '#d4a847',
  softCream: '#faf5eb',
  mutedLavender: '#b8a9c9',
  warmWhite: '#f8f4ef',
  // Derived UI tokens
  textPrimary: '#1a1a3e',
  textSecondary: '#5a5675',
  background: '#faf5eb',
  surface: '#ffffff',
  border: 'rgba(26, 26, 62, 0.12)',
  errorSoft: '#b85c5c',
} as const;

// -----------------------------------------------------------------------------
// Subscription tier definitions
// Server is the source of truth for these limits (enforced via /entitlements
// middleware). Mobile reads from this table for UI gating.
// -----------------------------------------------------------------------------
export const SUBSCRIPTION_TIERS: Record<SubscriptionTier, SubscriptionTierConfig> = {
  free: {
    photoCreationsPerPeriod: 1,
    periodDays: null, // lifetime
    includesWatermark: true,
    hdExport: false,
    videoTributesIncluded: 0,
    videoAddonPriceCents: null,
  },
  weekly: {
    photoCreationsPerPeriod: 5,
    periodDays: 7,
    includesWatermark: false,
    hdExport: true,
    videoTributesIncluded: 0,
    videoAddonPriceCents: 299,
  },
  monthly: {
    photoCreationsPerPeriod: 15,
    periodDays: 30,
    includesWatermark: false,
    hdExport: true,
    videoTributesIncluded: 0,
    videoAddonPriceCents: 249,
  },
  premium_monthly: {
    photoCreationsPerPeriod: -1,
    periodDays: 30,
    includesWatermark: false,
    hdExport: true,
    videoTributesIncluded: 3,
    videoAddonPriceCents: 199,
  },
  premium_annual: {
    photoCreationsPerPeriod: -1,
    periodDays: 365,
    includesWatermark: false,
    hdExport: true,
    videoTributesIncluded: 5,
    videoAddonPriceCents: 149,
  },
};

// -----------------------------------------------------------------------------
// Default initial state for a new tribute
// -----------------------------------------------------------------------------
export const INITIAL_TRIBUTE_STATE: TributeState = {
  step: 'created',
  flowType: 'enhance',
  isPet: false,
  mainPhotoUrl: null,
  lovedOnePhotoUrl: null,
  segmentation: null,
  selectedSubjectIndex: null,
  placement: null,
  mergedPhotoUrl: null,
  templateId: null,
  effectIntensity: 'medium',
  templatedPhotoUrl: null,
  textOverlay: {
    font: 'serif_classic',
    position: 'bottom_center',
  },
  borderStyle: 'none',
  finalPhotoUrl: null,
  finalPhotoHdUrl: null,
  finalVideoUrl: null,
  lastError: null,
};

// -----------------------------------------------------------------------------
// Launch templates (10) — seeded into the tribute_templates table by the
// initial migration. Edit prompts here, re-run seed.
// -----------------------------------------------------------------------------
export const LAUNCH_TEMPLATES: TributeTemplate[] = [
  {
    id: 'heavens_light',
    name: "Heaven's Light",
    description: 'Soft clouds at the top with golden light rays streaming down',
    category: 'heavenly',
    promptTemplate:
      'Keep the people and scene exactly as they are. Add soft, artistic heavenly clouds in the upper portion of the image, with warm golden light rays streaming down from above toward {subject_description}. The clouds should look painterly and ethereal, not photorealistic. The rest of the photo should remain unchanged. The overall mood should feel peaceful and divine.',
    promptModifiers: {
      low: 'Very subtle and delicate clouds, barely visible light rays',
      medium: 'Moderate clouds and clearly visible warm light rays',
      high: 'Dramatic cloud formation with strong golden light rays and lens flare',
    },
    previewImageUrl: null,
    isPetCompatible: true,
    isHumanCompatible: true,
    sortOrder: 10,
  },
  {
    id: 'angel_wings',
    name: 'Angel Wings',
    description: 'Delicate artistic wings appear behind the loved one',
    category: 'angelic',
    promptTemplate:
      'Keep the entire photo exactly as is. Add beautiful, artistic, semi-transparent angel wings behind {subject_description}. The wings should be in a soft watercolor or painterly style, not photorealistic. They should appear to gently emerge from behind the person/pet, spreading outward. The wings should have a warm golden or soft white glow. Do not alter anything else in the image.',
    promptModifiers: {
      low: 'Very faint, ghostly, barely visible wings',
      medium: 'Clearly visible but still semi-transparent artistic wings',
      high: 'Bold, dramatic wings with visible feather detail and golden glow',
    },
    previewImageUrl: null,
    isPetCompatible: true,
    isHumanCompatible: true,
    sortOrder: 20,
  },
  {
    id: 'golden_halo',
    name: 'Golden Halo',
    description: 'A warm glowing halo above the loved one',
    category: 'angelic',
    promptTemplate:
      'Keep the entire photo exactly as is. Add a warm, glowing, artistic golden halo floating above the head of {subject_description}. The halo should be painted in a classic artistic style — a soft golden ring with gentle light emanating from it. It should look like a Renaissance painting detail, not a cartoon. Do not alter anything else in the image.',
    promptModifiers: {
      low: 'Very subtle, thin golden ring with faint glow',
      medium: 'Clear golden halo with warm ambient glow',
      high: 'Bright, radiant golden halo with visible light particles',
    },
    previewImageUrl: null,
    isPetCompatible: true,
    isHumanCompatible: true,
    sortOrder: 30,
  },
  {
    id: 'heavenly_glow',
    name: 'Heavenly Glow',
    description: 'The loved one radiates with a soft, warm inner light',
    category: 'heavenly',
    promptTemplate:
      'Keep the entire photo exactly as is. Add a soft, warm, luminous aura around {subject_description}. They should appear to glow gently from within, with a warm golden-white light surrounding their form. The glow should be artistic and painterly, creating a sense that they are a divine, peaceful presence. Everyone and everything else in the photo stays completely normal and unchanged.',
    promptModifiers: {
      low: 'Very subtle warm highlight on the person, barely noticeable',
      medium: 'Clear warm glow and soft aura around the person',
      high: 'Strong radiant glow with visible light particles and warm bokeh',
    },
    previewImageUrl: null,
    isPetCompatible: true,
    isHumanCompatible: true,
    sortOrder: 40,
  },
  {
    id: 'among_the_stars',
    name: 'Among the Stars',
    description: 'The upper image transitions to a starry sky watching over the scene',
    category: 'heavenly',
    promptTemplate:
      'Keep the people and lower portion of the scene exactly as they are. Transition the upper portion of the image into a beautiful, artistic starry night sky. The transition should be soft and blended, not a hard cutoff. Within the starry sky area, add a subtle, ghostly, semi-transparent impression of {subject_description} watching peacefully from above. The stars should have warm golden tones, and the overall mood should feel protective and serene.',
    promptModifiers: {
      low: 'Subtle sky transition with very faint stars',
      medium: 'Clear starry sky with visible constellations',
      high: 'Dramatic night sky with bright stars, nebula colors, and visible Milky Way',
    },
    previewImageUrl: null,
    isPetCompatible: true,
    isHumanCompatible: true,
    sortOrder: 50,
  },
  {
    id: 'classic_memorial',
    name: 'Classic Memorial',
    description: 'The loved one appears in elegant black and white while others stay in color',
    category: 'artistic',
    promptTemplate:
      'Keep the entire photo exactly as is, but convert ONLY {subject_description} to artistic black and white / monochrome while leaving everyone and everything else in full color. The black and white conversion should be high-contrast and elegant, like classic portrait photography. Add a very subtle soft vignette around {subject_description} to make them appear distinguished. Do not alter the color portions of the image.',
    promptModifiers: {
      low: 'Desaturated rather than full B&W, very subtle separation',
      medium: 'Clean black and white with soft contrast',
      high: 'High-contrast dramatic black and white with film grain texture',
    },
    previewImageUrl: null,
    isPetCompatible: true,
    isHumanCompatible: true,
    sortOrder: 60,
  },
  {
    id: 'watercolor_tribute',
    name: 'Watercolor Tribute',
    description: 'The entire image transforms into a beautiful watercolor painting',
    category: 'artistic',
    promptTemplate:
      'Transform the entire image into a beautiful watercolor painting style. Maintain all people, pets, and the scene composition exactly as they are, but render everything in soft watercolor brush strokes with gentle color bleeding at edges. {subject_description} should have a slightly warmer, more golden tone compared to others. The overall effect should feel like a hand-painted family portrait.',
    promptModifiers: {
      low: 'Light watercolor wash, photo still mostly visible underneath',
      medium: 'Clear watercolor painting style with visible brush strokes',
      high: 'Full artistic watercolor with expressive strokes and color bleeding',
    },
    previewImageUrl: null,
    isPetCompatible: true,
    isHumanCompatible: true,
    sortOrder: 70,
  },
  {
    id: 'rainbow_bridge',
    name: 'Rainbow Bridge',
    description: 'A colorful rainbow bridge motif in the sky — for pets',
    category: 'pet',
    promptTemplate:
      'Keep the people, pets, and scene exactly as they are. Add a beautiful, artistic rainbow arc in the upper portion of the sky, creating the impression of the legendary Rainbow Bridge. The rainbow should be soft and painterly, with warm glowing light around it. Add gentle clouds around the rainbow. If {subject_description} is in the photo, add a very subtle warm glow around them. The mood should feel hopeful and peaceful.',
    promptModifiers: {
      low: 'Faint, subtle rainbow arc barely visible in the sky',
      medium: 'Clear, beautiful rainbow arc with soft clouds',
      high: 'Vivid, dramatic rainbow bridge with golden clouds and light beams',
    },
    previewImageUrl: null,
    isPetCompatible: true,
    isHumanCompatible: false,
    sortOrder: 80,
  },
  {
    id: 'paw_prints_heaven',
    name: 'Paw Prints in Heaven',
    description: 'Subtle paw print trail leading up into the clouds — for pets',
    category: 'pet',
    promptTemplate:
      'Keep the people, pets, and scene exactly as they are. Add soft, artistic, semi-transparent paw print impressions that trail gently upward from near {subject_description} into the upper sky area, where soft heavenly clouds are added. The paw prints should be golden or warm-toned and painterly, getting more faint as they ascend into the clouds. The overall mood should feel gentle and bittersweet.',
    promptModifiers: {
      low: 'Very faint, barely visible paw print impressions',
      medium: 'Clearly visible golden paw prints trailing into clouds',
      high: 'Glowing golden paw prints with sparkle particles ascending into dramatic clouds',
    },
    previewImageUrl: null,
    isPetCompatible: true,
    isHumanCompatible: false,
    sortOrder: 90,
  },
  {
    id: 'natural_blend',
    name: 'Natural Blend',
    description: 'Clean merge with no memorial effects — just bring them together',
    category: 'clean',
    promptTemplate: 'NO_EFFECT',
    promptModifiers: {},
    previewImageUrl: null,
    isPetCompatible: true,
    isHumanCompatible: true,
    sortOrder: 100,
  },
];

// -----------------------------------------------------------------------------
// Print products
// -----------------------------------------------------------------------------
export const PRINT_PRODUCTS: PrintProduct[] = [
  {
    type: 'canvas_8x10',
    displayName: 'Canvas Print 8×10',
    description: 'Gallery-wrapped canvas, ready to hang',
    priceCents: 4999,
    mockupImageUrl: '',
  },
  {
    type: 'canvas_16x20',
    displayName: 'Canvas Print 16×20',
    description: 'Large gallery-wrapped canvas',
    priceCents: 8999,
    mockupImageUrl: '',
  },
  {
    type: 'framed_8x10',
    displayName: 'Framed Print 8×10',
    description: 'Premium wood frame with matte print',
    priceCents: 6999,
    mockupImageUrl: '',
  },
  {
    type: 'framed_16x20',
    displayName: 'Framed Print 16×20',
    description: 'Large premium wood frame with matte print',
    priceCents: 11999,
    mockupImageUrl: '',
  },
  {
    type: 'poster_24x36',
    displayName: 'Poster 24×36',
    description: 'Museum-quality poster, satin finish',
    priceCents: 3999,
    mockupImageUrl: '',
  },
];

// -----------------------------------------------------------------------------
// Error codes
// -----------------------------------------------------------------------------
export const ERROR_CODES = {
  // Auth
  UNAUTHENTICATED: 'unauthenticated',
  FORBIDDEN: 'forbidden',
  // Entitlements
  LIMIT_REACHED: 'limit_reached',
  UPGRADE_REQUIRED: 'upgrade_required',
  // Validation
  INVALID_REQUEST: 'invalid_request',
  // Resource
  TRIBUTE_NOT_FOUND: 'tribute_not_found',
  TEMPLATE_NOT_FOUND: 'template_not_found',
  // External services
  FAL_ERROR: 'fal_error',
  STORAGE_ERROR: 'storage_error',
  PRINT_PROVIDER_ERROR: 'print_provider_error',
  // Generic
  INTERNAL_ERROR: 'internal_error',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
