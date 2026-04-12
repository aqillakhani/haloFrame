// =============================================================================
// EternalFrame API — /api/spike/*
//
// AI-only test routes for the web harness. No auth, no Supabase, no quota.
// These take a base64 image (or a URL), upload to fal.ai storage, run the
// requested model, and return the result image URL straight back.
//
// Routes:
//   POST /api/spike/upload     -> uploads a base64 image to fal storage, returns URL
//   POST /api/spike/segment    -> SAM 3 detection
//   POST /api/spike/apply      -> Nano Banana 2 Edit with a template prompt
//   POST /api/spike/merge      -> Nano Banana 2 Edit merge of two photos
//   GET  /api/spike/templates  -> list of launch templates from shared constants
// =============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { fal } from '@fal-ai/client';
import sharp from 'sharp';
import {
  LAUNCH_TEMPLATES,
  type EffectIntensity,
  type Placement,
  type TributeTemplate,
} from '@eternalframe/shared';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { errors } from '../lib/errors.js';
import { ok } from '../lib/response.js';
import { validateBody } from '../middleware/validate.js';

fal.config({ credentials: env.FAL_KEY });

export const spikeRouter = Router();

// -----------------------------------------------------------------------------
// Helper: extract first image URL from a fal response
// -----------------------------------------------------------------------------
function extractFirstImageUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { images?: Array<{ url?: string }>; image?: { url?: string } };
  if (d.images && d.images.length > 0 && d.images[0]?.url) return d.images[0].url;
  if (d.image?.url) return d.image.url;
  return null;
}

// -----------------------------------------------------------------------------
// POST /api/spike/upload — accept a base64 data URL, upload to fal storage
// -----------------------------------------------------------------------------
const uploadSchema = z.object({
  dataUrl: z
    .string()
    .startsWith('data:image/', 'Expected a data: image URL'),
  filename: z.string().min(1).default('upload.png'),
});

spikeRouter.post('/upload', validateBody(uploadSchema), async (req, res, next) => {
  try {
    const { dataUrl, filename } = req.body as z.infer<typeof uploadSchema>;
    const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
    if (!match) throw errors.invalidRequest('Malformed data URL');
    const mime = match[1]!;
    const base64 = match[2]!;
    const buffer = Buffer.from(base64, 'base64');

    const blob = new Blob([buffer], { type: mime });
    const file = new File([blob], filename, { type: mime });
    const url = await fal.storage.upload(file);

    ok(res, { url, mime, sizeBytes: buffer.length });
  } catch (err) {
    logger.error({ err }, 'spike upload failed');
    next(err);
  }
});

// -----------------------------------------------------------------------------
// POST /api/spike/segment — run SAM 3 against an uploaded photo URL
// -----------------------------------------------------------------------------
const segmentSchema = z.object({
  imageUrl: z.string().url(),
  detectPets: z.boolean().default(true),
});

spikeRouter.post('/segment', validateBody(segmentSchema), async (req, res, next) => {
  try {
    const { imageUrl, detectPets } = req.body as z.infer<typeof segmentSchema>;

    const result = await fal.subscribe('fal-ai/sam-3/image', {
      input: {
        image_url: imageUrl,
        prompt: detectPets ? 'person, dog, cat, pet, animal' : 'person',
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

    const masks = data.masks ?? [];
    const scores = data.scores ?? [];

    // Download every mask in parallel and compute centroid + bbox + area
    const subjects = await Promise.all(
      masks.map(async (m, i) => {
        const stats = await analyzeMask(m.url);
        return stats
          ? {
              maskId: String(i),
              maskUrl: m.url,
              label: 'subject',
              confidence: scores[i] ?? 0,
              ...stats,
            }
          : null;
      }),
    );

    const filtered = subjects
      .filter((s): s is NonNullable<typeof s> => s !== null)
      // sort largest first so the dominant subject is index 0
      .sort((a, b) => b.pixelCount - a.pixelCount)
      .map((s, i) => ({ ...s, maskId: String(i) }));

    // Probe actual source image dimensions with sharp since SAM 3 output
    // may not include them.
    let imageWidth = data.image?.width ?? 0;
    let imageHeight = data.image?.height ?? 0;
    if (!imageWidth || !imageHeight) {
      try {
        const srcResponse = await fetch(imageUrl);
        const srcBuffer = Buffer.from(await srcResponse.arrayBuffer());
        const srcMeta = await sharp(srcBuffer).metadata();
        imageWidth = srcMeta.width ?? imageWidth;
        imageHeight = srcMeta.height ?? imageHeight;
      } catch (probeErr) {
        logger.warn({ probeErr }, 'failed to probe source image dimensions');
      }
    }

    ok(res, {
      imageWidth,
      imageHeight,
      subjects: filtered,
    });
  } catch (err) {
    logger.error({ err }, 'spike segment failed');
    next(err);
  }
});

interface MaskStats {
  centroid: { x: number; y: number };
  bbox: [number, number, number, number];
  pixelCount: number;
}

async function analyzeMask(url: string): Promise<MaskStats | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const buffer = Buffer.from(await response.arrayBuffer());

  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx] ?? 0;
      if (r > 127) {
        sumX += x;
        sumY += y;
        count++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (count === 0) return null;
  return {
    centroid: { x: Math.round(sumX / count), y: Math.round(sumY / count) },
    bbox: [minX, minY, maxX, maxY],
    pixelCount: count,
  };
}

// -----------------------------------------------------------------------------
// POST /api/spike/apply — apply a memorial template effect
//
// Accepts optional `subjects` + `selectedSubjectIndex` so we can inject a
// spatial disambiguator ("the person on the left", "the 2nd person from the
// left") into the prompt. Without this, Nano Banana picks a person at random
// when the photo has multiple people — the root cause of bug #13.
// -----------------------------------------------------------------------------
const subjectContextSchema = z.object({
  centroid: z.object({ x: z.number(), y: z.number() }),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});

const applySchema = z.object({
  imageUrl: z.string().url(),
  templateId: z.string().min(1),
  intensity: z.enum(['low', 'medium', 'high']).default('medium'),
  subjectName: z.string().max(120).optional(),
  isPet: z.boolean().default(false),
  // Spatial context (optional — only sent when the flow has detected subjects)
  subjects: z.array(subjectContextSchema).optional(),
  selectedSubjectIndex: z.number().int().min(0).optional(),
  imageWidth: z.number().positive().optional(),
  imageHeight: z.number().positive().optional(),
});

type SubjectContext = z.infer<typeof subjectContextSchema>;

/**
 * Build a natural-language description of the selected subject that
 * unambiguously identifies them in the photo. Uses the horizontal centroid
 * to sort subjects left-to-right, then picks a position descriptor.
 *
 * Examples:
 *   1 subject, no name          → "the person"
 *   2 subjects, selected 0      → "the person on the left side of the photo"
 *   3 subjects, selected 1      → "the person in the center of the photo"
 *   4+, selected 2              → "the third person from the left"
 *   Any + name                  → "Grandma Rose, who is the person on the left side"
 */
function buildSubjectDescription(args: {
  subjectName?: string;
  isPet: boolean;
  subjects?: SubjectContext[];
  selectedSubjectIndex?: number;
}): string {
  const { subjectName, isPet, subjects, selectedSubjectIndex } = args;
  const baseNoun = isPet ? 'pet' : 'person';

  // No disambiguation needed if only 0-1 subjects or missing context
  const haveContext =
    subjects && subjects.length >= 2 && typeof selectedSubjectIndex === 'number';

  if (!haveContext) {
    return subjectName ? subjectName : `the ${baseNoun}`;
  }

  // Sort by horizontal centroid to get left-to-right order
  const sortedByX = subjects
    .map((s, originalIndex) => ({ ...s, originalIndex }))
    .sort((a, b) => a.centroid.x - b.centroid.x);

  const position = sortedByX.findIndex(
    (s) => s.originalIndex === selectedSubjectIndex,
  );
  if (position < 0) {
    return subjectName ? subjectName : `the ${baseNoun}`;
  }

  const total = sortedByX.length;
  let positional: string;

  if (total === 2) {
    positional = position === 0 ? 'on the left side of the photo' : 'on the right side of the photo';
  } else if (total === 3) {
    if (position === 0) positional = 'on the far left of the photo';
    else if (position === 1) positional = 'in the center of the photo';
    else positional = 'on the far right of the photo';
  } else {
    const ordinals = [
      'first',
      'second',
      'third',
      'fourth',
      'fifth',
      'sixth',
      'seventh',
      'eighth',
      'ninth',
      'tenth',
    ];
    const ordinal = ordinals[position] ?? `${position + 1}th`;
    positional = `the ${ordinal} ${baseNoun} from the left`;
  }

  if (subjectName) {
    // Name + positional anchor — gives the model both semantic and spatial cues
    if (total === 2 || total === 3) {
      return `${subjectName}, who is the ${baseNoun} ${positional}`;
    }
    return `${subjectName}, who is ${positional}`;
  }

  if (total === 2 || total === 3) {
    return `the ${baseNoun} ${positional}`;
  }
  return positional;
}

spikeRouter.post('/apply', validateBody(applySchema), async (req, res, next) => {
  try {
    const {
      imageUrl,
      templateId,
      intensity,
      subjectName,
      isPet,
      subjects,
      selectedSubjectIndex,
    } = req.body as z.infer<typeof applySchema>;

    const template = LAUNCH_TEMPLATES.find((t) => t.id === templateId);
    if (!template) throw errors.templateNotFound();

    if (template.promptTemplate === 'NO_EFFECT') {
      ok(res, { imageUrl, prompt: '(no effect)', skipped: true });
      return;
    }

    const subjectDescription = buildSubjectDescription({
      subjectName,
      isPet,
      subjects,
      selectedSubjectIndex,
    });

    const basePrompt = template.promptTemplate.replace(
      /\{subject_description\}/g,
      subjectDescription,
    );
    const modifier = template.promptModifiers[intensity as EffectIntensity];
    const withModifier = modifier ? `${basePrompt} ${modifier}.` : basePrompt;

    // Hard directive to prevent effect bleed onto other people. Only append
    // when we had spatial context (i.e., the photo has multiple subjects).
    const haveContext =
      subjects && subjects.length >= 2 && typeof selectedSubjectIndex === 'number';
    const prompt = haveContext
      ? `${withModifier} IMPORTANT: Apply the memorial effect ONLY to ${subjectDescription}. Do not add any memorial effects, glows, halos, wings, or overlays to any other people or pets in the photo. Keep every other person in the photo exactly as they appear in the original image, unchanged.`
      : withModifier;

    logger.info({ templateId, subjectDescription, haveContext }, 'applying template');

    const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
      input: {
        prompt,
        image_urls: [imageUrl],
        resolution: '2K',
        output_format: 'png',
        aspect_ratio: 'auto',
      },
      logs: false,
    });

    const url = extractFirstImageUrl(result.data);
    if (!url) throw errors.fal('Nano Banana 2 returned no image');

    ok(res, {
      imageUrl: url,
      prompt,
      templateId,
      intensity,
      subjectDescription,
    });
  } catch (err) {
    logger.error({ err }, 'spike apply failed');
    next(err);
  }
});

// -----------------------------------------------------------------------------
// POST /api/spike/merge — merge two photos (Reunite flow)
// -----------------------------------------------------------------------------
const mergeSchema = z.object({
  mainPhotoUrl: z.string().url(),
  lovedOnePhotoUrl: z.string().url(),
  placement: z.enum(['left', 'right', 'behind', 'center']),
  subjectName: z.string().max(120).optional(),
  isPet: z.boolean().default(false),
});

const PLACEMENT_INSTRUCTIONS: Record<Placement, string> = {
  left: 'Place the person from the second image on the left side of the group in the first image',
  right:
    'Place the person from the second image on the right side of the group in the first image',
  behind:
    'Place the person from the second image standing behind the group in the first image, slightly visible between or above other people',
  center:
    'Place the person from the second image in the center of the group in the first image, naturally integrated among the other people',
};

spikeRouter.post('/merge', validateBody(mergeSchema), async (req, res, next) => {
  try {
    const { mainPhotoUrl, lovedOnePhotoUrl, placement, subjectName, isPet } =
      req.body as z.infer<typeof mergeSchema>;

    const subjectDescription = subjectName
      ? subjectName
      : isPet
        ? 'the pet'
        : 'the person';

    const prompt = [
      'Take the first image as the main scene.',
      `Take ${subjectDescription} from the second image and naturally integrate them into the first image.`,
      `${PLACEMENT_INSTRUCTIONS[placement]}.`,
      'Match the lighting, color temperature, perspective, and scale so the person looks like they were genuinely present in the original photo.',
      'Preserve everyone else in the main photo exactly as they are.',
      // Bug #14 — prevent duplicates
      `CRITICAL: Add ${subjectDescription} into the scene exactly ONE time. The result must contain exactly one instance of ${subjectDescription}. Do NOT duplicate them. Do NOT add them more than once. If you think ${subjectDescription} already appears in the main photo, still add them only once in the chosen position — do not create a second copy elsewhere.`,
      'The result should look like a natural, authentic photograph with no duplicated people.',
    ].join(' ');

    const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
      input: {
        prompt,
        image_urls: [mainPhotoUrl, lovedOnePhotoUrl],
        resolution: '2K',
        output_format: 'png',
        aspect_ratio: 'auto',
      },
      logs: false,
    });

    const url = extractFirstImageUrl(result.data);
    if (!url) throw errors.fal('Nano Banana 2 returned no merge image');

    ok(res, { imageUrl: url, prompt, placement });
  } catch (err) {
    logger.error({ err }, 'spike merge failed');
    next(err);
  }
});

// -----------------------------------------------------------------------------
// GET /api/spike/templates — return launch templates from shared constants
// -----------------------------------------------------------------------------
spikeRouter.get('/templates', (_req, res) => {
  const templates: TributeTemplate[] = LAUNCH_TEMPLATES;
  ok(res, { templates });
});
