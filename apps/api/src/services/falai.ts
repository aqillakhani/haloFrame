// =============================================================================
// EternalFrame API — fal.ai integration
//
// Wraps the three model calls used by the app:
//   1. SAM 3 (segmentation) — fal-ai/sam-3/image
//   2. Nano Banana 2 Edit  — fal-ai/nano-banana-2/edit  (primary)
//   3. Nano Banana Pro     — fal-ai/nano-banana-pro/edit (fallback)
//
// All functions return { imageUrl } or throw an ApiError. Retry / fallback
// logic is handled at the route level (see routes/tribute.ts).
// =============================================================================
import { fal } from '@fal-ai/client';
import type {
  EffectIntensity,
  Placement,
  TributeTemplate,
} from '@eternalframe/shared';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { errors } from '../lib/errors.js';

fal.config({ credentials: env.FAL_KEY });

// -----------------------------------------------------------------------------
// SAM 3: detect people / pets in a photo
// -----------------------------------------------------------------------------
export interface RawSamMask {
  url: string; // PNG mask
  label: string; // matched prompt token
  score: number; // confidence
}

export interface SamResult {
  width: number;
  height: number;
  masks: RawSamMask[];
}

export async function detectSubjects(
  imageUrl: string,
  detectPets: boolean,
): Promise<SamResult> {
  const prompt = detectPets ? 'person, dog, cat, pet, animal' : 'person';

  try {
    const result = await fal.subscribe('fal-ai/sam-3/image', {
      input: {
        image_url: imageUrl,
        prompt,
        return_multiple_masks: true,
        max_masks: 10,
        include_scores: true,
        apply_mask: true,
        output_format: 'png',
      },
      logs: false,
    });

    const data = result.data as {
      image?: { width?: number; height?: number };
      masks?: Array<{ url: string }>;
      scores?: number[];
    };

    return {
      width: data.image?.width ?? 0,
      height: data.image?.height ?? 0,
      masks: (data.masks ?? []).map((m, i) => ({
        url: m.url,
        label: detectPets ? 'subject' : 'person',
        score: data.scores?.[i] ?? 0,
      })),
    };
  } catch (err) {
    logger.error({ err, imageUrl }, 'sam3 failed');
    throw errors.fal('Subject detection failed', { cause: String(err) });
  }
}

// -----------------------------------------------------------------------------
// Nano Banana 2 Edit: merge two photos (Reunite flow)
// -----------------------------------------------------------------------------
const PLACEMENT_INSTRUCTIONS: Record<Placement, string> = {
  left: 'Place the person from the second image on the left side of the group in the first image',
  right:
    'Place the person from the second image on the right side of the group in the first image',
  behind:
    'Place the person from the second image standing behind the group in the first image, slightly visible between or above other people',
  center:
    'Place the person from the second image in the center of the group in the first image, naturally integrated among the other people',
};

export async function mergePhotos(args: {
  mainPhotoUrl: string;
  lovedOnePhotoUrl: string;
  placement: Placement;
  subjectDescription: string;
  resolution?: '2K' | '4K';
}): Promise<{ imageUrl: string }> {
  const { mainPhotoUrl, lovedOnePhotoUrl, placement, subjectDescription } = args;
  const resolution = args.resolution ?? '2K';

  const prompt = [
    'Take the first image as the main scene.',
    `Take ${subjectDescription} from the second image and naturally integrate them into the first image.`,
    `${PLACEMENT_INSTRUCTIONS[placement]}.`,
    'Match the lighting, color temperature, perspective, and scale so the person looks like they were genuinely present in the original photo.',
    'Preserve everyone else in the main photo exactly as they are.',
    'The result should look like a natural, authentic photograph.',
  ].join(' ');

  try {
    const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
      input: {
        prompt,
        image_urls: [mainPhotoUrl, lovedOnePhotoUrl],
        resolution,
        output_format: 'png',
        aspect_ratio: 'auto',
      },
      logs: false,
    });

    const url = extractFirstImageUrl(result.data);
    if (!url) throw new Error('no image returned');
    return { imageUrl: url };
  } catch (err) {
    logger.error({ err, placement }, 'nano-banana merge failed');
    throw errors.fal('Photo merge failed', { cause: String(err) });
  }
}

// -----------------------------------------------------------------------------
// Nano Banana 2 Edit: apply a memorial template effect
// -----------------------------------------------------------------------------
export async function applyMemorialEffect(args: {
  photoUrl: string;
  template: TributeTemplate;
  subjectDescription: string;
  intensity: EffectIntensity;
  resolution?: '2K' | '4K';
}): Promise<{ imageUrl: string }> {
  const { photoUrl, template, subjectDescription, intensity } = args;
  const resolution = args.resolution ?? '2K';

  // Natural Blend = no effect; return source URL untouched
  if (template.promptTemplate === 'NO_EFFECT') {
    return { imageUrl: photoUrl };
  }

  const basePrompt = template.promptTemplate.replace(
    /\{subject_description\}/g,
    subjectDescription,
  );
  const modifier = template.promptModifiers[intensity];
  const prompt = modifier ? `${basePrompt} ${modifier}.` : basePrompt;

  try {
    const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
      input: {
        prompt,
        image_urls: [photoUrl],
        resolution,
        output_format: 'png',
        aspect_ratio: 'auto',
      },
      logs: false,
    });

    const url = extractFirstImageUrl(result.data);
    if (!url) throw new Error('no image returned');
    return { imageUrl: url };
  } catch (err) {
    logger.error(
      { err, templateId: template.id, intensity },
      'nano-banana template apply failed',
    );
    throw errors.fal('Memorial effect failed', { cause: String(err) });
  }
}

// -----------------------------------------------------------------------------
// Nano Banana Pro fallback (used by routes when the standard model fails)
// -----------------------------------------------------------------------------
export async function applyMemorialEffectPro(args: {
  photoUrl: string;
  template: TributeTemplate;
  subjectDescription: string;
  intensity: EffectIntensity;
  resolution?: '2K' | '4K';
}): Promise<{ imageUrl: string }> {
  const { photoUrl, template, subjectDescription, intensity } = args;
  const resolution = args.resolution ?? '2K';

  if (template.promptTemplate === 'NO_EFFECT') return { imageUrl: photoUrl };

  const basePrompt = template.promptTemplate.replace(
    /\{subject_description\}/g,
    subjectDescription,
  );
  const modifier = template.promptModifiers[intensity];
  const prompt = modifier ? `${basePrompt} ${modifier}.` : basePrompt;

  const result = await fal.subscribe('fal-ai/nano-banana-pro/edit', {
    input: {
      prompt,
      image_urls: [photoUrl],
      resolution,
      output_format: 'png',
      aspect_ratio: 'auto',
    },
    logs: false,
  });
  const url = extractFirstImageUrl(result.data);
  if (!url) throw errors.fal('Pro fallback returned no image');
  return { imageUrl: url };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function extractFirstImageUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { images?: Array<{ url?: string }>; image?: { url?: string } };
  if (d.images && d.images.length > 0 && d.images[0]?.url) return d.images[0].url;
  if (d.image?.url) return d.image.url;
  return null;
}

/**
 * Build a natural-language subject description for the prompt template.
 * Used by every route that calls applyMemorialEffect / mergePhotos.
 */
export function describeSubject(opts: {
  name?: string;
  isPet: boolean;
  petKind?: string;
}): string {
  const { name, isPet, petKind } = opts;
  if (name) return name;
  if (isPet) return petKind ? `the ${petKind}` : 'the pet';
  return 'the person';
}
