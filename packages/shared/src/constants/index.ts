// =============================================================================
// HaloFrame — shared constants
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
  primary: '#4A6FA5',
  primaryLight: '#6B8FC5',
  primaryDark: '#345A8A',
  gold: '#D4A853',
  goldLight: '#E8C97A',
  goldSoft: '#F5E6C4',
  bgPrimary: '#FAF7F2',
  bgSecondary: '#F0EBE3',
  bgCard: '#FFFFFF',
  bgDark: '#1C2541',
  textPrimary: '#2D3142',
  textSecondary: '#5C6378',
  textLight: '#8E95A7',
  border: '#E2DDD5',
  success: '#4CAF7D',
  error: '#D4605A',
  errorBg: '#FFF0EF',
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
// Credit-based plan model (2026-04-18, approved pricing strategy)
//
// The server still runs the older 5-tier SUBSCRIPTION_TIERS above for
// entitlement enforcement. SUBSCRIPTION_PLANS_UI below is the NEW canonical
// pricing — paywall UI consumes this directly, and the backend will be
// refactored to match in its own session (see
// memory/project_pricing_strategy.md "Deferred work"). Keeping both as
// additive data avoids breaking the live webhook / quota wiring during
// this canonicalization pass.
// -----------------------------------------------------------------------------

export type SubscriptionPlanId =
  | 'free'
  | 'keepsake_monthly'
  | 'heritage_monthly'
  | 'heritage_annual'
  | 'topup_4pack'
  | 'topup_single';

export interface SubscriptionPlanUI {
  id: SubscriptionPlanId;
  /** Short display name, e.g. "Keepsake" */
  name: string;
  /** How credits are delivered */
  cadence: 'lifetime' | 'monthly' | 'annual' | 'one-time';
  priceCents: number;
  /** Pre-formatted display price, e.g. "$9.99" or "$0" */
  displayPrice: string;
  /** Suffix shown under the price, e.g. "/month". Empty for lifetime/one-time. */
  period: string;
  /** Credits granted per cycle (lifetime total for free; one grant for top-ups). */
  credits: number;
  /** Months of rollover allowed on unused credits (0 = no rollover). */
  rolloverMonths: number;
  /** Marketing tag, e.g. "Best Value". null when no tag. */
  tag: string | null;
  /** RevenueCat product identifier. null for the free signup grant. */
  revenueCatProductId: string | null;
  /** Secondary price line, e.g. "$199/year" shown under an annual plan card. */
  subtitle: string | null;
}

export const SUBSCRIPTION_PLANS_UI: SubscriptionPlanUI[] = [
  {
    id: 'free',
    name: 'Free',
    cadence: 'lifetime',
    priceCents: 0,
    displayPrice: '$0',
    period: '',
    credits: 2,
    rolloverMonths: 0,
    tag: null,
    revenueCatProductId: null,
    subtitle: 'Your first tributes, on us',
  },
  {
    id: 'keepsake_monthly',
    name: 'Keepsake',
    cadence: 'monthly',
    priceCents: 999,
    displayPrice: '$9.99',
    period: '/month',
    credits: 5,
    rolloverMonths: 0,
    tag: null,
    revenueCatProductId: 'haloframe_keepsake_monthly',
    subtitle: 'For remembering one loved one',
  },
  {
    id: 'heritage_monthly',
    name: 'Heritage',
    cadence: 'monthly',
    priceCents: 2499,
    displayPrice: '$24.99',
    period: '/month',
    credits: 20,
    rolloverMonths: 2,
    tag: null,
    revenueCatProductId: 'haloframe_heritage_monthly',
    subtitle: 'For families and genealogy',
  },
  {
    id: 'heritage_annual',
    name: 'Heritage',
    cadence: 'annual',
    priceCents: 19900,
    displayPrice: '$16.58',
    period: '/month',
    // 20 credits × 12 months = 240 credits delivered over the year.
    // Same 20/mo cadence as the monthly plan; cheaper per month.
    credits: 20,
    rolloverMonths: 2,
    tag: 'Best Value',
    revenueCatProductId: 'haloframe_heritage_annual',
    subtitle: '$199 billed yearly · save $100',
  },
  {
    id: 'topup_4pack',
    name: 'Tribute 4-pack',
    cadence: 'one-time',
    priceCents: 1499,
    displayPrice: '$14.99',
    period: '',
    credits: 4,
    rolloverMonths: 0,
    tag: null,
    revenueCatProductId: 'haloframe_topup_4pack',
    subtitle: 'Never expires',
  },
  {
    id: 'topup_single',
    name: 'Single tribute',
    cadence: 'one-time',
    priceCents: 499,
    displayPrice: '$4.99',
    period: '',
    credits: 1,
    rolloverMonths: 0,
    tag: null,
    revenueCatProductId: 'haloframe_topup_single',
    subtitle: null,
  },
];

// -----------------------------------------------------------------------------
// Credit cost per user action.
// Option C (commitment-based): exploration is free, commits cost credits.
// Server enforces; client displays for transparency.
// -----------------------------------------------------------------------------
export const ACTION_CREDIT_COSTS = {
  /** Upload a photo to storage — no AI cost to us */
  upload: 0,
  /** Detect subjects / generate cutout — low AI cost, treated as free */
  segment: 0,
  /** Render a 1K preview for a template — included with selection */
  preview: 0,
  /** Save an Enhance tribute at full 2K resolution */
  enhance_save: 1,
  /** Merge two people and save the combined tribute at 2K */
  reunite_save: 2,
} as const;

/**
 * Max 1K previews per uploaded photo per session. Prevents abuse of the
 * "free exploration" model — a pathological user can't preview hundreds of
 * templates without committing to a save.
 */
export const MAX_PREVIEWS_PER_UPLOAD = 15;

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
  templateIds: [],
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
    sampleImageUrl: '/samples/heavens_light.jpg',
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
      'Keep the entire photo exactly as is. Add beautiful, artistic, semi-transparent angel wings that emerge ONLY from behind {subject_description}\u2019s shoulders and back. The wings should be in a soft watercolor or painterly style, not photorealistic. The wings should have a warm golden or soft white glow. Do not alter anything else in the image. EXCLUSIVITY: Only {subject_description} has wings in the final image. No other person, pet, or object gets wings, feathers, or any wing-like element. If another person stands next to or touches {subject_description}, the wings still emerge solely from {subject_description}\u2019s back \u2014 do not let the wings\u2019 origin drift onto a neighbor. SCALE: The wings must be proportional to {subject_description}\u2019s upper body. Each single wing spans roughly 1 to 1.5 times the width of {subject_description}\u2019s torso \u2014 enough to read as angelic, but NOT so wide that the wingspan covers multiple people or dominates the full image. Do not draw wings that span the entire width of the photo. Z-ORDER: the wings extend behind {subject_description} AND behind every OTHER person, pet, and object in the photo. Wherever the wings would overlap another person/pet/object, those people/pets/objects remain fully visible on top, occluding the wings \u2014 the wings are a painterly layer positioned behind everyone except {subject_description}. Do NOT draw the wings over any other person\u2019s body, head, or face, or over any other pet.',
    promptModifiers: {
      low: 'Very faint, ghostly, barely visible wings',
      medium: 'Clearly visible but still semi-transparent artistic wings',
      high: 'Bold, dramatic wings with visible feather detail and golden glow',
    },
    sampleImageUrl: '/samples/angel_wings.jpg',
    isPetCompatible: true,
    isHumanCompatible: true,
    sortOrder: 20,
  },
  {
    id: 'halo_and_wings',
    name: 'Halo + Wings',
    description: 'A glowing halo above with delicate wings behind — the full angelic look',
    category: 'angelic',
    promptTemplate:
      'Keep the entire photo exactly as is. Add TWO coordinated artistic elements to {subject_description} and {subject_description} alone: (1) a warm, glowing, painterly golden halo floating directly above {subject_description}\u2019s head, in a classic Renaissance style \u2014 a soft golden ring with gentle light emanating from it; AND (2) beautiful, artistic, semi-transparent angel wings that emerge ONLY from behind {subject_description}\u2019s shoulders and back, spreading outward in a soft watercolor/painterly style with a warm golden or soft white glow. Both elements should share the same warm golden palette so they feel like one cohesive divine composition, not two effects stacked. Do not alter anything else in the image. EXCLUSIVITY: Only {subject_description} has a halo and wings in the final image. No other person, pet, or object gets a halo, wings, feathers, or any wing-like element. If another person stands next to or touches {subject_description}, the wings still emerge solely from {subject_description}\u2019s back and the halo stays directly above {subject_description}\u2019s head \u2014 do not let them drift onto a neighbor. SCALE: The wings must be proportional to {subject_description}\u2019s upper body. Each single wing spans roughly 1 to 1.5 times the width of {subject_description}\u2019s torso \u2014 enough to read as angelic, but NOT so wide that the wingspan covers multiple people or dominates the full image. The halo is roughly the width of {subject_description}\u2019s head. Do not draw wings that span the entire width of the photo. Z-ORDER: the wings extend behind {subject_description} AND behind every OTHER person, pet, and object in the photo. Wherever the wings would overlap another person/pet/object, those people/pets/objects remain fully visible on top, occluding the wings \u2014 the wings are a painterly layer positioned behind everyone except {subject_description}. Do NOT draw the wings over any other person\u2019s body, head, or face, or over any other pet. The halo stays above {subject_description}\u2019s head only.',
    promptModifiers: {
      low: 'Faint golden ring and very subtle, ghostly wings',
      medium: 'Clear golden halo with warm glow and clearly visible semi-transparent wings',
      high: 'Bright radiant halo and bold dramatic wings with visible feather detail and golden glow',
    },
    sampleImageUrl: '/samples/halo_and_wings.jpg',
    isPetCompatible: true,
    isHumanCompatible: true,
    sortOrder: 25,
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
    sampleImageUrl: '/samples/golden_halo.jpg',
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
      'CRITICAL CONSTRAINT: every other person, pet, background, and object in this photo MUST remain exactly as they are in the source image — no glow, no aura, no color change, no lighting change. The ONLY modification to the rest of the photo is leaving it unchanged. Within that constraint, add a soft, warm, luminous golden-white aura around {subject_description} only. {subject_description} should appear to glow gently from within, with painterly light surrounding their form, creating a sense that they are a divine, peaceful presence. Do NOT add glow, aura, or light to any other person or pet — the effect is exclusively on {subject_description}.',
    promptModifiers: {
      low: 'Very subtle warm highlight on the person, barely noticeable',
      medium: 'Clear warm glow and soft aura around the person',
      high: 'Strong radiant glow with visible light particles and warm bokeh',
    },
    sampleImageUrl: '/samples/heavenly_glow.jpg',
    isPetCompatible: true,
    isHumanCompatible: true,
    sortOrder: 40,
  },
  {
    id: 'among_the_stars',
    name: 'Among the Stars',
    description: 'The loved one watches from a starry sky above the scene',
    category: 'heavenly',
    promptTemplate:
      'Transform the upper portion of this photo into a beautiful, artistic starry night sky with warm golden-toned stars. The transition from the original scene to the starry sky should be soft and blended, not a hard cutoff. CRITICAL: {subject_description} must NOT appear at ground level in this photo. If {subject_description} is currently visible anywhere in the lower portion of the scene (in the group of people, in the foreground, at ground level), REMOVE them entirely from that position and naturally fill the space they occupied with what should have been there behind them (continue the background, sky, scenery, or other people who were standing behind). {subject_description} appears ONLY as a subtle, ghostly, semi-transparent painterly impression within the starry sky, watching peacefully over the scene from above. Every OTHER person, pet, and object in the photo stays exactly as they are. The overall mood should feel protective and serene.',
    promptModifiers: {
      low: 'Subtle sky transition with very faint stars; barely visible impression in the sky',
      medium: 'Clear starry sky with visible constellations; clearly visible ghostly impression in the sky',
      high: 'Dramatic night sky with bright stars, nebula colors, and visible Milky Way; bold luminous impression in the sky',
    },
    sampleImageUrl: '/samples/among_the_stars.jpg',
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
      'This is a SELECTIVE COLOR edit, not a global black-and-white conversion. CRITICAL CONSTRAINT: every other person, pet, background, sky, and object in this photo MUST remain in their full original color, identical to the source image — do not desaturate them, do not shift their hues, do not touch them at all. The ONLY change allowed to the rest of the photo is leaving it unchanged. Now, within that constraint, convert ONLY {subject_description} into an elegant high-contrast black-and-white monochrome portrait treatment, like classic memorial portrait photography. Add a very subtle soft vignette around {subject_description} alone. Everyone else besides {subject_description} stays in full vivid color.',
    promptModifiers: {
      low: 'Desaturated rather than full B&W, very subtle separation',
      medium: 'Clean black and white with soft contrast',
      high: 'High-contrast dramatic black and white with film grain texture',
    },
    sampleImageUrl: '/samples/classic_memorial.jpg',
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
    sampleImageUrl: '/samples/watercolor_tribute.jpg',
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
    sampleImageUrl: '/samples/rainbow_bridge.jpg',
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
    sampleImageUrl: '/samples/paw_prints_heaven.jpg',
    isPetCompatible: true,
    isHumanCompatible: false,
    sortOrder: 90,
  },
  {
    id: 'natural_blend',
    name: 'No Effects',
    description: 'Clean merge with no memorial effects — just bring them together',
    category: 'clean',
    promptTemplate: 'NO_EFFECT',
    promptModifiers: {},
    sampleImageUrl: null,
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
  // Credit model (replaces LIMIT_REACHED on the new entitlement flow —
  // the web catches this and routes the user to the paywall)
  INSUFFICIENT_CREDITS: 'insufficient_credits',
  // Abuse guard for Option C "free exploration": previews are rate-limited
  // per uploaded photo so a pathological user can't run hundreds of
  // preview renders without ever committing to a save.
  RATE_LIMITED: 'rate_limited',
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
