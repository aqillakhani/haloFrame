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
import { annotateSubject } from '../services/subjectAnnotator.js';

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
  /**
   * When true, also compute a transparent cutout of the DOMINANT subject
   * (largest by pixel count — subjects[0] after sort) by using that subject's
   * mask as an alpha channel, upload the resulting PNG, and return its URL as
   * `cutoutUrl`. Used by the Reunite flow to show a background-stripped
   * preview of the loved one while the user picks placement + size.
   */
  returnCutout: z.boolean().default(false),
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
    const { imageUrl, detectPets, returnCutout } = req.body as z.infer<typeof segmentSchema>;

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

    let cutoutUrl: string | undefined;
    if (returnCutout) {
      try {
        cutoutUrl = await buildSubjectCutout(imageUrl);
      } catch (cutoutErr) {
        // Non-fatal — the client falls back to the raw photo. Log and continue.
        logger.warn({ cutoutErr }, 'subject cutout failed; returning without cutoutUrl');
      }
    }

    ok(res, {
      imageWidth,
      imageHeight,
      subjects: filtered,
      cutoutUrl,
    });
  } catch (err) {
    logger.error({ err }, 'spike segment failed');
    next(err);
  }
});

/**
 * Background-removal cutout for the Reunite placement preview.
 *
 * Previously we synthesized a cutout by compositing SAM 3's mask over the
 * source image with sharp. That code ran without errors but produced PNGs
 * whose alpha channel effectively stayed opaque in the browser (first user
 * test saw the raw photo still on screen). Swapped to
 * `fal-ai/imageutils/rembg`, a purpose-built background remover: pass an
 * image URL, get back an RGBA PNG URL with the subject isolated. Response
 * shape matches the other fal endpoints in this router so
 * `extractFirstImageUrl` picks it up unchanged.
 */
async function buildSubjectCutout(sourceImageUrl: string): Promise<string> {
  const result = await fal.subscribe('fal-ai/imageutils/rembg', {
    input: { image_url: sourceImageUrl },
    logs: false,
  });
  const url = extractFirstImageUrl(result.data);
  if (!url) throw new Error('rembg returned no image');
  return url;
}

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
  /**
   * SAM mask URL for this subject. When present on non-target subjects, the
   * server runs a post-process pass: composite the original non-target
   * pixels back over the Nano Banana 2 edit using the mask as a feathered
   * alpha. Guarantees non-selected people/pets are pixel-identical to the
   * source image regardless of how aggressively the model tried to bleed
   * the effect across them.
   */
  maskUrl: z.string().url().optional(),
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
  /**
   * Optional placement context forwarded from the Reunite flow. When present,
   * drives wings z-order: `front` means the subject is in the foreground so
   * wings render in front of others; any other value keeps the default
   * wings-behind-everyone treatment from the template prompt.
   */
  placement: z.enum(['left', 'right', 'behind', 'front']).optional(),
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
  imageWidth?: number;
  imageHeight?: number;
}): string {
  const { subjectName, isPet, subjects, selectedSubjectIndex, imageWidth, imageHeight } = args;
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

/**
 * Pixel-perfect preservation of non-target subjects.
 *
 * Nano Banana 2 sometimes bleeds effects (wings, halos, glows) onto
 * adjacent people even when the prompt explicitly scopes the edit to a
 * single subject. The set-of-mark reference image + "ONLY to X" directives
 * reduce this but don't eliminate it. This post-processing pass makes the
 * guarantee pixel-exact: we rebuild the output by taking the edit for the
 * target region and the ORIGINAL pixels for every non-target region.
 *
 * Algorithm:
 *   1. Fetch every non-target mask in parallel (SAM 3 masks are grayscale
 *      PNGs where the subject area is white).
 *   2. OR them together into one combined "keep from original" mask.
 *   3. Feather the mask edges with a Gaussian blur so the seam between
 *      original and edited pixels is imperceptible.
 *   4. Resize the original image + combined mask to match the NB2 output
 *      dimensions (NB2's 1K/2K resolution settings can change image size).
 *   5. Build an RGBA image = original RGB + combined mask as alpha, then
 *      composite it over the NB2 edit. Anywhere the mask is opaque, the
 *      original pixels win; everywhere else, the edit wins.
 *
 * If any step fails we log and fall back to the unprocessed edit — better
 * to ship the bled edit than to error out the whole request.
 */
async function preserveNonTargetSubjects(args: {
  originalImageUrl: string;
  editedImageUrl: string;
  nonTargetMaskUrls: string[];
}): Promise<string | null> {
  try {
    const [originalResp, editedResp, ...maskResps] = await Promise.all([
      fetch(args.originalImageUrl),
      fetch(args.editedImageUrl),
      ...args.nonTargetMaskUrls.map((url) => fetch(url)),
    ]);
    if (!originalResp.ok || !editedResp.ok) {
      throw new Error(
        `preserve: fetch failed original=${originalResp.status} edited=${editedResp.status}`,
      );
    }
    for (const m of maskResps) {
      if (!m.ok) throw new Error(`preserve: mask fetch failed ${m.status}`);
    }

    const originalBuf = Buffer.from(await originalResp.arrayBuffer());
    const editedBuf = Buffer.from(await editedResp.arrayBuffer());
    const maskBufs = await Promise.all(
      maskResps.map(async (r) => Buffer.from(await r.arrayBuffer())),
    );

    const editedMeta = await sharp(editedBuf).metadata();
    const W = editedMeta.width;
    const H = editedMeta.height;
    if (!W || !H) throw new Error('preserve: edit output has no dimensions');

    // Extract each mask's red channel (SAM masks are grayscale; any channel
    // gives the foreground signal) and resize to match the NB2 output.
    const resizedMasks = await Promise.all(
      maskBufs.map(async (buf) =>
        sharp(buf)
          .resize(W, H, { fit: 'fill' })
          .extractChannel('red')
          .toBuffer(),
      ),
    );

    // OR the masks together. Reading raw bytes is the simplest way to
    // combine — each pixel becomes the max of the inputs.
    const combined = Buffer.alloc(W * H);
    for (const m of resizedMasks) {
      for (let i = 0; i < combined.length; i++) {
        const v = m[i] ?? 0;
        if (v > (combined[i] ?? 0)) combined[i] = v;
      }
    }

    // Feather the mask so the seam between original and edited regions is
    // invisible. 6px sigma is enough to hide it on 1K/2K outputs without
    // leaking the mask into neighboring subjects.
    const featheredMask = await sharp(combined, {
      raw: { width: W, height: H, channels: 1 },
    })
      .blur(6)
      .toBuffer();

    // Resize the ORIGINAL image to NB2's output dimensions so the pixels
    // align with the edit. Using 'fill' because we want exact pixel match
    // to the edit — aspect changes are already handled by NB2's aspect
    // ratio setting, which we set to 'auto'.
    const originalResized = await sharp(originalBuf)
      .resize(W, H, { fit: 'fill' })
      .removeAlpha()
      .toBuffer();

    // Build RGBA: original RGB + feathered mask as alpha.
    const originalWithAlpha = await sharp(originalResized)
      .ensureAlpha()
      .joinChannel(featheredMask, {
        raw: { width: W, height: H, channels: 1 },
      })
      .png()
      .toBuffer();

    // Composite original-with-alpha OVER the edit. Where mask alpha is
    // opaque, original shows through; where transparent, edit shows.
    const finalBuf = await sharp(editedBuf)
      .composite([{ input: originalWithAlpha, blend: 'over' }])
      .png()
      .toBuffer();

    const file = new File([new Uint8Array(finalBuf)], 'bleed-preserved.png', {
      type: 'image/png',
    });
    return await fal.storage.upload(file);
  } catch (err) {
    logger.warn({ err }, 'preserveNonTargetSubjects failed; returning null');
    return null;
  }
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
      imageWidth,
      imageHeight,
      resolution,
      placement,
    } = req.body as z.infer<typeof applySchema>;

    // Resolve template objects; reject unknown IDs up front so the client gets
    // a precise error rather than a generic fal.ai failure.
    const resolved: TributeTemplate[] = [];
    for (const id of templateIds) {
      const t = LAUNCH_TEMPLATES.find((x) => x.id === id);
      if (!t) throw errors.templateNotFound();
      resolved.push(t);
    }

    const positionalDescription = buildSubjectDescription({
      subjectName,
      isPet,
      subjects,
      selectedSubjectIndex,
      imageWidth,
      imageHeight,
    });

    // Add the "only apply to X, leave everyone else unchanged" coda whenever
    // we have ANY anchor to a specific subject — either a positional hint
    // from SAM detection (2+ subjects selected) OR a caller-supplied name
    // (e.g. the Reunite flow sends a placement-derived description). Without
    // one or the other, there's no single person to pin the effect to.
    const haveSubjectContext =
      (!!subjects && subjects.length >= 2 && typeof selectedSubjectIndex === 'number') ||
      !!(subjectName && subjectName.trim().length > 0);

    // Visual set-of-mark annotation. For multi-person photos where SAM has
    // detected 2+ subjects, we render a bright cyan ring around the selected
    // subject on a copy of the source image and pass it to Nano Banana 2 as
    // a reference. Text-only spatial anchors ("the third person from the
    // left") get overridden by the model's semantic priors on prompts that
    // require removing/relocating a person (Among the Stars, Classic
    // Memorial). A visual marker is pixel-obvious and doesn't compete with
    // the priors — it just tells the model exactly who to edit.
    let annotatedImageUrl: string | undefined;
    if (
      subjects &&
      subjects.length >= 2 &&
      typeof selectedSubjectIndex === 'number' &&
      subjects[selectedSubjectIndex]
    ) {
      try {
        const annotated = await annotateSubject({
          sourceImageUrl: imageUrl,
          bbox: subjects[selectedSubjectIndex].bbox,
        });
        annotatedImageUrl = annotated.annotatedImageUrl;
      } catch (err) {
        logger.warn({ err }, 'subject annotation failed; falling back to positional description');
      }
    }

    // When we have a marker, the effective subject description becomes the
    // marker itself — pixel-obvious, overrides priors. We still include the
    // positional description as a belt-and-suspenders for the rare case
    // where the model's attention fails on the cyan marker.
    const subjectDescription = annotatedImageUrl
      ? `the person clearly marked with a bright cyan ring and cyan dot in the second reference image (they are also ${positionalDescription})`
      : positionalDescription;

    const basePrompt = combineTemplatePrompts({
      templates: resolved,
      subjectDescription,
      intensity,
      haveSubjectContext,
      placement,
    });

    // Prepend an explicit two-image directive when annotation is in play,
    // so the model knows: (1) image 1 is the clean source to base the edit
    // on; (2) image 2 is an annotated reference for subject identification
    // only; (3) the output must not contain the cyan marker.
    const prompt = annotatedImageUrl
      ? `You are given TWO input images.\n\nIMAGE 1 is the clean source photo. Your output must be based on IMAGE 1 — keep its composition, lighting, and every non-target person pixel-identical to IMAGE 1.\n\nIMAGE 2 is the same photo with a bright cyan ring and cyan dot drawn over ONE person. That marker identifies the target subject for every memorial effect in the instructions below. The cyan marker is NOT part of the image — it is annotation. Your final output must NOT contain any cyan ring or cyan dot; those pixels must be rendered as they appear in IMAGE 1 (i.e. as if no marker existed).\n\n${basePrompt}`
      : basePrompt;

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
      {
        templateIds,
        subjectDescription,
        haveSubjectContext,
        annotated: !!annotatedImageUrl,
        resolution: falResolution,
      },
      'applying templates',
    );

    const imageUrlsForFal = annotatedImageUrl ? [imageUrl, annotatedImageUrl] : [imageUrl];

    const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
      input: {
        prompt,
        image_urls: imageUrlsForFal,
        resolution: falResolution,
        output_format: 'png',
        aspect_ratio: 'auto',
      },
      logs: false,
    });

    const url = extractFirstImageUrl(result.data);
    if (!url) throw errors.fal('Nano Banana 2 returned no image');

    // Pixel-perfect bleed prevention. Only runs for final renders of
    // multi-subject photos where the client supplied non-target masks.
    // Previews are skipped to keep the editor responsive — bleed there
    // is easier to notice and re-select, and the final pass will still
    // clean it up on save.
    let finalUrl = url;
    if (
      resolution === 'final' &&
      subjects &&
      subjects.length >= 2 &&
      typeof selectedSubjectIndex === 'number'
    ) {
      const nonTargetMaskUrls = subjects
        .map((s, i) => (i === selectedSubjectIndex ? null : s.maskUrl))
        .filter((m): m is string => !!m);
      if (nonTargetMaskUrls.length > 0) {
        const preserved = await preserveNonTargetSubjects({
          originalImageUrl: imageUrl,
          editedImageUrl: url,
          nonTargetMaskUrls,
        });
        if (preserved) {
          finalUrl = preserved;
          logger.info(
            { nonTargetCount: nonTargetMaskUrls.length },
            'applied bleed preservation pass',
          );
        }
      }
    }

    ok(res, {
      imageUrl: finalUrl,
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
  /**
   * Transparent-background version of the loved one. Currently IGNORED by
   * the merge handler — retained in the schema for backward compatibility
   * with clients that still send it for the placement preview overlay.
   * Earlier the server used this to build a pre-composite + refine pass,
   * but NB2's edit model interprets a pre-composited input as "preserve,
   * don't recompose," which produced a pasted-on-top result. The two-image
   * path below (main + loved-one as separate inputs) is the reliable merge.
   */
  lovedOneCutoutUrl: z.string().url().optional(),
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

function getScaleInstruction(scaleValue: number, subjectDescription: string): string {
  // User slider defaults to 1.0 ("same height as existing people") and
  // ranges 0.7–1.4. The second image is typically a close-up portrait;
  // without an explicit perspective anchor, Nano Banana 2 treats that
  // close-up as the intended camera distance and renders the merged
  // person 40–60% bigger than the existing group. The anchor below
  // re-frames the task: the subject is standing at the SAME distance
  // from the camera as the others, so their on-frame height should
  // match theirs regardless of how the portrait was originally shot.
  const pct = Math.round(scaleValue * 100);
  const perspective = `PERSPECTIVE: ${subjectDescription} is standing at the same distance from the camera as the other people in the main scene. The portrait in the second image was shot at close range, but that does NOT mean they should appear close-up in the merged result. Render them at the same apparent camera distance as the existing people — their head, torso, and full body should occupy the same on-frame size as the others.`;
  if (scaleValue >= 0.95 && scaleValue <= 1.05) {
    return [
      perspective,
      `SIZE (critical): ${subjectDescription}'s head-to-feet height in the final image must match the average head-to-feet height of the existing people in the main scene, within 5%. If the existing people are small because they're far from camera, render ${subjectDescription} at that same small size. They are one member of the group, not a featured subject.`,
    ].join(' ');
  }
  const direction = scaleValue < 1.0 ? 'smaller' : 'larger';
  const how =
    scaleValue < 1.0
      ? 'as if shorter or standing slightly further back than the others'
      : 'as if taller or standing slightly closer to the camera than the others';
  return [
    perspective,
    `SIZE (critical): ${subjectDescription}'s head-to-feet height in the final image must be approximately ${pct}% of the average head-to-feet height of the existing people in the main scene — noticeably ${direction} (${how}). Match this proportion precisely; do not enlarge them past this percentage.`,
  ].join(' ');
}

spikeRouter.post('/merge', validateBody(mergeSchema), async (req, res, next) => {
  try {
    const {
      mainPhotoUrl,
      lovedOnePhotoUrl,
      placement,
      subjectName,
      isPet,
      sizeAdjustment,
    } = req.body as z.infer<typeof mergeSchema>;

    const subjectDescription = subjectName
      ? subjectName
      : isPet
        ? 'the pet'
        : 'the person';

    // Two-image merge: give Nano Banana 2 the main photo + the loved-one
    // photo and let it do the full merge (position, lighting, shadows,
    // edges) in one pass. This is the reliable path — an earlier attempt
    // to pre-composite the cutout and ask NB2 to "refine" consistently
    // returned pasted-on-top output because the edit model treats a
    // single pre-composited input as "preserve, don't recompose." The
    // two-image path lets NB2 do the merge work it's designed for; we
    // steer position and size through explicit prompt directives.
    // Prompt contract (refined 2026-04-16 after user feedback on the
    // earlier GROUND-PLANE version, which caused two bugs:
    //   1. NB2 generated full bodies (legs, feet) for the loved one
    //      even when the main scene cropped the others at the waist.
    //   2. NB2 placed her at a different depth (behind the group) but
    //      had her arm reach across a neighbor's body.
    // The replacement keys this to LATERAL PLACEMENT instead of ground
    // plane: she stands next to the neighbor at the same depth with
    // natural spacing (a small gap, not touching), matching body crop
    // (shows only what the neighbor shows), and arms stay in her own
    // lateral column.
    //   IDENTITY LOCK — face, expression, gaze, hair, and VISIBLE
    //                   clothing stay identical to the second image.
    //                   Does NOT lock body pose (the portrait usually
    //                   shows only head-and-shoulders, so locking a
    //                   body that isn't there forced stiff output).
    //   LATERAL PLACE — next to the neighbor at the placement, same
    //                   depth, same body crop, no arm overlap.
    //   LIGHTING      — relight to match the scene's palette and
    //                   light direction; cast a shadow ONLY if the
    //                   scene shows the other people casting shadows
    //                   (conditional so we don't force a shadow on
    //                   waist-up scenes).
    //   RECOGNIZABILITY FLOOR — even on silhouette scenes, the face
    //                   stays identifiable. Identity > lighting.
    const promptParts = [
      `GAZE AND HEAD ORIENTATION (rule #1, strictest): ${subjectDescription}'s pupils, eyes, and head orientation in the OUTPUT must match the PORTRAIT pixel-for-pixel. In the portrait their pupils point straight out of the image plane at the viewer (the camera lens). In the output their pupils must continue to point straight out of the output image plane at the viewer. Do NOT rotate their head. Do NOT shift their pupils to their left or right. Do NOT redirect their eyes toward the sun, horizon, the other people, or anything in the scene. Even though they are standing next to the group, they continue to face the camera exactly as in the portrait — their head and eyes are aimed at the viewer, not inward at the group. A deviation in their pupil position or head angle between the portrait and the output is a defect to avoid.`,
      `Take the first image as the main scene. Take ${subjectDescription} from the second image and merge them into the main scene, producing a single natural photograph. ${PLACEMENT_INSTRUCTIONS[placement]}.`,
      `IDENTITY LOCK — these features of ${subjectDescription} must match the second image exactly, as if the same person were photographed twice on the same day:`,
      `- Face: identical shape, eyes, nose, mouth, cheeks, jawline, and any distinguishing marks.`,
      `- Expression: the same expression captured in the portrait. Same smile (or no smile), same eye openness, same brow position, same mouth shape. Do NOT adjust their expression to match the mood of the scene.`,
      `- Eyes and gaze: pupils in the exact same position as the portrait. If the portrait has them looking at the camera, keep them looking at the camera — do NOT shift the pupils toward the group, the sun, the horizon, or anything else. Head angle in the output is identical to the portrait; do not turn their head to face the group.`,
      `- Hair: same style, shape, length, parting, and color.`,
      `- Clothing visible in the portrait: the garments shown in the portrait must be identical in the output — same pattern, same colors, same cut. Do NOT swap them for clothing worn by others in the scene.`,
      `- Skin tone and identifying features: preserved.`,
      `LATERAL PLACEMENT AND FRAMING — ${subjectDescription} is one more member of the group, standing right next to them:`,
      `- ${subjectDescription} stands directly beside the existing people at the chosen placement — with natural spacing, close enough to feel part of the group, with a small gap so neither figure occludes the other — at the SAME depth from the camera. They are beside the group, not set back behind it and not pushed forward in front of it (unless the placement explicitly says front or behind).`,
      `- MATCH THE NEIGHBOR'S CROP: the visible portion of ${subjectDescription}'s body must match the visible portion of the person standing next to them. If the main scene shows the neighboring people from the waist up, show ${subjectDescription} from the waist up — do NOT generate legs, feet, or body parts that the neighboring people don't also have visible. If the main scene shows the neighbors from the shoulders up, show ${subjectDescription} from the shoulders up. If the main scene shows full bodies from head to feet, show ${subjectDescription} full body too, continuing their clothing style.`,
      `- NO REACHING ACROSS: ${subjectDescription}'s arms, hands, and body stay within their own lateral column next to the neighbor. Their hand does not cross in front of or behind the adjacent person. If the portrait shows their arms at their sides, keep them at their sides. Generate any unseen arms in a natural at-their-sides position; do not pose them reaching toward or overlapping the group.`,
      `- BODY POSITION NEAR THE GROUP, HEAD POSITION FROM THE PORTRAIT: ${subjectDescription}'s TORSO is positioned beside the group, but their HEAD and EYES remain oriented exactly as in the portrait (re-read rule #1 at the top). Their body being next to the group does NOT mean their face turns toward the group. Their face stays aimed at the camera / viewer exactly as in the portrait, even though their body is next to the others.`,
      `LIGHTING AND EDGE INTEGRATION:`,
      `- Relight ${subjectDescription}'s face and body: shift exposure, color temperature, and directional shading toward the main scene's light. Warm scene → warm cast on them. Light direction from the scene → matching shadow direction on them. You are repainting illumination, not re-drawing them — the LOCKED features above remain unchanged.`,
      `- Edge blend: no visible paste seam. Match the scene's focus, grain, and noise at the outline where ${subjectDescription} meets the background.`,
      `- Shadow: ONLY if the main scene shows ground beneath the other people and they cast visible shadows, add a matching shadow from ${subjectDescription} in the same direction and softness. If the scene crops above the ground or no shadows are visible in the scene, do NOT force one.`,
      `RECOGNIZABILITY FLOOR — even when the scene is heavily back-lit, silhouette, sunset, or dim interior, relight ${subjectDescription} toward the scene's palette but KEEP their face and features clearly visible and identifiable. Do not collapse their face into pure silhouette. Priority: identity first, lighting realism second.`,
      `PRESERVE THE REST OF THE SCENE — every other person, pet, and background element in the main photo stays exactly as in the first image.`,
      `NO DUPLICATION — exactly one instance of ${subjectDescription} in the output.`,
    ];

    promptParts.push(getScaleInstruction(sizeAdjustment, subjectDescription));
    promptParts.push(
      `Output: a single natural photograph where ${subjectDescription} stands next to the neighboring person with natural spacing — close enough to feel part of the group, with a small gap so neither figure occludes the other — same body crop as the neighbor, same depth, no reaching across — with the exact face, expression, gaze direction, hair, and visible clothing from the second image, lit to match the scene.`,
    );

    const prompt = promptParts.join('\n\n');

    const nb2Start = Date.now();
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
    const nb2Ms = Date.now() - nb2Start;

    const mergedUrl = extractFirstImageUrl(result.data);
    if (!mergedUrl) throw errors.fal('Nano Banana 2 returned no merge image');

    // Face-swap post-pass: NB2 produces a well-integrated body/pose/scene
    // but re-renders the face from its own priors — identity always drifts
    // slightly regardless of prompt pressure. Face-swap copies the actual
    // face pixels from the original portrait onto the merged scene,
    // preserving lighting adaptation from NB2 while restoring true
    // identity. Graceful fallback to the raw merge if face-swap fails
    // (e.g., no face detected in a heavy silhouette scene).
    const swapStart = Date.now();
    const finalUrl = await applyFaceSwap(lovedOnePhotoUrl, mergedUrl);
    const swapMs = Date.now() - swapStart;

    logger.info(
      { nb2Ms, swapMs, totalMs: nb2Ms + swapMs, placement },
      'merge timing',
    );

    ok(res, { imageUrl: finalUrl, prompt, placement });
  } catch (err) {
    logger.error({ err }, 'spike merge failed');
    next(err);
  }
});

/**
 * Face-swap post-pass. Takes the merged scene from Nano Banana 2 and
 * transplants the original portrait's face onto it, so the output has
 * pixel-fidelity identity even though the body/pose/lighting came from
 * NB2's generative pass.
 *
 * Uses fal-ai/face-swap (a standard InsightFace-based swapper). On
 * failure (no face detected, quota, etc.) returns the unswapped merge
 * so the user still gets a result.
 */
async function applyFaceSwap(
  sourcePortraitUrl: string,
  targetMergedUrl: string,
): Promise<string> {
  try {
    const result = await fal.subscribe('fal-ai/face-swap', {
      input: {
        base_image_url: targetMergedUrl,
        swap_image_url: sourcePortraitUrl,
      },
      logs: false,
    });
    const url = extractFirstImageUrl(result.data);
    if (!url) {
      logger.warn('face-swap returned no image; returning raw merge');
      return targetMergedUrl;
    }
    logger.info('face-swap post-pass succeeded');
    return url;
  } catch (err) {
    logger.warn({ err }, 'face-swap failed; returning raw merge');
    return targetMergedUrl;
  }
}

// -----------------------------------------------------------------------------
// GET /api/spike/templates — return launch templates from shared constants
// -----------------------------------------------------------------------------
spikeRouter.get('/templates', (_req, res) => {
  const templates: TributeTemplate[] = LAUNCH_TEMPLATES;
  ok(res, { templates });
});
