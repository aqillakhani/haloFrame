// =============================================================================
// EternalFrame — zod schemas for runtime validation at API boundaries
// =============================================================================
import { z } from 'zod';

export const subscriptionTierSchema = z.enum([
  'free',
  'weekly',
  'monthly',
  'premium_monthly',
  'premium_annual',
]);

export const flowTypeSchema = z.enum([
  'enhance',
  'reunite',
  'pet_enhance',
  'pet_reunite',
]);

export const placementSchema = z.enum(['left', 'right', 'behind', 'front']);

export const effectIntensitySchema = z.enum(['low', 'medium', 'high']);

export const overlayFontSchema = z.enum([
  'serif_classic',
  'script_elegant',
  'sans_clean',
  'handwritten',
]);

export const overlayPositionSchema = z.enum([
  'bottom_center',
  'bottom_left',
  'bottom_right',
  'top_center',
]);

export const borderStyleSchema = z.enum([
  'none',
  'soft_vignette',
  'classic_border',
  'ornate_frame',
]);

// -----------------------------------------------------------------------------
// Request payloads
// -----------------------------------------------------------------------------
export const createTributeRequestSchema = z.object({
  flowType: flowTypeSchema,
  isPet: z.boolean().default(false),
});
export type CreateTributeRequest = z.infer<typeof createTributeRequestSchema>;

export const uploadPhotoRequestSchema = z.object({
  storagePath: z.string().min(1),
  slot: z.enum(['main', 'loved_one']),
});
export type UploadPhotoRequest = z.infer<typeof uploadPhotoRequestSchema>;

export const selectSubjectRequestSchema = z.object({
  subjectIndex: z.number().int().min(0),
  subjectName: z.string().max(120).optional(),
});
export type SelectSubjectRequest = z.infer<typeof selectSubjectRequestSchema>;

export const mergeRequestSchema = z.object({
  placement: placementSchema,
  subjectName: z.string().max(120).optional(),
});
export type MergeRequest = z.infer<typeof mergeRequestSchema>;

export const applyTemplateRequestSchema = z.object({
  /** v1.3+: one or more template IDs combined into a single Nano Banana call. */
  templateIds: z.array(z.string().min(1)).min(1),
  intensity: effectIntensitySchema.default('medium'),
});
export type ApplyTemplateRequest = z.infer<typeof applyTemplateRequestSchema>;

export const finalizeRequestSchema = z.object({
  textOverlay: z.object({
    name: z.string().max(120).optional(),
    dates: z.string().max(60).optional(),
    phrase: z.string().max(280).optional(),
    font: overlayFontSchema,
    position: overlayPositionSchema,
  }),
  borderStyle: borderStyleSchema,
});
export type FinalizeRequest = z.infer<typeof finalizeRequestSchema>;

export const shippingAddressSchema = z.object({
  fullName: z.string().min(2).max(120),
  line1: z.string().min(2).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(120),
  state: z.string().min(1).max(120),
  postalCode: z.string().min(2).max(20),
  country: z.string().length(2),
  phone: z.string().max(40).optional(),
});
export type ShippingAddressInput = z.infer<typeof shippingAddressSchema>;

export const printProductTypeSchema = z.enum([
  'canvas_8x10',
  'canvas_16x20',
  'framed_8x10',
  'framed_16x20',
  'poster_24x36',
]);

export const createPrintOrderRequestSchema = z.object({
  tributeId: z.string().uuid(),
  productType: printProductTypeSchema,
  shippingAddress: shippingAddressSchema,
  stripePaymentIntentId: z.string().min(1),
});
export type CreatePrintOrderRequest = z.infer<typeof createPrintOrderRequestSchema>;
