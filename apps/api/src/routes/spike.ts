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
  type Placement,
  type TributeTemplate,
} from '@eternalframe/shared';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { errors } from '../lib/errors.js';
import { ok } from '../lib/response.js';
import { validateBody } from '../middleware/validate.js';
import { combineTemplatePrompts, NO_EFFECT_SENTINEL } from '../services/templateCombiner.js';

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

async function callSam3(imageUrl: string, prompt: string) {
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
  return data;
}

function bboxIoU(a: [number, number, number, number], b: [number, number, number, number]): number {
  const [ax1, ay1, ax2, ay2] = a;
  const [bx1, by1, bx2, by2] = b;
  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  const inter = (ix2 - ix1) * (iy2 - iy1);
  const areaA = (ax2 - ax1) * (ay2 - ay1);
  const areaB = (bx2 - bx1) * (by2 - by1);
  return inter / (areaA + areaB - inter);
}

spikeRouter.post('/segment', validateBody(segmentSchema), async (req, res, next) => {
  try {
    const { imageUrl, detectPets } = req.body as z.infer<typeof segmentSchema>;

    // SAM 3 expects a single concept per call. Multi-concept prompts like
    // "person, dog, cat" return zero masks. Call per concept in parallel
    // and merge the results.
    const prompts = detectPets ? ['person', 'dog', 'cat'] : ['person'];
    const responses = await Promise.all(
      prompts.map(async (p) => ({ prompt: p, data: await callSam3(imageUrl, p) })),
    );

    const rawMasks: Array<{ url: string; confidence: number; label: string }> = [];
    for (const { prompt, data } of responses) {
      const masks = data.masks ?? [];
      const scores = data.scores ?? [];
      masks.forEach((m, i) => {
        rawMasks.push({ url: m.url, confidence: scores[i] ?? 0, label: prompt });
      });
    }

    logger.info(
      { prompts, totalMasks: rawMasks.length },
      'SAM3 merged response',
    );

    // Download every mask in parallel and compute centroid + bbox + area
    const analyzed = await Promise.all(
      rawMasks.map(async (m, i) => {
        const stats = await analyzeMask(m.url);
        return stats
          ? {
              maskId: String(i),
              maskUrl: m.url,
              label: m.label,
              confidence: m.confidence,
              ...stats,
            }
          : null;
      }),
    );

    // Filter nulls, sort by size, then dedupe overlapping subjects across
    // concept prompts (e.g. "person" + "dog" sometimes both hit the same blob).
    const sortedAll = analyzed
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => b.pixelCount - a.pixelCount);

    const deduped: typeof sortedAll = [];
    for (const s of sortedAll) {
      const overlap = deduped.find((d) => bboxIoU(d.bbox, s.bbox) > 0.7);
      if (!overlap) deduped.push(s);
    }
    const filtered = deduped.map((s, i) => ({ ...s, maskId: String(i) }));

    // SAM 3 output doesn't include source dimensions — probe via sharp.
    const anyData = responses[0]?.data;
    let imageWidth = anyData?.image?.width ?? 0;
    let imageHeight = anyData?.image?.height ?? 0;
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
  /**
   * One or more template IDs. Multiple IDs are combined into a single Nano
   * Banana 2 call so cost stays constant regardless of how many styles are
   * stacked. See services/templateCombiner.ts.
   */
  templateIds: z.array(z.string().min(1)).min(1),
  intensity: z.enum(['low', 'medium', 'high']).default('medium'),
  subjectName: z.string().max(120).optional(),
  isPet: z.boolean().default(false),
  // Spatial context (optional — only sent when the flow has detected subjects)
  subjects: z.array(subjectContextSchema).optional(),
  selectedSubjectIndex: z.number().int().min(0).optional(),
  imageWidth: z.number().positive().optional(),
  imageHeight: z.number().positive().optional(),
  /**
   * Render tier:
   *   - 'preview' → 1K (cheap/fast, used for in-editor previews and mixing).
   *   - 'final'   → 2K (default, what users save/print).
   */
  resolution: z.enum(['preview', 'final']).default('final'),
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
      templateIds,
      intensity,
      subjectName,
      isPet,
      subjects,
      selectedSubjectIndex,
      resolution,
    } = req.body as z.infer<typeof applySchema>;

    // Resolve template objects; reject unknown IDs up front so the client gets
    // a precise error rather than a generic fal.ai failure.
    const resolved: TributeTemplate[] = [];
    for (const id of templateIds) {
      const t = LAUNCH_TEMPLATES.find((x) => x.id === id);
      if (!t) throw errors.templateNotFound();
      resolved.push(t);
    }

    const subjectDescription = buildSubjectDescription({
      subjectName,
      isPet,
      subjects,
      selectedSubjectIndex,
    });

    // Add the "only apply to X, leave everyone else unchanged" coda whenever
    // we have ANY anchor to a specific subject — either a positional hint
    // from SAM detection (2+ subjects selected) OR a caller-supplied name
    // (e.g. the Reunite flow sends a placement-derived description). Without
    // one or the other, there's no single person to pin the effect to.
    const haveSubjectContext =
      (!!subjects && subjects.length >= 2 && typeof selectedSubjectIndex === 'number') ||
      !!(subjectName && subjectName.trim().length > 0);

    const prompt = combineTemplatePrompts({
      templates: resolved,
      subjectDescription,
      intensity,
      haveSubjectContext,
    });

    // If only "no effects" was selected, skip the AI call entirely and echo
    // the source image back. The web caches this so the preview is instant.
    if (prompt === NO_EFFECT_SENTINEL) {
      ok(res, {
        imageUrl,
        prompt: '(no effect)',
        templateIds,
        intensity,
        subjectDescription,
        resolution,
        skipped: true,
      });
      return;
    }

    const falResolution = resolution === 'preview' ? '1K' : '2K';
    logger.info(
      { templateIds, subjectDescription, haveSubjectContext, resolution: falResolution },
      'applying templates',
    );

    const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
      input: {
        prompt,
        image_urls: [imageUrl],
        resolution: falResolution,
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
      templateIds,
      intensity,
      subjectDescription,
      resolution,
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
  placement: z.enum(['left', 'right', 'behind', 'front']),
  subjectName: z.string().max(120).optional(),
  isPet: z.boolean().default(false),
  sizeAdjustment: z.number().min(0.5).max(2.0).default(1.0),
});

const PLACEMENT_INSTRUCTIONS: Record<Placement, string> = {
  left: 'Place the person from the second image on the left side of the group in the first image',
  right:
    'Place the person from the second image on the right side of the group in the first image',
  behind:
    'Place the person from the second image standing behind the group in the first image, slightly visible between or above other people',
  front:
    'Place the person from the second image in the foreground, in front of the group in the first image, closer to the camera than the other people. They should be positioned in the front-center of the image, slightly in front of and between the existing people. They must NOT be behind anyone — they are the closest person to the camera.',
};

function getScaleInstruction(scaleValue: number): string {
  if (scaleValue < 0.85) return 'Make the added person noticeably smaller than they appear in their original photo, as if they are standing slightly further back or are shorter than the others.';
  if (scaleValue < 0.95) return 'Make the added person slightly smaller than they appear in their original photo.';
  if (scaleValue > 1.15) return 'Make the added person noticeably larger than they appear in their original photo, as if they are closer to the camera or taller than the others.';
  if (scaleValue > 1.05) return 'Make the added person slightly larger than they appear in their original photo.';
  return '';
}

spikeRouter.post('/merge', validateBody(mergeSchema), async (req, res, next) => {
  try {
    const { mainPhotoUrl, lovedOnePhotoUrl, placement, subjectName, isPet, sizeAdjustment } =
      req.body as z.infer<typeof mergeSchema>;

    const subjectDescription = subjectName
      ? subjectName
      : isPet
        ? 'the pet'
        : 'the person';

    // Structured multi-section prompt. Nano Banana 2's biggest weakness in
    // merges has been leaving the added subject lit by the LIGHT OF THEIR
    // ORIGINAL PHOTO — so they look pasted in. We address that head-on with
    // explicit, named lighting dimensions the model must match (exposure,
    // color temperature, direction of light, shadow quality, edge quality),
    // plus explicit permission to repaint the face's lighting while locking
    // the face's features.
    const promptParts = [
      `Take the first image as the main scene. Take ${subjectDescription} from the second image and composite them into the main scene. ${PLACEMENT_INSTRUCTIONS[placement]}.`,
      `PHOTOGRAPHIC LIGHTING INTEGRATION — make ${subjectDescription} look like they were physically present in the main scene when the photo was taken. The second image was shot under different light than the main scene, so you MUST relight ${subjectDescription} (body AND face) to match the main scene across ALL of these dimensions:`,
      `(1) BRIGHTNESS AND EXPOSURE — match the overall exposure level of the main scene. ${subjectDescription} must be lit at the same brightness as the other people and objects. They must NOT glow, appear brighter than the scene, or sink into shadow unnaturally. Their histogram should fit into the main photo's exposure range.`,
      `(2) COLOR TEMPERATURE AND WHITE BALANCE — match the warm/cool tint of the main photo exactly. If the main scene is warm (golden-hour sunlight, incandescent indoor), shift ${subjectDescription}'s skin tone, hair, and clothing to carry the same warm cast. If the scene is cool (overcast, blue hour, shade), shift them to the same cool cast. No orange faces in a blue scene; no blue faces in a warm scene.`,
      `(3) DIRECTION OF LIGHT — study where the main light source is coming from in the first image by looking at shadows on other people, objects, trees, buildings, and the ground. Apply IDENTICAL directional lighting to ${subjectDescription}: highlights on the side facing the light, shadows on the opposite side. Their face must be lit from the same angle as other faces in the scene. Do NOT keep the light direction from the second image.`,
      `(4) SHADOW QUALITY — match the hardness and depth of shadows in the main scene. Harsh sunlight → crisp-edged shadows on ${subjectDescription}. Overcast/diffused/indoor → soft wrapping shadows. The shadow ${subjectDescription} casts on the ground or nearby surfaces must match the length and direction of other shadows in the scene.`,
      `(5) EDGE AND TEXTURE — match the sharpness, film grain, noise level, and focus quality of the main photo. Feather ${subjectDescription}'s silhouette so it blends naturally into the surroundings. No crisp cut-out outline. If the main photo is slightly soft or grainy, match that exactly.`,
      `IDENTITY PRESERVATION — ${subjectDescription}'s facial FEATURES must stay exactly as they appear in the second image: same face shape, same eye color and eye shape, same nose, same mouth, same hair color and hair style, same expression, same distinguishing marks. They must be clearly recognizable as the same person.`,
      `RELIGHTING PERMISSION — to achieve the lighting integration above, you ARE permitted and required to repaint the lighting on ${subjectDescription}'s face: add shadows across one side of the face, shift skin tone toward the scene's color temperature, add ambient color cast from the surroundings, adjust highlight intensity. You are NOT permitted to change the underlying features (shape/eyes/nose/mouth/hair/expression).`,
      'PRESERVATION OF OTHERS — every other person, pet, background element, and object in the main photo must remain exactly as they are, unchanged.',
      // Bug #14 — prevent duplicates
      `NO DUPLICATION — add ${subjectDescription} into the scene exactly ONE time. The result must contain exactly one instance of ${subjectDescription}. Do NOT add them more than once. If you think ${subjectDescription} already appears in the main photo, still add them only once at the chosen placement — no second copy elsewhere.`,
      'The final result must look like a single authentic photograph taken at one moment, with one camera, under one consistent light — not two photos blended together.',
    ];

    const scaleInstruction = getScaleInstruction(sizeAdjustment);
    if (scaleInstruction) {
      promptParts.push(scaleInstruction);
    }

    const prompt = promptParts.join('\n\n');

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
