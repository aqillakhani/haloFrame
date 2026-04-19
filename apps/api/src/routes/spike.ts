// =============================================================================
// HaloFrame API — /api/spike/*
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
} from '@haloframe/shared';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { errors } from '../lib/errors.js';
import { ok } from '../lib/response.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { checkCredits, spendCredits } from '../services/entitlements.js';
import { trackPreview } from '../services/previewLimiter.js';
import { combineTemplatePrompts, NO_EFFECT_SENTINEL } from '../services/templateCombiner.js';
import { annotateSubject } from '../services/subjectAnnotator.js';
import {
  findAddedSubject,
  measureSubjects,
} from '../services/mergeSizeEnforcer.js';
import {
  preservePeopleFromMain,
  selectPreservableMainSubjects,
} from '../services/mergeNonTargetPreserver.js';

// Conditional auth: /apply handles both free 1K previews and paid 2K
// final renders. Previews stay unauthenticated so an unsigned-in user
// can explore templates before hitting the paywall on save. Final
// renders trip requireAuth so the credit check has a user to bill.
async function requireAuthForFinalApply(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const body = req.body as { resolution?: string } | undefined;
  if (body?.resolution === 'final') {
    return requireAuth(req, res, next);
  }
  next();
}

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
  /**
   * Stable client-supplied save identifier. Used ONLY when resolution='final'
   * as the dedupe key for the credit ledger — a double-clicked Save button
   * cannot double-charge because the unique index on (user_id, dedupe_key)
   * in credit_ledger rejects the second spend. Optional; when absent the
   * spend proceeds without dedupe (first-to-land wins).
   */
  saveId: z.string().min(1).max(64).optional(),
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

spikeRouter.post(
  '/apply',
  validateBody(applySchema),
  requireAuthForFinalApply,
  async (req, res, next) => {
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
      saveId,
    } = req.body as z.infer<typeof applySchema>;

    // The middleware above guarantees req.user is set whenever
    // resolution === 'final'. We defer the credit pre-check until after
    // prompt resolution so the NO_EFFECT early-return path (which does
    // zero server work) can complete without billing the user.
    const billing =
      resolution === 'final' ? { userId: req.user!.id } : null;

    // Preview rate limit: Option C says exploration is free, so we don't
    // charge credits for 1K previews. But we DO need to bound how many
    // previews a single upload can drive — otherwise a pathological user
    // could run hundreds of renders without ever paying. Saves (final
    // resolution) bypass the limiter; they're already paying.
    if (resolution === 'preview') {
      const preview = trackPreview(imageUrl);
      if (preview.exceeded) {
        logger.warn(
          { imageUrl, count: preview.count, limit: preview.limit },
          'preview rate limit exceeded',
        );
        throw errors.rateLimited();
      }
    }

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
    // No credits charged — the user is saving the source frame as-is and
    // the server did no fal work.
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

    // Credit pre-check fires here — after NO_EFFECT has had its chance to
    // short-circuit, before the cost-bearing fal call. Insufficient balance
    // throws 402 with code 'insufficient_credits'; the web catches that and
    // routes to the paywall.
    if (billing) {
      const check = await checkCredits(billing.userId, 'apply_final');
      if (!check.allowed) throw errors.paymentRequired();
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

    // Charge the credit only after the full pipeline (fal call + bleed
    // preservation) succeeded. If spendCredits itself fails — e.g. a
    // double-click hit the dedupe key — we still have the finalized URL
    // to hand back, but the user's balance is unchanged and the client
    // sees a 402 it can reconcile on next /status fetch.
    let creditsRemaining: number | undefined;
    if (billing) {
      creditsRemaining = await spendCredits(billing.userId, 'apply_final', {
        dedupeKey: saveId,
      });
    }

    ok(res, {
      imageUrl: finalUrl,
      prompt,
      templateIds,
      intensity,
      subjectDescription,
      resolution,
      creditsRemaining,
    });
  } catch (err) {
    logger.error({ err }, 'spike apply failed');
    next(err);
  }
  },
);

// -----------------------------------------------------------------------------
// POST /api/spike/merge — merge two photos (Reunite flow)
//
// Pipeline (2026-04-17, after the composite-only pivot was reverted on user
// feedback: pure composite couldn't do body extension or lighting adaptation,
// which are the "natural" part of the user's intent):
//
//   1. NB2 merge — scene integration, relighting, body extension where the
//      scene needs it. Identity-lock prompt pins face/expression/clothes/
//      hair/eye-color to the portrait; freedom prompt explicitly ALLOWS
//      lighting + shadow + body changes.
//   2. Non-target preservation — composite main-photo pixels back through
//      each main subject's SAM mask (alpha-channel read, IoU-gated) so NB2
//      can't alter eyebrows/beards/etc on the existing group.
//   3. Face-swap — transplants the real portrait face pixels onto NB2's
//      subject, since NB2 always re-renders faces from its own priors.
//
// Size: NB2 doesn't honor the size % prompt reliably. We include it as a
// soft hint and log the actual vs requested for observability. No rescale
// post-process — the extract/resize/recomposite approach produced visible
// seams (the "box" artifact). Users who need precise size control will have
// to tolerate NB2's variance for now.
// -----------------------------------------------------------------------------
const mergeSchema = z.object({
  mainPhotoUrl: z.string().url(),
  lovedOnePhotoUrl: z.string().url(),
  /**
   * Transparent-background PNG of the loved one (rembg). Frontend sends it
   * for the placement preview overlay; /merge no longer uses it (NB2 reads
   * the raw portrait directly — the cutout-as-input path produced worse
   * results per NB2 prompt-pitfalls memory).
   */
  lovedOneCutoutUrl: z.string().url().optional(),
  placement: z.enum(['left', 'right', 'behind', 'front']),
  subjectName: z.string().max(120).optional(),
  isPet: z.boolean().default(false),
  sizeAdjustment: z.number().min(0.5).max(2.0).default(1.0),
  /**
   * Stable client-supplied merge identifier. Acts as the dedupe key in the
   * credit ledger so a double-click on "Place here" can't double-charge.
   * Optional; absence falls back to first-to-land wins.
   */
  saveId: z.string().min(1).max(64).optional(),
});

const PLACEMENT_INSTRUCTIONS: Record<Placement, string> = {
  left: 'Place the person from the second image on the left side of the group in the first image',
  right:
    'Place the person from the second image on the right side of the group in the first image',
  behind:
    'Place the person from the second image standing behind the group in the first image, slightly visible between or above other people',
  front:
    'Place the person from the second image in the foreground, in front of the group in the first image, closer to the camera than the other people.',
};

function buildSizeHint(scale: number, subjectDescription: string): string {
  const pct = Math.round(scale * 100);
  if (scale >= 0.95 && scale <= 1.05) {
    return `SIZE (soft hint): ${subjectDescription}'s head-to-feet height should approximately match the average head-to-feet height of the existing people. They are one member of the group, not a featured subject at a different scale.`;
  }
  const direction = scale < 1.0 ? 'smaller' : 'larger';
  const how =
    scale < 1.0
      ? 'as if shorter or standing slightly further back than the others'
      : 'as if taller or standing slightly closer to the camera than the others';
  return `SIZE (soft hint): ${subjectDescription}'s head-to-feet height should be approximately ${pct}% of the average head-to-feet height of the existing people — noticeably ${direction} (${how}).`;
}

spikeRouter.post(
  '/merge',
  requireAuth,
  validateBody(mergeSchema),
  async (req, res, next) => {
  try {
    const {
      mainPhotoUrl,
      lovedOnePhotoUrl,
      placement,
      subjectName,
      isPet,
      sizeAdjustment,
      saveId,
    } = req.body as z.infer<typeof mergeSchema>;

    // /merge is always cost-bearing (NB2 runs at 2K; there is no preview
    // mode). Auth is required unconditionally — the middleware above
    // guarantees req.user is set.
    const userId = req.user!.id;
    const check = await checkCredits(userId, 'merge');
    if (!check.allowed) throw errors.paymentRequired();

    const subjectDescription = subjectName
      ? subjectName
      : isPet
        ? 'the pet'
        : 'the person';

    // Prompt contract (2026-04-17 after user clarified: lock face, expression,
    // clothes, hair, eye color — but ALLOW lighting, shadow, and body extension).
    // Earlier iterations that over-locked body pose produced stiff outputs on
    // head-shot portraits; earlier iterations that under-locked clothes had
    // NB2 substituting scene clothing. This version separates LOCKED vs FREE
    // explicitly so the model has no ambiguity about which knob it can turn.
    const promptParts = [
      `Take the first image as the main scene. Take ${subjectDescription} from the second image and merge them into the main scene, producing a single natural photograph. ${PLACEMENT_INSTRUCTIONS[placement]}.`,

      `LOCKED (MUST NOT CHANGE) — these features of ${subjectDescription} must match the second image EXACTLY, as if the same person were photographed twice on the same day:`,
      `- Face: identical shape, eyes, nose, mouth, cheeks, jawline, and distinguishing marks.`,
      `- Expression: the EXACT expression captured in the portrait. Same smile (or no smile), same eye openness, same brow position, same mouth shape. Do NOT adjust their expression to match the scene's mood.`,
      `- Eyes: pupils and iris in the exact position and color as the portrait. If they look at the camera in the portrait, keep them looking at the camera.`,
      `- Hair: EXACT same style, shape, length, parting, and color.`,
      `- Clothing: the garments visible in the portrait must appear in the output with the SAME pattern, SAME colors, SAME cut, SAME fabric. Do NOT substitute clothing worn by others in the scene. Do NOT change the clothing style to match the scene.`,
      `- Skin tone and identifying features: preserved.`,

      `FREE (MAY CHANGE to integrate into the scene):`,
      `- Lighting on ${subjectDescription}: relight the face and body to match the scene's light — adjust exposure, color temperature, and directional shading. Warm scene → warm cast. Light direction from scene → matching shadow direction on them. You are repainting illumination, NOT redrawing the LOCKED features above.`,
      `- Shadow: if the main scene shows the other people casting shadows on the ground, add a matching shadow from ${subjectDescription} in the same direction and softness.`,
      `- Body extension: if the portrait shows ${subjectDescription} from the waist up or shoulders up, and the main scene shows the other people full-body (head to feet), extend ${subjectDescription}'s body downward naturally. Continue the portrait's clothing style into the extended body — same colors, same pattern, same cut. If the scene shows neighbors waist-up, keep ${subjectDescription} waist-up; match the neighbors' body crop.`,
      `- Pose of any unseen body parts: natural at-their-sides arms/hands if the portrait didn't show them.`,
      `- Hand and skin color: any hands, wrists, or exposed skin on ${subjectDescription}'s extended body must be rendered in ${subjectDescription}'s natural skin tone (sampled from the face in the portrait). Do NOT let color from the clothing wash onto the skin — a brightly-colored blouse must not cast a red/pink/orange tint onto the hand or wrist. Skin stays skin-colored; only illumination (brightness, warmth) may shift to match the scene light.`,

      `PLACEMENT AND ALIGNMENT:`,
      `- ${subjectDescription} stands next to the existing group at the chosen side, with natural spacing — close enough to feel part of the group, with a small gap so neither figure occludes the other, at the same depth from the camera (unless placement is 'front' or 'behind').`,
      `- HEAD ALIGNMENT (critical): ${subjectDescription}'s head and face must sit at the SAME vertical level in the frame as the neighboring adults' heads. If the portrait was tightly framed around the head with the face near the top, do NOT preserve that framing — lower ${subjectDescription} in the frame so the TOP OF THEIR HEAD is at roughly the same y-coordinate as the nearest adult neighbor's head. The scene's framing is authoritative, not the portrait's.`,
      `- GROUND / WAIST ALIGNMENT: If the neighbors are visible head-to-feet, ${subjectDescription}'s feet land on the same ground line. If the neighbors are cropped at waist or shoulders, ${subjectDescription} is cropped at the SAME line — not higher, not lower. Match the neighbors' vertical cutoff exactly.`,
      `- Arms and hands stay within their own lateral column — do not reach across or overlap the group.`,
      `- ${subjectDescription}'s body must read as standing with the group, not floating at a different depth or height.`,

      buildSizeHint(sizeAdjustment, subjectDescription),

      `PRESERVE THE REST OF THE SCENE — every other person, pet, and background element in the main photo stays EXACTLY as in the first image. Do NOT modify the faces, clothes, hair, or bodies of the existing people.`,

      `NO DUPLICATION — exactly one instance of ${subjectDescription} in the output.`,

      `Output: a single natural photograph where ${subjectDescription} stands next to the group at the chosen side, integrated with the scene's lighting and shadows and (if needed) extended in body, but with the EXACT face, expression, eyes, hair, and clothes from the second image.`,
    ];

    const prompt = promptParts.join('\n\n');

    // Start main-photo segmentation in parallel with NB2 so non-target
    // preservation has the masks ready when the merge finishes.
    const mainSegmentationPromise = measureSubjects(mainPhotoUrl);

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

    // Non-target preservation: NB2 reliably alters faces of people it was
    // told to leave alone (missing eyebrows, changed beards). Composite
    // main-photo pixels back through each main subject's mask, IoU-gated
    // so we only touch subjects still at roughly the same bbox in the
    // output (if NB2 shifted someone dramatically, we skip to avoid
    // double-exposure).
    const preserveStart = Date.now();
    let preservedUrl = mergedUrl;
    let preservedCount = 0;
    const [mainSegmentation, outputSegmentation] = await Promise.all([
      mainSegmentationPromise,
      measureSubjects(mergedUrl),
    ]);
    // Hoisted so face-swap can use it for bbox-scoped targeting below.
    let addedSubject: ReturnType<typeof findAddedSubject> = null;
    if (
      mainSegmentation &&
      outputSegmentation &&
      mainSegmentation.subjects.length > 0 &&
      outputSegmentation.subjects.length > 0
    ) {
      addedSubject = findAddedSubject(
        outputSegmentation.subjects,
        placement,
        {
          subjects: mainSegmentation.subjects,
          width: mainSegmentation.width,
          height: mainSegmentation.height,
          outputWidth: outputSegmentation.width,
          outputHeight: outputSegmentation.height,
        },
      );
      if (addedSubject) {
        const preservable = selectPreservableMainSubjects({
          mainSegmentation,
          outputSegmentation,
          addedSubject,
        });
        if (preservable.length > 0) {
          const preserved = await preservePeopleFromMain({
            mainPhotoUrl,
            editedImageUrl: mergedUrl,
            maskUrls: preservable.map((s) => s.maskUrl),
            addedSubjectMaskUrl: addedSubject.maskUrl,
            addedBbox: addedSubject.bbox,
          });
          if (preserved) {
            preservedUrl = preserved;
            preservedCount = preservable.length;
          }
        }
      }
    }
    const preserveMs = Date.now() - preserveStart;

    // Face-swap: NB2 always re-renders the subject's face from its own
    // priors. Transplant the real portrait pixels back on top — BUT scope
    // the swap to the loved one's bbox. The default global face-swap picks
    // the most prominent face in the base image, which in a group photo
    // is typically a main-photo person, not the smaller newly-added loved
    // one — the "same bearded guy gets her face every time" bug. Skip
    // swapping entirely if we couldn't locate the loved one (better to
    // show NB2's drifted face than swap the wrong person).
    const swapStart = Date.now();
    let finalUrl = preservedUrl;
    let swapMode: string = 'skipped-no-added-subject';
    if (addedSubject && outputSegmentation) {
      finalUrl = await applyTargetedFaceSwap({
        sourcePortraitUrl: lovedOnePhotoUrl,
        targetUrl: preservedUrl,
        addedBbox: addedSubject.bbox,
        targetWidth: outputSegmentation.width,
        targetHeight: outputSegmentation.height,
      });
      swapMode = 'targeted';
    }
    const swapMs = Date.now() - swapStart;

    logger.info(
      {
        nb2Ms,
        preserveMs,
        swapMs,
        totalMs: nb2Ms + preserveMs + swapMs,
        placement,
        sizeAdjustment,
        preservedCount,
        swapMode,
      },
      'merge timing',
    );

    // Charge the credit after the full pipeline (NB2 + preservation + swap)
    // succeeded. A failure anywhere upstream throws before this line, so
    // fal/storage errors never burn the user's balance.
    const creditsRemaining = await spendCredits(userId, 'merge', {
      dedupeKey: saveId,
    });

    ok(res, {
      imageUrl: finalUrl,
      prompt,
      placement,
      creditsRemaining,
      // Stage URLs for debugging transparency / artifact regressions —
      // safe to expose: they're already public fal.media URLs.
      debug: {
        nb2RawUrl: mergedUrl,
        preservedUrl,
        finalUrl,
        addedBbox: addedSubject?.bbox ?? null,
        outputDims: outputSegmentation
          ? { width: outputSegmentation.width, height: outputSegmentation.height }
          : null,
      },
    });
  } catch (err) {
    logger.error({ err }, 'spike merge failed');
    next(err);
  }
  },
);

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

/**
 * Bbox-scoped face-swap. fal-ai/face-swap always targets the most prominent
 * face in `base_image_url` — in a group photo, that's typically a clearer
 * main-photo person, NOT the smaller newly-added loved one. Symptoms of the
 * misfire: the same main-photo person gets her face painted over every run
 * (missing eyebrows, changed eyes, beard stripped out if she has none).
 *
 * Fix: crop `targetUrl` to the loved one's bbox, run face-swap on that crop
 * (she's the only face in it — physics), paste the swapped crop back onto
 * the full target. Face-swap can no longer pick the wrong face because the
 * wrong faces aren't in the cropped image.
 */
async function applyTargetedFaceSwap(args: {
  sourcePortraitUrl: string;
  targetUrl: string;
  addedBbox: [number, number, number, number];
  targetWidth: number;
  targetHeight: number;
}): Promise<string> {
  const { sourcePortraitUrl, targetUrl, addedBbox, targetWidth, targetHeight } =
    args;
  try {
    const targetResp = await fetch(targetUrl);
    if (!targetResp.ok) throw new Error(`target fetch failed ${targetResp.status}`);
    const targetBuf = Buffer.from(await targetResp.arrayBuffer());

    // Pad the bbox so face-swap has skin/hair context around the face —
    // it needs neck/ears/forehead to produce a clean blend. 10% of the
    // bbox's larger dimension is a balance between enough context and
    // not expanding the crop into neighbors.
    const [x1, y1, x2, y2] = addedBbox;
    const bw = x2 - x1;
    const bh = y2 - y1;
    const pad = Math.round(Math.max(bw, bh) * 0.1);

    const cropLeft = Math.max(0, x1 - pad);
    const cropTop = Math.max(0, y1 - pad);
    const cropRight = Math.min(targetWidth, x2 + pad);
    const cropBottom = Math.min(targetHeight, y2 + pad);
    const cropWidth = Math.max(1, cropRight - cropLeft);
    const cropHeight = Math.max(1, cropBottom - cropTop);

    const croppedBuf = await sharp(targetBuf)
      .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
      .png()
      .toBuffer();

    const croppedFile = new File(
      [new Uint8Array(croppedBuf)],
      'loved-one-crop.png',
      { type: 'image/png' },
    );
    const croppedUrl = await fal.storage.upload(croppedFile);

    const swapResult = await fal.subscribe('fal-ai/face-swap', {
      input: {
        base_image_url: croppedUrl,
        swap_image_url: sourcePortraitUrl,
      },
      logs: false,
    });
    const swappedUrl = extractFirstImageUrl(swapResult.data);
    if (!swappedUrl) {
      logger.warn('targeted face-swap returned no image; returning raw target');
      return targetUrl;
    }

    // Download swapped crop and paste it back onto the full target.
    const swappedResp = await fetch(swappedUrl);
    if (!swappedResp.ok) throw new Error(`swapped fetch failed ${swappedResp.status}`);
    const swappedBuf = Buffer.from(await swappedResp.arrayBuffer());

    // Feather the paste boundary instead of hard-pasting. Face-swap output
    // is portrait-grade (sharp, contrasty); the surrounding NB2 pixels are
    // softer generative-grade. A hard `blend: 'over'` at the crop edge made
    // the loved one's face read "real" while her body read "off" — the
    // discontinuity was at the crop rectangle, not at her silhouette. The
    // feather tonally eases the swap into the surrounding render so the
    // transition is invisible.
    const featherMargin = Math.max(
      8,
      Math.round(Math.min(cropWidth, cropHeight) * 0.12),
    );
    const innerLeft = featherMargin;
    const innerTop = featherMargin;
    const innerRight = cropWidth - featherMargin;
    const innerBottom = cropHeight - featherMargin;

    const alphaRaw = Buffer.alloc(cropWidth * cropHeight, 0);
    if (innerRight > innerLeft && innerBottom > innerTop) {
      for (let y = innerTop; y < innerBottom; y++) {
        const rowStart = y * cropWidth;
        for (let x = innerLeft; x < innerRight; x++) {
          alphaRaw[rowStart + x] = 255;
        }
      }
    }

    // Sharp's `.blur()` on a 1-channel input returns a 3-channel buffer —
    // same pitfall as in `mergeNonTargetPreserver.ts`. Force back to
    // 1-channel with `.toColourspace('b-w')` before raw-reading so the
    // subsequent joinChannel gets genuine single-channel alpha bytes.
    const featheredAlpha = await sharp(alphaRaw, {
      raw: { width: cropWidth, height: cropHeight, channels: 1 },
    })
      .blur(Math.max(featherMargin / 2, 4))
      .toColourspace('b-w')
      .raw()
      .toBuffer();

    const swappedRgb = await sharp(swappedBuf)
      .resize(cropWidth, cropHeight, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();

    const swappedWithFeather = await sharp(swappedRgb, {
      raw: { width: cropWidth, height: cropHeight, channels: 3 },
    })
      .joinChannel(featheredAlpha, {
        raw: { width: cropWidth, height: cropHeight, channels: 1 },
      })
      .png()
      .toBuffer();

    const finalBuf = await sharp(targetBuf)
      .composite([
        { input: swappedWithFeather, left: cropLeft, top: cropTop, blend: 'over' },
      ])
      .png()
      .toBuffer();

    const file = new File([new Uint8Array(finalBuf)], 'merge-targeted-swap.png', {
      type: 'image/png',
    });
    const url = await fal.storage.upload(file);
    logger.info(
      { cropLeft, cropTop, cropWidth, cropHeight },
      'targeted face-swap succeeded',
    );
    return url;
  } catch (err) {
    logger.warn(
      { err },
      'targeted face-swap failed; returning unswapped target',
    );
    return targetUrl;
  }
}

// -----------------------------------------------------------------------------
// GET /api/spike/templates — return launch templates from shared constants
// -----------------------------------------------------------------------------
spikeRouter.get('/templates', (_req, res) => {
  const templates: TributeTemplate[] = LAUNCH_TEMPLATES;
  ok(res, { templates });
});
