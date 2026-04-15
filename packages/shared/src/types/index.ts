// =============================================================================
// EternalFrame — shared TypeScript types
// =============================================================================

// -----------------------------------------------------------------------------
// Subscription tiers
// -----------------------------------------------------------------------------
export type SubscriptionTier =
  | 'free'
  | 'weekly'
  | 'monthly'
  | 'premium_monthly'
  | 'premium_annual';

export interface SubscriptionTierConfig {
  /** -1 means unlimited */
  photoCreationsPerPeriod: number;
  /** null = lifetime, otherwise rolling window in days */
  periodDays: number | null;
  includesWatermark: boolean;
  hdExport: boolean;
  videoTributesIncluded: number;
  /** null = cannot purchase video add-on */
  videoAddonPriceCents: number | null;
}

// -----------------------------------------------------------------------------
// Tribute flow
// -----------------------------------------------------------------------------
export type FlowType = 'enhance' | 'reunite' | 'pet_enhance' | 'pet_reunite';

export type TributeStep =
  | 'created'
  | 'uploaded'
  | 'segmented'
  | 'subject_selected'
  | 'merged'
  | 'templated'
  | 'composited'
  | 'finalized'
  | 'failed';

export type Placement = 'left' | 'right' | 'behind' | 'front';

export type EffectIntensity = 'low' | 'medium' | 'high';

export type BorderStyle = 'none' | 'soft_vignette' | 'classic_border' | 'ornate_frame';

export type OverlayPosition =
  | 'bottom_center'
  | 'bottom_left'
  | 'bottom_right'
  | 'top_center';

export type OverlayFont =
  | 'serif_classic'
  | 'script_elegant'
  | 'sans_clean'
  | 'handwritten';

// -----------------------------------------------------------------------------
// Segmentation result from SAM 3 (post-processed by api/segmentation.ts)
// -----------------------------------------------------------------------------
export interface DetectedSubject {
  /** Stable id within this tribute, e.g. "0", "1" */
  maskId: string;
  /** Image-space coordinates */
  centroid: { x: number; y: number };
  /** [x1, y1, x2, y2] */
  bbox: [number, number, number, number];
  /** SAM 3 confidence 0..1 */
  confidence: number;
  /** Storage URL of the binary mask PNG */
  maskUrl: string;
  /** "person" | "dog" | "cat" | etc — from the SAM 3 prompt that triggered it */
  label: string;
}

export interface SegmentationData {
  imageWidth: number;
  imageHeight: number;
  subjects: DetectedSubject[];
}

// -----------------------------------------------------------------------------
// Tribute state machine (persisted in tributes.state JSONB)
// -----------------------------------------------------------------------------
export interface TextOverlay {
  name?: string;
  dates?: string;
  phrase?: string;
  font: OverlayFont;
  position: OverlayPosition;
}

export interface TributeState {
  step: TributeStep;
  flowType: FlowType;
  isPet: boolean;

  // Source images (Supabase Storage paths)
  mainPhotoUrl: string | null;
  lovedOnePhotoUrl: string | null;

  // Segmentation
  segmentation: SegmentationData | null;
  selectedSubjectIndex: number | null;

  // Reunite-only
  placement: Placement | null;
  mergedPhotoUrl: string | null;

  // Memorial effect — v1.3+: users can stack multiple styles, so this is an
  // array of template IDs. Empty array means no effect selected yet.
  templateIds: string[];
  effectIntensity: EffectIntensity;
  templatedPhotoUrl: string | null;

  // Customize
  textOverlay: TextOverlay;
  borderStyle: BorderStyle;

  // Final outputs
  finalPhotoUrl: string | null;
  finalPhotoHdUrl: string | null;
  finalVideoUrl: string | null;

  // Error state
  lastError: { code: string; message: string; at: string } | null;
}

// -----------------------------------------------------------------------------
// Tribute template
// -----------------------------------------------------------------------------
export type TemplateCategory = 'heavenly' | 'angelic' | 'artistic' | 'pet' | 'clean';

export interface TributeTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  /** Prompt template with {subject_description} placeholder. Use 'NO_EFFECT' to skip the AI call. */
  promptTemplate: string;
  promptModifiers: Partial<Record<EffectIntensity, string>>;
  sampleImageUrl: string | null;
  isPetCompatible: boolean;
  isHumanCompatible: boolean;
  sortOrder: number;
}

// -----------------------------------------------------------------------------
// Profile
// -----------------------------------------------------------------------------
export interface Profile {
  id: string;
  displayName: string | null;
  subscriptionTier: SubscriptionTier;
  creationsUsedThisPeriod: number;
  periodResetAt: string | null;
  totalCreations: number;
  revenuecatId: string | null;
  createdAt: string;
  updatedAt: string;
}

// -----------------------------------------------------------------------------
// Tribute (DB row, public-facing shape)
// -----------------------------------------------------------------------------
export interface Tribute {
  id: string;
  userId: string;
  flowType: FlowType;
  step: TributeStep;
  status: 'draft' | 'processing' | 'completed' | 'failed';
  state: TributeState;
  isPet: boolean;
  createdAt: string;
  updatedAt: string;
}

// -----------------------------------------------------------------------------
// Print
// -----------------------------------------------------------------------------
export type PrintProductType =
  | 'canvas_8x10'
  | 'canvas_16x20'
  | 'framed_8x10'
  | 'framed_16x20'
  | 'poster_24x36';

export type PrintStatus =
  | 'pending_payment'
  | 'pending_fulfillment'
  | 'submitted'
  | 'printing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface ShippingAddress {
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
}

export interface PrintProduct {
  type: PrintProductType;
  displayName: string;
  description: string;
  priceCents: number;
  mockupImageUrl: string;
}

export interface PrintOrder {
  id: string;
  userId: string;
  tributeId: string;
  productType: PrintProductType;
  printStatus: PrintStatus;
  externalOrderId: string | null;
  shippingAddress: ShippingAddress;
  priceCents: number;
  createdAt: string;
}

// -----------------------------------------------------------------------------
// API response envelope
// -----------------------------------------------------------------------------
export interface ApiResponseSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiResponseError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiResponseSuccess<T> | ApiResponseError;

// -----------------------------------------------------------------------------
// Entitlement check (used by api/middleware/entitlements.ts and mobile UI)
// -----------------------------------------------------------------------------
export interface EntitlementCheck {
  allowed: boolean;
  reason?: 'limit_reached' | 'upgrade_required' | 'requires_addon_purchase';
  remaining?: number;
  requiresAddonPurchase?: boolean;
  addonPriceCents?: number;
}
