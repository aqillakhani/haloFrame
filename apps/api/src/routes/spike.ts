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
import {
  checkCredits,
  isFlowBlockedForFree,
  markFreeTierFlowUsed,
  spendCredits,
} from '../services/entitlements.js';
import { trackPreview } from '../services/previewLimiter.js';
import { combineTemplatePrompts, NO_EFFECT_SENTINEL } from '../services/templateCombiner.js';
import { annotateSubject } from '../services/subjectAnnotator.js';
import {
  enforceTargetSize,
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
  const rembgUrl = extractFirstImageUrl(result.data);
  if (!rembgUrl) throw new Error('rembg returned no image');

  // Trim transparent padding so the cutout's natural dimensions match the
  // subject, not the source frame. Without this, a wide-landscape portrait
  // with the subject offset to one side (645x350 stock photo, subject in
  // the right ~40%) produces a rembg PNG whose natural aspect ratio is
  // 1.84. The ReuniteFlow placement preview uses that natural aspect as
  // `--cutout-aspect` (see styles.css) while deriving height from the
  // subject-relative size — which makes the overlay's computed width
  // overflow its parent frame at any non-tiny `--cutout-h-frac`. Trimming
  // collapses to a subject-shaped aspect (typically 0.5-0.9, portrait)
  // and the overlay fits inside its container.
  try {
    const resp = await fetch(rembgUrl);
    if (!resp.ok) throw new Error(`rembg fetch failed ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    // Use an explicit fully-transparent background reference so sharp
    // removes alpha-zero pixels regardless of what sRGB values sit under
    // those transparent areas in the PNG (rembg sometimes leaves JPEG
    // color noise in the unused alpha region). Low threshold — anything
    // meaningfully opaque stays.
    const trimmedBuf = await sharp(buf)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
      .png()
      .toBuffer();
    const before = (await sharp(buf).metadata());
    const after = (await sharp(trimmedBuf).metadata());
    logger.info(
      {
        beforeDims: { w: before.width, h: before.height },
        afterDims: { w: after.width, h: after.height },
      },
      'buildSubjectCutout: trimmed transparent padding from rembg output',
    );
    const file = new File(
      [new Uint8Array(trimmedBuf)],
      'subject-cutout-trimmed.png',
      { type: 'image/png' },
    );
    return await fal.storage.upload(file);
  } catch (trimErr) {
    logger.warn({ trimErr }, 'buildSubjectCutout trim failed; returning untrimmed rembg');
    return rembgUrl;
  }
}

/**
 * Pre-frame a head-shot portrait so NB2 has the visual prior "this person has
 * a body below the visible content."
 *
 * Root-cause context (bug: loved one cropped waist-up after zoom-out canvas
 * landed). NB2 (nano-banana-2/edit) is a layout-aware edit model. When handed
 * a landscape head+chest portrait (common stock-photo framing), it replicates
 * that framing in its output — painting the loved one waist-up in the final
 * merge even when the family is full-body and the prompt explicitly instructs
 * body extension. Prompt text alone cannot override the visual prior; 3
 * consecutive user runs with the same inputs produced waist-up SAM masks,
 * while only a lucky Playwright sandbox roll produced full-body.
 *
 * The fix: reshape the portrait into a taller canvas where the subject occupies
 * the top ~30% and the rest is a clean background. This gives NB2 the "scene
 * space below the visible content — subject has a body to paint there" prior
 * that the head-shot framing lacks.
 *
 * Steps:
 *   1. rembg to isolate subject on transparency.
 *   2. Trim transparent padding → subject-shaped cutout.
 *   3. Sample the original portrait's background color from its four corners
 *      (robust to simple studio backgrounds; for busy scenes, the fill won't
 *      be seamless but the layout hint is what matters to NB2).
 *   4. Build a canvas sized subjW × 1.2 (wide) by subjH × 2.8 (tall), filled
 *      with the sampled color, with the subject pasted in the top 5%.
 *
 * On failure, throws — caller must catch and fall back to the raw portrait so
 * a transient rembg/storage hiccup doesn't block the merge.
 *
 * Face-swap MUST stay on the raw portrait (not this extension) — it needs
 * clean, un-padded pixels for face identity transplant.
 */
async function extendPortraitForBodyContext(portraitUrl: string): Promise<string> {
  const origResp = await fetch(portraitUrl);
  if (!origResp.ok) throw new Error(`portrait fetch failed ${origResp.status}`);
  const origBuf = Buffer.from(await origResp.arrayBuffer());
  const origMeta = await sharp(origBuf).metadata();
  const origW = origMeta.width;
  const origH = origMeta.height;
  if (!origW || !origH) throw new Error('portrait has no dimensions');

  // rembg → transparent-background cutout.
  const rembgResult = await fal.subscribe('fal-ai/imageutils/rembg', {
    input: { image_url: portraitUrl },
    logs: false,
  });
  const rembgUrl = extractFirstImageUrl(rembgResult.data);
  if (!rembgUrl) throw new Error('rembg returned no image');

  const cutoutResp = await fetch(rembgUrl);
  if (!cutoutResp.ok) throw new Error(`rembg fetch failed ${cutoutResp.status}`);
  const cutoutRawBuf = Buffer.from(await cutoutResp.arrayBuffer());

  // Trim transparent padding → subject-sized rect. Threshold 10 keeps anything
  // meaningfully opaque (matches buildSubjectCutout).
  const cutoutBuf = await sharp(cutoutRawBuf)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
    .png()
    .toBuffer();
  const cutoutMeta = await sharp(cutoutBuf).metadata();
  const subjW = cutoutMeta.width;
  const subjH = cutoutMeta.height;
  if (!subjW || !subjH) throw new Error('trimmed cutout has no dimensions');

  // Skip pre-framing when the portrait is already full-body-ish: if the
  // source is portrait-oriented AND the subject fills ≥70% of its height,
  // re-framing would shrink the subject into the top of a taller canvas,
  // potentially causing NB2 to render her at a smaller scale than the family
  // — a different regression than the head-shot waist-up crop this function
  // exists to fix. The throw lands in the caller's catch and falls back to
  // the raw portrait, which is the correct behavior for full-body inputs.
  const isLandscape = origW > origH * 1.1;
  const subjectFillsHeight = subjH / origH >= 0.7;
  if (!isLandscape && subjectFillsHeight) {
    throw new Error(
      `portrait looks full-body (${origW}x${origH}, subject ${subjW}x${subjH}); ` +
        `skipping pre-frame to avoid shrinking subject`,
    );
  }

  // Sample background color from each corner (side-length = 8% of min dim,
  // min 16px). Averaging all four corners tolerates one corner overlapping
  // the subject (e.g. when the portrait is subject-offset-right: top-right
  // and bottom-right may clip the subject, but top-left/bottom-left are clean).
  const cornerSize = Math.max(16, Math.round(Math.min(origW, origH) * 0.08));
  const cornerRects: Array<{ left: number; top: number }> = [
    { left: 0, top: 0 },
    { left: Math.max(0, origW - cornerSize), top: 0 },
    { left: 0, top: Math.max(0, origH - cornerSize) },
    { left: Math.max(0, origW - cornerSize), top: Math.max(0, origH - cornerSize) },
  ];
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  let bgCount = 0;
  for (const rect of cornerRects) {
    const sample = await sharp(origBuf)
      .extract({ left: rect.left, top: rect.top, width: cornerSize, height: cornerSize })
      .removeAlpha()
      .raw()
      .toBuffer();
    for (let i = 0; i < sample.length; i += 3) {
      bgR += sample[i] ?? 0;
      bgG += sample[i + 1] ?? 0;
      bgB += sample[i + 2] ?? 0;
      bgCount++;
    }
  }
  const avgR = bgCount > 0 ? Math.round(bgR / bgCount) : 128;
  const avgG = bgCount > 0 ? Math.round(bgG / bgCount) : 128;
  const avgB = bgCount > 0 ? Math.round(bgB / bgCount) : 128;

  // Target canvas. Width +20% so shoulders/arms don't touch edges (another
  // edge-touch framing hint NB2 would replicate). Height ×2.8 so subject
  // claims the top ~36% and ~2x subject-height of body-space sits below —
  // enough room to signal "full body goes here" without being so vast that
  // NB2 paints the figure unnaturally tall.
  const canvasW = Math.round(subjW * 1.2);
  const canvasH = Math.round(subjH * 2.8);
  const subjX = Math.round((canvasW - subjW) / 2);
  const subjY = Math.round(canvasH * 0.05);

  const canvasBuf = await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 3,
      background: { r: avgR, g: avgG, b: avgB },
    },
  })
    .composite([{ input: cutoutBuf, left: subjX, top: subjY, blend: 'over' }])
    .png()
    .toBuffer();

  const file = new File(
    [new Uint8Array(canvasBuf)],
    'portrait-pre-framed.png',
    { type: 'image/png' },
  );
  const url = await fal.storage.upload(file);

  logger.info(
    {
      origDims: { w: origW, h: origH },
      subjectDims: { w: subjW, h: subjH },
      canvasDims: { w: canvasW, h: canvasH },
      bgColor: { r: avgR, g: avgG, b: avgB },
    },
    'extendPortraitForBodyContext: built pre-framed portrait',
  );

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
      // Free-tier per-flow gate (Phase D): only evaluated on the Enhance
      // path. In Reunite, `/merge` has already run — the merge_used flag
      // was checked + flipped there, so /apply is the second leg of a
      // flow that was already cleared.
      const isReunite = !!placement;
      if (!isReunite && (await isFlowBlockedForFree(billing.userId, 'enhance'))) {
        throw errors.upgradeRequired();
      }
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
      // Free-tier: flip the enhance_used flag on the Enhance path only
      // (reunite's flag flips in /merge so it's already set by now).
      const isReunite = !!placement;
      if (!isReunite) {
        await markFreeTierFlowUsed(billing.userId, 'enhance');
      }
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

// Placement phrases — embedded inline in the merge prompt. No pose bias
// (no "standing") so the model can match whatever pose the main scene is in.
const PLACEMENT_PHRASE: Record<Placement, string> = {
  left: 'at the left side of the group',
  right: 'at the right side of the group',
  behind: 'behind the group, slightly visible between or above the other people',
  front: 'in the foreground, in front of the group, closer to the camera than the other people',
};

/**
 * Geometry of the "zoomed-out" canvas fed to NB2. The output canvas has
 * the SAME dimensions as the original main photo; the main photo itself
 * is scaled down (by `mainScale`, < 1) and positioned offset toward the
 * side opposite `placement`, leaving a band of blurred-bokeh space on the
 * placement side for NB2 to paint the added subject into. Used downstream
 * to composite the pristine (also scaled-down) original pixels back over
 * the NB2 output — NB2 is generative and will subtly alter everything it
 * renders, so without the hard restore the family gets "ai slop" treatment
 * (repainted faces, rearranged bodies) even though we explicitly told the
 * prompt to leave them alone.
 *
 * Field semantics (all in pre-NB2 canvas coordinates):
 *   - canvasWidth/Height: the full canvas fed to NB2. Equal to the
 *     original main photo's dimensions in the zoom-out flow.
 *   - mainX/Y, mainWidth/Height: bounding rect of the scaled-down main
 *     photo inside the canvas. The restore pass composites back over
 *     this rect, minus the silhouette of the NB2-added subject.
 *   - mainScale: scale factor applied to the original main to produce
 *     the scaled-down version that sits inside the canvas. Used to
 *     translate main-photo subject bboxes (in original coords) into
 *     canvas coords for findAddedSubject's IoU matching.
 *   - placementSide: the side of the canvas the placement instruction
 *     targets — i.e., the side with the empty bokeh band. Used for
 *     the restore feather direction and the NB2 prompt hint.
 */
interface ExtendedCanvas {
  url: string;
  canvasWidth: number;
  canvasHeight: number;
  mainX: number;
  mainY: number;
  mainWidth: number;
  mainHeight: number;
  mainScale: number;
  placementSide: 'left' | 'right' | 'top' | 'bottom';
  placementBandPx: number;
}

/**
 * Build a "zoomed-out" canvas for NB2: the original main photo is scaled
 * down uniformly and positioned offset toward the side opposite `placement`
 * inside a canvas with the SAME dimensions as the original main. The
 * remaining area (placement-side band + perpendicular side margins) is
 * filled with a mirror-reflected, heavily-blurred continuation of the
 * scene.
 *
 * Why this shape, not a side-extension:
 *   A side-extension would preserve every family pixel but makes the
 *   output canvas wider (or taller) than the original. Viewers read that
 *   as "the family was pushed to one side to make room for the new
 *   person" — even though every family pixel is in its original position,
 *   the containing frame grew. Zooming out instead (shrink main, keep
 *   frame size) reads as "the photographer stepped back so everyone fits"
 *   — a compositional change that feels natural rather than edited.
 *
 * placement →  placement-side band (empty area for loved one):
 *   left   →   left     (scaled-main sits offset-right, loved one on left)
 *   right  →   right    (scaled-main offset-left, loved one on right)
 *   behind →   top       (scaled-main offset-bottom; subject appears above)
 *   front  →   bottom    (scaled-main offset-top; subject appears below)
 *
 * `zoomOutFrac` controls the slack: 0.25 means 25% of the canvas dimension
 * on the placement side is open for the loved one (main scaled to 0.75).
 * Too large → family looks absurdly small; too small → loved one crammed.
 */
async function zoomOutMainCanvas(
  mainPhotoUrl: string,
  placement: Placement,
  zoomOutFrac: number,
): Promise<ExtendedCanvas | null> {
  try {
    const resp = await fetch(mainPhotoUrl);
    if (!resp.ok) throw new Error(`main fetch failed ${resp.status}`);
    const mainBuf = Buffer.from(await resp.arrayBuffer());

    const meta = await sharp(mainBuf).metadata();
    const W = meta.width;
    const H = meta.height;
    if (!W || !H) throw new Error('main photo has no dimensions');

    const placementSide: ExtendedCanvas['placementSide'] =
      placement === 'left'
        ? 'left'
        : placement === 'right'
          ? 'right'
          : placement === 'behind'
            ? 'top'
            : 'bottom';

    const mainScale = Math.max(0.5, Math.min(0.95, 1 - zoomOutFrac));
    const scaledW = Math.max(1, Math.round(W * mainScale));
    const scaledH = Math.max(1, Math.round(H * mainScale));

    // Split the empty space between the placement-side band (where the
    // loved one will be painted) and a far-side margin (breathing room so
    // the family's far-side member doesn't end up flush against the output
    // frame).
    //
    // 50/50 = symmetric: the scaled family sits at the canvas center on
    // the placement axis, with equal bokeh margins on both sides. This
    // replaced an earlier 80/20 split that gave the band 80% of empty
    // space (so NB2 had a wide canvas-area to paint the loved one into,
    // matching seated-pose) but at the cost of shifting the family ~9%
    // off-center. Users read that shift as "the photo moved to make
    // room for the loved one." Most acutely visible with the
    // Among-the-Stars style: the upper bokeh band gets transformed to
    // sky AND the loved one is removed from ground level, exposing the
    // asymmetric composition (small loved-one ghost in stars + family
    // visibly shifted + bare bokeh on the placement side).
    //
    // Trade-off accepted with 50/50: the band is roughly half as wide
    // (~370 output px instead of ~600 at ZOOM_OUT_FRAC=0.30), which can
    // push NB2 to paint a standing-tall loved one instead of seated.
    // mergeSizeEnforcer then rescales them by HEIGHT to match the avg
    // neighbor anyway, so the FINAL size is correct regardless of pose.
    // For sky-placement styles (Among the Stars, Rainbow Bridge) the
    // pose is irrelevant since the loved one is replaced with a ghostly
    // sky impression. For ground-level styles (Heavenly Glow, Halo &
    // Wings) a standing-pose painted next to a seated family is the
    // residual quality cost — but it's strictly less jarring than the
    // visible composition shift the 80/20 split produced.
    //
    // Far-side margin in the source photo for the calibration test
    // image: dad's jeans ended at 80.5% of frame width (19.5% margin).
    // With 50/50 at ZOOM_OUT_FRAC=0.30: dad lands at ~71% of canvas,
    // 14% closer to the canvas center — family-as-a-whole reads as
    // centered rather than skewed.
    //
    // The restore pass's feather logic already handles the now-existent
    // far-side seam — featherRight = mainOutX + mainOutW < outW is TRUE
    // with a non-zero far-side margin.
    const FAR_SIDE_MARGIN_FRAC = 0.50;
    const isHorizontal =
      placementSide === 'left' || placementSide === 'right';
    const emptyPx = isHorizontal ? W - scaledW : H - scaledH;
    const placementBandPx = Math.max(
      1,
      Math.round(emptyPx * (1 - FAR_SIDE_MARGIN_FRAC)),
    );
    const farSideMarginPx = Math.max(0, emptyPx - placementBandPx);

    // Position the scaled main: place it so the placement-side empty area
    // matches placementBandPx (the loved-one band) and the opposite side
    // gets farSideMarginPx of bokeh margin.
    let mainX: number;
    let mainY: number;
    if (placementSide === 'left') {
      mainX = placementBandPx;
      mainY = Math.round((H - scaledH) / 2);
    } else if (placementSide === 'right') {
      mainX = farSideMarginPx;
      mainY = Math.round((H - scaledH) / 2);
    } else if (placementSide === 'top') {
      mainX = Math.round((W - scaledW) / 2);
      mainY = placementBandPx;
    } else {
      mainX = Math.round((W - scaledW) / 2);
      mainY = farSideMarginPx;
    }

    // Start with a canvas-sized mirror extension of the scaled-down main.
    // sharp's `extend` with `mirror` reflects the adjacent edge pixels,
    // which gives the surround a natural color palette even before the
    // blur. Blurring the surround after masking out the main rect makes
    // it read as out-of-focus bokeh rather than "twin family."
    const scaledMainBuf = await sharp(mainBuf)
      .resize(scaledW, scaledH, { fit: 'fill', kernel: 'lanczos3' })
      .toBuffer();

    const mirroredCanvas = await sharp(scaledMainBuf)
      .extend({
        left: mainX,
        right: W - mainX - scaledW,
        top: mainY,
        bottom: H - mainY - scaledH,
        extendWith: 'mirror' as const,
      })
      .toBuffer();

    const blurredCanvas = await sharp(mirroredCanvas).blur(28).toBuffer();

    // Composite the sharp scaled main back over the blurred canvas so the
    // main rect is crisp and the surround is bokeh. The main is re-laid
    // down as-is (no feathering here — the restore pass handles seam
    // blending where NB2's output meets pristine main at output time).
    const finalBuf = await sharp(blurredCanvas)
      .composite([
        { input: scaledMainBuf, left: mainX, top: mainY, blend: 'over' },
      ])
      .png()
      .toBuffer();

    const file = new File(
      [new Uint8Array(finalBuf)],
      `main-zoomed-out-${placementSide}.png`,
      { type: 'image/png' },
    );
    const url = await fal.storage.upload(file);

    logger.info(
      {
        placement,
        placementSide,
        mainScale: Number(mainScale.toFixed(3)),
        placementBandPx,
        originalDims: { W, H },
        canvasDims: { W, H },
        mainRect: { x: mainX, y: mainY, w: scaledW, h: scaledH },
      },
      'zoomOutMainCanvas: built zoomed-out canvas',
    );

    return {
      url,
      canvasWidth: W,
      canvasHeight: H,
      mainX,
      mainY,
      mainWidth: scaledW,
      mainHeight: scaledH,
      mainScale,
      placementSide,
      placementBandPx,
    };
  } catch (err) {
    logger.warn({ err, mainPhotoUrl, placement }, 'zoomOutMainCanvas failed');
    return null;
  }
}

/**
 * Composite the pristine original main photo back over the NB2 output at
 * its scaled-down position inside the canvas.
 *
 * The compositing alpha is:
 *   alpha = (inside main rect) × (outside loved-one silhouette) × (interior-edge feather)
 *
 * - "inside main rect": 0 outside the rect, 1 inside → bokeh surround is untouched.
 * - "outside loved-one silhouette": inverted SAM-3 mask for the NB2-added subject,
 *   blurred to feather the silhouette edge. When NB2 places her body partially
 *   or entirely in the main area (NB2 frequently ignores the "paint in the
 *   bokeh band" prompt hint), this keeps her pixels in the output instead
 *   of wiping her with pristine main. Without the silhouette, a rectangle
 *   restore erases whatever portion of her body lies in main area → final
 *   image shows no loved one at all. Optional: if omitted, we fall back to
 *   a rectangle restore.
 * - "interior-edge feather": 0→1 ramp over 3% of the main dimension on each
 *   edge of the main rect that borders the bokeh surround (i.e. every edge
 *   except ones that coincide with the canvas boundary). Any NB2 overspill
 *   just past the seam blends in rather than being sliced.
 *
 * Net effect: family pixels are authoritative within their scaled rect,
 * her body survives intact at whatever position NB2 placed her, and all
 * bokeh↔main seams blend invisibly.
 */
async function restoreMainOverExtendedOutput(args: {
  extendedOutputUrl: string;
  mainPhotoUrl: string;
  canvas: ExtendedCanvas;
  /**
   * SAM-3 mask URL for the NB2-added loved one. PNG with subject in the
   * alpha channel (apply_mask: true). When provided, pixels inside her
   * silhouette are preserved from the output instead of overwritten by
   * pristine main — this is what prevents her from vanishing when NB2
   * places her in the main-photo area.
   */
  subjectMaskUrl?: string | null;
}): Promise<string | null> {
  const { extendedOutputUrl, mainPhotoUrl, canvas, subjectMaskUrl } = args;
  try {
    const [outResp, mainResp] = await Promise.all([
      fetch(extendedOutputUrl),
      fetch(mainPhotoUrl),
    ]);
    if (!outResp.ok || !mainResp.ok) {
      throw new Error(
        `restore fetch failed: out=${outResp.status} main=${mainResp.status}`,
      );
    }
    const outputBuf = Buffer.from(await outResp.arrayBuffer());
    const mainBuf = Buffer.from(await mainResp.arrayBuffer());

    const outputMeta = await sharp(outputBuf).metadata();
    const outW = outputMeta.width;
    const outH = outputMeta.height;
    if (!outW || !outH) throw new Error('extended output has no dimensions');

    // NB2 upscales the input (we feed 2Kish, it outputs 2K regardless).
    // The main-photo region scales the same way the whole canvas did, so
    // we can take a simple uniform scale factor from width (height tracks).
    const scale = outW / canvas.canvasWidth;
    const mainOutX = Math.round(canvas.mainX * scale);
    const mainOutY = Math.round(canvas.mainY * scale);
    const mainOutW = Math.round(canvas.mainWidth * scale);
    const mainOutH = Math.round(canvas.mainHeight * scale);

    const mainResized = await sharp(mainBuf)
      .resize(mainOutW, mainOutH, { fit: 'fill', kernel: 'lanczos3' })
      .removeAlpha()
      .raw()
      .toBuffer();

    // Feather every edge of mainOutRect that borders the bokeh surround —
    // i.e. every edge that does NOT sit on the canvas boundary in the NB2
    // output. Canvas-boundary edges need no feather (no seam there).
    // Feather width is 3% of the main region dimension perpendicular to
    // each edge, floored at 8px.
    const featherWidth = Math.max(8, Math.round(mainOutW * 0.03));
    const featherHeight = Math.max(8, Math.round(mainOutH * 0.03));
    const featherLeft = mainOutX > 0;
    const featherTop = mainOutY > 0;
    const featherRight = mainOutX + mainOutW < outW;
    const featherBottom = mainOutY + mainOutH < outH;

    const alpha = Buffer.alloc(mainOutW * mainOutH, 255);
    if (featherLeft) {
      for (let x = 0; x < featherWidth && x < mainOutW; x++) {
        const v = Math.round((x / featherWidth) * 255);
        for (let y = 0; y < mainOutH; y++) {
          const idx = y * mainOutW + x;
          const curr = alpha[idx] ?? 255;
          if (v < curr) alpha[idx] = v;
        }
      }
    }
    if (featherRight) {
      for (let i = 0; i < featherWidth && i < mainOutW; i++) {
        const x = mainOutW - 1 - i;
        const v = Math.round((i / featherWidth) * 255);
        for (let y = 0; y < mainOutH; y++) {
          const idx = y * mainOutW + x;
          const curr = alpha[idx] ?? 255;
          if (v < curr) alpha[idx] = v;
        }
      }
    }
    if (featherTop) {
      for (let y = 0; y < featherHeight && y < mainOutH; y++) {
        const v = Math.round((y / featherHeight) * 255);
        const row = y * mainOutW;
        for (let x = 0; x < mainOutW; x++) {
          const curr = alpha[row + x] ?? 255;
          if (v < curr) alpha[row + x] = v;
        }
      }
    }
    if (featherBottom) {
      for (let i = 0; i < featherHeight && i < mainOutH; i++) {
        const y = mainOutH - 1 - i;
        const v = Math.round((i / featherHeight) * 255);
        const row = y * mainOutW;
        for (let x = 0; x < mainOutW; x++) {
          const curr = alpha[row + x] ?? 255;
          if (v < curr) alpha[row + x] = v;
        }
      }
    }

    // Silhouette subtraction. If SAM gave us a mask of the NB2-added loved
    // one, lower the restore alpha everywhere inside her body so those
    // output pixels (her) survive instead of being painted over by pristine
    // main. The mask was measured on NB2's output — same dimensions as what
    // we're restoring over — so resize to output dims only defensively.
    //
    // Blur radius 6 feathers the silhouette edge so the transition from
    // "her" to "pristine main" is soft. This means a ~6-pixel halo around
    // her body is a blend of NB2 pixels and main pixels, which reads as
    // natural occlusion (hair wisps, clothing fringe) rather than a crisp
    // cutout. A crisp cutout here would look pasted-in.
    let subjectMaskApplied = false;
    if (subjectMaskUrl) {
      try {
        const maskResp = await fetch(subjectMaskUrl);
        if (maskResp.ok) {
          const maskBuf = Buffer.from(await maskResp.arrayBuffer());
          const maskAlpha = await sharp(maskBuf)
            .ensureAlpha()
            .resize(outW, outH, { fit: 'fill' })
            .extractChannel('alpha')
            .blur(6)
            .raw()
            .toBuffer();
          for (let y = 0; y < mainOutH; y++) {
            const srcRow = (y + mainOutY) * outW + mainOutX;
            const dstRow = y * mainOutW;
            for (let x = 0; x < mainOutW; x++) {
              const silhouette = maskAlpha[srcRow + x] ?? 0;
              if (silhouette === 0) continue;
              const curr = alpha[dstRow + x] ?? 0;
              alpha[dstRow + x] = Math.round(curr * (1 - silhouette / 255));
            }
          }
          subjectMaskApplied = true;
        } else {
          logger.warn(
            { subjectMaskUrl, status: maskResp.status },
            'restore: subject mask fetch non-ok; falling back to rectangle restore',
          );
        }
      } catch (maskErr) {
        logger.warn(
          { maskErr, subjectMaskUrl },
          'restore: subject mask application failed; rectangle restore only',
        );
      }
    }

    const mainWithAlpha = await sharp(mainResized, {
      raw: { width: mainOutW, height: mainOutH, channels: 3 },
    })
      .joinChannel(alpha, { raw: { width: mainOutW, height: mainOutH, channels: 1 } })
      .png()
      .toBuffer();

    const finalBuf = await sharp(outputBuf)
      .composite([{ input: mainWithAlpha, left: mainOutX, top: mainOutY, blend: 'over' }])
      .png()
      .toBuffer();

    const file = new File(
      [new Uint8Array(finalBuf)],
      'merge-main-restored.png',
      { type: 'image/png' },
    );
    const url = await fal.storage.upload(file);
    logger.info(
      {
        outW,
        outH,
        scale: Number(scale.toFixed(3)),
        mainOutRect: { x: mainOutX, y: mainOutY, w: mainOutW, h: mainOutH },
        feather: {
          width: featherWidth,
          height: featherHeight,
          sides: {
            left: featherLeft,
            right: featherRight,
            top: featherTop,
            bottom: featherBottom,
          },
        },
        subjectMaskApplied,
      },
      'restoreMainOverExtendedOutput: composited pristine main over NB2 output',
    );
    return url;
  } catch (err) {
    logger.warn({ err }, 'restoreMainOverExtendedOutput failed');
    return null;
  }
}

/**
 * Pristine-main passthrough restore for the no-zoom-out merge architecture
 * (2026-04-22c). NB2 receives the original main and is asked to add the
 * loved one. Its output may have shifted/repainted family pixels; this pass
 * composites the pristine main back over the NB2 output everywhere EXCEPT
 * inside the loved one's silhouette, which is the only region where NB2's
 * painting is allowed to survive.
 *
 * Compared to the older `restoreMainOverExtendedOutput` (zoom-out era):
 *   - main rect == entire output (no scaled-down inset, no bokeh surround)
 *   - no edge feathering needed (no main↔bokeh seam to soften)
 *   - silhouette-feather logic is identical
 *
 * Net effect: the saved photo is your original main with ONLY the loved
 * one's silhouette pixels coming from NB2 — no shrinkage, no bokeh frame,
 * no edited background.
 */
async function restorePristineMain(args: {
  nb2OutputUrl: string;
  mainPhotoUrl: string;
  subjectMaskUrl?: string | null;
}): Promise<string | null> {
  const { nb2OutputUrl, mainPhotoUrl, subjectMaskUrl } = args;
  try {
    const [outResp, mainResp] = await Promise.all([
      fetch(nb2OutputUrl),
      fetch(mainPhotoUrl),
    ]);
    if (!outResp.ok || !mainResp.ok) {
      throw new Error(
        `restore fetch failed: out=${outResp.status} main=${mainResp.status}`,
      );
    }
    const outputBuf = Buffer.from(await outResp.arrayBuffer());
    const mainBuf = Buffer.from(await mainResp.arrayBuffer());

    const outputMeta = await sharp(outputBuf).metadata();
    const outW = outputMeta.width;
    const outH = outputMeta.height;
    if (!outW || !outH) throw new Error('NB2 output has no dimensions');

    // NB2 typically upscales (e.g. 1536→2048 wide) but preserves aspect
    // with aspect_ratio:auto, so a uniform scale works. If NB2 ever drifted
    // aspect, fit:'fill' would stretch — the API boundary doesn't currently
    // guard against that, so any aspect drift would be visible in pixel
    // diffs against the original.
    const mainResized = await sharp(mainBuf)
      .resize(outW, outH, { fit: 'fill', kernel: 'lanczos3' })
      .removeAlpha()
      .raw()
      .toBuffer();

    // Alpha = 255 (use pristine main pixel) by default. Inside the loved-
    // one silhouette the alpha drops toward 0 so NB2's painted loved one
    // survives there. A 6-pixel blur on the silhouette feathers the
    // transition so hair wisps and clothing fringe blend naturally instead
    // of reading as a crisp pasted cutout.
    const alpha = Buffer.alloc(outW * outH, 255);
    let subjectMaskApplied = false;
    if (subjectMaskUrl) {
      try {
        const maskResp = await fetch(subjectMaskUrl);
        if (maskResp.ok) {
          const maskBuf = Buffer.from(await maskResp.arrayBuffer());
          const maskAlpha = await sharp(maskBuf)
            .ensureAlpha()
            .resize(outW, outH, { fit: 'fill' })
            .extractChannel('alpha')
            .blur(6)
            .raw()
            .toBuffer();
          const total = outW * outH;
          for (let i = 0; i < total; i++) {
            const silhouette = maskAlpha[i] ?? 0;
            if (silhouette === 0) continue;
            const curr = alpha[i] ?? 0;
            alpha[i] = Math.round(curr * (1 - silhouette / 255));
          }
          subjectMaskApplied = true;
        } else {
          logger.warn(
            { subjectMaskUrl, status: maskResp.status },
            'restorePristineMain: mask fetch non-ok; rectangle restore',
          );
        }
      } catch (maskErr) {
        logger.warn(
          { maskErr, subjectMaskUrl },
          'restorePristineMain: mask application failed',
        );
      }
    }

    const mainWithAlpha = await sharp(mainResized, {
      raw: { width: outW, height: outH, channels: 3 },
    })
      .joinChannel(alpha, { raw: { width: outW, height: outH, channels: 1 } })
      .png()
      .toBuffer();

    const finalBuf = await sharp(outputBuf)
      .composite([{ input: mainWithAlpha, blend: 'over' }])
      .png()
      .toBuffer();

    const file = new File(
      [new Uint8Array(finalBuf)],
      'merge-pristine-main.png',
      { type: 'image/png' },
    );
    const url = await fal.storage.upload(file);

    logger.info(
      { outDims: { w: outW, h: outH }, subjectMaskApplied },
      'restorePristineMain: composited pristine main over NB2 output',
    );
    return url;
  } catch (err) {
    logger.warn({ err }, 'restorePristineMain failed');
    return null;
  }
}

/**
 * One NB2 merge attempt plus the downstream measurements needed to decide
 * whether it clipped the subject at an edge. Pulled out of the /merge
 * handler so we can call it twice: once on the first try, and once more
 * with a stronger "stay away from the edge" directive when the first try
 * lands the subject flush against the frame boundary.
 */
async function runNb2Merge(args: {
  prompt: string;
  mainPhotoUrl: string;
  lovedOneUrl: string;
  placement: Placement;
  mainSegmentation: Awaited<ReturnType<typeof measureSubjects>>;
}): Promise<{
  mergedUrl: string;
  outputSegmentation: Awaited<ReturnType<typeof measureSubjects>>;
  addedSubject: ReturnType<typeof findAddedSubject>;
  edgeDistPx: number;
  nb2Ms: number;
}> {
  const nb2Start = Date.now();
  const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
    input: {
      prompt: args.prompt,
      image_urls: [args.mainPhotoUrl, args.lovedOneUrl],
      resolution: '2K',
      output_format: 'png',
      aspect_ratio: 'auto',
    },
    logs: false,
  });
  const nb2Ms = Date.now() - nb2Start;

  const mergedUrl = extractFirstImageUrl(result.data);
  if (!mergedUrl) throw errors.fal('Nano Banana 2 returned no merge image');

  const outputSegmentation = await measureSubjects(mergedUrl);
  let addedSubject: ReturnType<typeof findAddedSubject> = null;
  if (outputSegmentation && outputSegmentation.subjects.length > 0) {
    const mainCtx =
      args.mainSegmentation && args.mainSegmentation.subjects.length > 0
        ? {
            subjects: args.mainSegmentation.subjects,
            width: args.mainSegmentation.width,
            height: args.mainSegmentation.height,
            outputWidth: outputSegmentation.width,
            outputHeight: outputSegmentation.height,
          }
        : undefined;
    addedSubject = findAddedSubject(outputSegmentation.subjects, args.placement, mainCtx);
  }

  // Minimum distance from added-subject bbox to any output frame edge. A
  // value near 0 means the subject is flush with the edge — which, on NB2
  // outputs, almost always means visible clipping of the subject's body.
  let edgeDistPx = Infinity;
  if (addedSubject && outputSegmentation) {
    const [x1, y1, x2, y2] = addedSubject.bbox;
    edgeDistPx = Math.min(
      x1,
      outputSegmentation.width - x2,
      y1,
      outputSegmentation.height - y2,
    );
  }

  return { mergedUrl, outputSegmentation, addedSubject, edgeDistPx, nb2Ms };
}

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
    // Free-tier per-flow gate (Phase D): one reunite per free account.
    if (await isFlowBlockedForFree(userId, 'reunite')) {
      throw errors.upgradeRequired();
    }
    const check = await checkCredits(userId, 'merge');
    if (!check.allowed) throw errors.paymentRequired();

    const subjectDescription = subjectName
      ? subjectName
      : isPet
        ? 'the pet'
        : 'the person';

    // Segment the main FIRST so we can plumb the existing-people count into
    // the prompt. NB2 hallucinates extra family members (a "twin" of an
    // existing person, a phantom sibling) when the prompt doesn't pin the
    // count — we observed a 3-person family becoming 5 in the output. Telling
    // the model "the input has exactly N people; output exactly N+1" is the
    // cheapest mitigation. If segmentation fails (null), we fall through to
    // count-agnostic anti-hallucination wording.
    //
    // This call is also used downstream for findAddedSubject and
    // enforceTargetSize, so moving it earlier doesn't add latency — it just
    // shifts work that would have been serial-after-prompt to serial-before-
    // prompt. Future optimization: parallelize with extendPortraitForBodyContext.
    const mainSegmentation = await measureSubjects(mainPhotoUrl);
    const existingPeopleCount = mainSegmentation?.subjects?.length ?? null;

    // Simplified prompt (2026-04-24). The prior 23-clause prompt built up
    // across sessions was compensating for NB2 behaviors that mostly aren't
    // real (framing was fixing a frontend Editor crop; head-alignment forced
    // awkward poses when the family was sitting; "stands" biased NB2 toward
    // standing even when the scene is seated). User's direct NB2 test with
    // a ~30-word natural-language prompt produced good results in <30s —
    // matching that here. Natural language, no pose bias, no micromanagement
    // of framing or identity (NB2's defaults preserve identity when you
    // simply ask it to).
    const subjectTerm = isPet ? 'the pet' : 'the person';
    const countSentence =
      existingPeopleCount != null
        ? `Output exactly ${existingPeopleCount + 1} people. Do not add anyone else.`
        : `Do not add any extra people beyond ${subjectTerm} and the people already in the first image.`;
    const existingSentence =
      existingPeopleCount != null
        ? `Do not edit the existing ${existingPeopleCount} ${existingPeopleCount === 1 ? 'person' : 'people'} or the background — they stay exactly as in the first image.`
        : `Do not edit the existing people or the background — they stay exactly as in the first image.`;
    // Size hint — pose-neutral language (no "head-to-feet", no "standing").
    // The user's slider adjusts sizeAdjustment in the range [0.5, 2.0]. We
    // previously consumed this via enforceTargetSize (disabled, produced ghost
    // artifacts) and a prompt clause (removed with the full prompt rewrite).
    // NB2 honors relative-size language reasonably well when the rest of the
    // prompt doesn't contradict it.
    const sizePct = Math.round(sizeAdjustment * 100);
    const sizeSentence =
      sizeAdjustment >= 0.95 && sizeAdjustment <= 1.05
        ? `${subjectTerm}'s size should match the rest of the group — the same scale as the existing people, as one natural member of the group.`
        : sizeAdjustment < 1.0
          ? `${subjectTerm} should appear about ${sizePct}% of the size of the existing people in the photo — noticeably smaller than the group, as if naturally shorter or further from the camera.`
          : `${subjectTerm} should appear about ${sizePct}% of the size of the existing people in the photo — noticeably larger than the group, as if naturally taller or closer to the camera.`;

    const basePrompt = [
      `Add ${subjectTerm} from the second image to the first image ${PLACEMENT_PHRASE[placement]}, producing a single natural photograph that looks like they were actually there when the photo was taken.`,
      existingSentence,
      `You may extend ${subjectTerm}'s body naturally if the portrait shows only their face, head, or shoulders. Match their pose to the rest of the group (sitting if they sit, standing if they stand). Adjust lighting, shadows, and sunlight on ${subjectTerm} to blend with the scene.`,
      sizeSentence,
      // Explicit identity anchor. The single-sentence version ("keep their
      // face, identity, and clothing") drifted ~1-in-3 — NB2 would sometimes
      // repaint the face with generic features (losing glasses, changing
      // smile, smoothing hair). Enumerating each feature the model tends to
      // "improve" forces it to treat the portrait as canonical instead.
      `${subjectTerm}'s face must match the second image EXACTLY — same facial features, same eyes, same nose, same mouth, same smile (open-mouth if open, closed-mouth if closed), same skin tone and texture, same glasses (if any), same earrings or other jewelry, same hair style, same hair color, same facial expression. Do not redraw, smooth, stylize, or "improve" their face. Their clothing (pattern, colors, cut, fabric) must also match the portrait. Treat the second image as the canonical source of their identity.`,
      countSentence,
    ].join('\n\n');

    // Pristine-main passthrough architecture (2026-04-22c). NB2 receives
    // the ORIGINAL main photo unchanged — no zoom-out, no canvas extension,
    // no bokeh surround. Output dims = NB2's natural output for the input
    // aspect (typically 2K). The restore pass below pins every output pixel
    // to the pristine main except inside the loved-one silhouette.
    //
    // Why this replaces the zoom-out architecture:
    //   - Zoom-out shrunk the family to 70% scale and surrounded it with a
    //     mirror-blur bokeh frame. Users read this as "the photo got bigger
    //     with a blurred border" and "the main is being edited" — both
    //     accurate descriptions of what was happening. Centering the family
    //     inside the bokeh frame (the prior 50/50 fix) didn't address the
    //     core complaint.
    //   - Side-extension (the architecture before zoom-out) made the output
    //     wider than the input — users read THAT as "family pushed to one
    //     side." Both side-extension and zoom-out modify the canvas to give
    //     NB2 a guaranteed empty area for the loved one.
    //   - Pristine-main passthrough trusts NB2 to find a natural place for
    //     the loved one within the existing main photo (the prompt's
    //     FRAMING block instructs it to). No canvas modification → no
    //     bokeh, no family shrinkage, no "is this the same photo?" confusion.
    //
    // Trade-off: NB2 must respect the FRAMING instruction or the loved one
    // can land flush with a canvas edge. We log edgeDistPx and surface it
    // in the debug response so this is visible; if it turns out to be a
    // common failure, retry-on-clip can be added cheaply (the runNb2Merge
    // helper already computes edgeDistPx).
    // (mainSegmentation was computed earlier so its count could feed the prompt.)

    // Send the original loved-one portrait unchanged. The previous
    // extendPortraitForBodyContext preprocessing (rembg → trim → extend onto
    // 1.2w × 2.8h canvas) was added to fight NB2's head-shot framing bias,
    // but the simplified prompt already tells NB2 "you may extend the body
    // naturally if the portrait shows only face/shoulders" — no preprocessing
    // needed. User feedback: stop manipulating the portrait before NB2 sees
    // it. The function still exists for reference; we just don't call it.
    const lovedOneForMerge = lovedOnePhotoUrl;

    const prompt = basePrompt;

    // Single NB2 call. The FRAMING block in basePrompt already tells NB2
    // to keep the loved one inset from the edges with 8-12% margin; the
    // restore pass below pins every other pixel to the pristine main.
    const nb2Start = Date.now();
    const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
      input: {
        prompt,
        image_urls: [mainPhotoUrl, lovedOneForMerge],
        resolution: '2K',
        output_format: 'png',
        aspect_ratio: 'auto',
      },
      logs: false,
    });
    const nb2Ms = Date.now() - nb2Start;

    const nb2RawUrl = extractFirstImageUrl(result.data);
    if (!nb2RawUrl) throw errors.fal('Nano Banana 2 returned no merge image');

    // Segment the raw NB2 output to find the loved one. We need her
    // silhouette mask for the silhouette-aware restore below.
    const outputSegmentation = await measureSubjects(nb2RawUrl);
    let addedSubject: ReturnType<typeof findAddedSubject> = null;
    if (outputSegmentation && outputSegmentation.subjects.length > 0) {
      const mainCtx =
        mainSegmentation && mainSegmentation.subjects.length > 0
          ? {
              subjects: mainSegmentation.subjects,
              width: mainSegmentation.width,
              height: mainSegmentation.height,
              outputWidth: outputSegmentation.width,
              outputHeight: outputSegmentation.height,
            }
          : undefined;
      addedSubject = findAddedSubject(outputSegmentation.subjects, placement, mainCtx);
    }

    // Edge-clip detection. Distance from added-subject bbox to nearest
    // output frame edge, in output px. <3% of the smaller output dim is
    // suspicious — NB2 likely placed the loved one flush against an edge,
    // which user-reads as "body sliced at the canvas edge."
    let edgeDistPx = Infinity;
    let edgeClipped = false;
    if (addedSubject && outputSegmentation) {
      const [x1, y1, x2, y2] = addedSubject.bbox;
      edgeDistPx = Math.min(
        x1,
        outputSegmentation.width - x2,
        y1,
        outputSegmentation.height - y2,
      );
      const minDim = Math.min(outputSegmentation.width, outputSegmentation.height);
      edgeClipped = edgeDistPx < minDim * 0.03;
    }
    if (edgeClipped) {
      logger.warn(
        { edgeDistPx, addedBbox: addedSubject?.bbox, outputDims: outputSegmentation && { w: outputSegmentation.width, h: outputSegmentation.height } },
        'merge: loved-one bbox is flush with output edge (NB2 ignored FRAMING instruction)',
      );
    }

    let finalUrl = nb2RawUrl;

    // Pristine-main passthrough restore. Every output pixel comes from the
    // original main photo, EXCEPT inside the loved-one silhouette (where
    // NB2's painted pixels survive). Silhouette is feathered for soft
    // hair-wisp / clothing-fringe transitions.
    //
    // Bypassed when MERGE_SKIP_RESTORE=true: NB2's raw output becomes the
    // final image. The restore guarantees byte-perfect family pixels but
    // creates a visible boundary where NB2 painted hair wisps, shadows, or
    // hallucinated extras get hard-clipped at the silhouette edge ("box
    // around the loved one"). Skipping the restore eliminates that boundary
    // entirely; family fidelity then relies on the prompt's "PRESERVE THE
    // EXISTING PEOPLE AND BACKGROUND" clause above.
    const restoreStart = Date.now();
    let mainRestored = false;
    if (env.MERGE_SKIP_RESTORE) {
      logger.info(
        { mergeSkipRestore: true },
        'restorePristineMain skipped (MERGE_SKIP_RESTORE=true); using NB2 raw output',
      );
    } else {
      const restored = await restorePristineMain({
        nb2OutputUrl: finalUrl,
        mainPhotoUrl,
        subjectMaskUrl: addedSubject?.maskUrl ?? null,
      });
      if (restored) {
        finalUrl = restored;
        mainRestored = true;
      }
    }
    const restoreMs = Date.now() - restoreStart;

    // Size enforcement. NB2 ignores the prompt's SIZE hint pretty
    // consistently — left alone, it paints the loved one standing
    // tall to fill the placement-side area, ending up ~1.7× the
    // height of the (sitting) family. enforceTargetSize measures the
    // bbox, computes target = avgNeighborHeight × sizeAdjustment in
    // output pixels, and rescales the subject in-place when ratio is
    // outside ±10%. Skipped for placement='behind' (rescaling there
    // breaks z-order occlusion) and when no addedSubject was found
    // (no one to rescale).
    //
    // Bypassed when MERGE_SKIP_RESTORE=true: the rescale path runs an
    // independent heal-pass that overlays main pixels onto NB2's output
    // through the subject mask. When NB2's chosen aspect or position
    // differs from main, the heal pass paints stretched/repositioned main
    // pixels into the subject region — visible as a "ghost brunette" near
    // the loved one (where the mom's stretched position falls inside the
    // mask) AND a rectangular healed-area boundary ("box around the loved
    // one"). Skipping enforce removes both artifacts at the cost of
    // trusting NB2's sizing — which our updated prompt's HEAD ALIGNMENT +
    // GROUND/WAIST ALIGNMENT clauses already enforce reliably.
    const enforceStart = Date.now();
    let sizeCorrection: string = 'skipped';
    let actualHeightPx: number | undefined;
    let targetHeightPx: number | undefined;
    if (env.MERGE_SKIP_RESTORE) {
      sizeCorrection = 'skipped-flag';
      logger.info(
        { mergeSkipRestore: true },
        'enforceTargetSize skipped (MERGE_SKIP_RESTORE=true); trusting NB2 sizing',
      );
    } else if (addedSubject && outputSegmentation) {
      try {
        const enforceResult = await enforceTargetSize({
          mergedUrl: finalUrl,
          mainPhotoUrl,
          mainSegmentation,
          outputSegmentation,
          addedSubject,
          sizeAdjustment,
          placement,
        });
        finalUrl = enforceResult.url;
        sizeCorrection = enforceResult.correction;
        actualHeightPx = enforceResult.actualHeightPx;
        targetHeightPx = enforceResult.targetHeightPx;
      } catch (enforceErr) {
        logger.warn({ enforceErr }, 'enforceTargetSize threw; keeping pre-enforcer URL');
        sizeCorrection = 'rescale-failed';
      }
    }
    const enforceMs = Date.now() - enforceStart;

    logger.info(
      {
        nb2Ms,
        restoreMs,
        enforceMs,
        totalMs: nb2Ms + restoreMs + enforceMs,
        placement,
        sizeAdjustment,
        mainRestored,
        sizeCorrection,
        actualHeightPx,
        targetHeightPx,
        addedBbox: addedSubject?.bbox,
        addedMaskUrl: addedSubject?.maskUrl ?? null,
        edgeDistPx: Number.isFinite(edgeDistPx) ? edgeDistPx : null,
        edgeClipped,
      },
      'merge timing',
    );

    // Charge the credit after the full pipeline (NB2 + restore) succeeded.
    // A failure anywhere upstream throws before this line, so fal/storage
    // errors never burn the user's balance.
    const creditsRemaining = await spendCredits(userId, 'merge', {
      dedupeKey: saveId,
    });
    // Free-tier: flip merge_used so a second reunite attempt paywalls.
    await markFreeTierFlowUsed(userId, 'reunite');

    ok(res, {
      imageUrl: finalUrl,
      prompt,
      placement,
      creditsRemaining,
      // Stage URLs for debugging transparency / artifact regressions —
      // safe to expose: they're already public fal.media URLs.
      debug: {
        extendedPortraitUrl:
          lovedOneForMerge !== lovedOnePhotoUrl ? lovedOneForMerge : null,
        nb2RawUrl,
        finalUrl,
        addedBbox: addedSubject?.bbox ?? null,
        addedMaskUrl: addedSubject?.maskUrl ?? null,
        outputDims: outputSegmentation
          ? { width: outputSegmentation.width, height: outputSegmentation.height }
          : null,
        mainRestored,
        edgeDistPx: Number.isFinite(edgeDistPx) ? edgeDistPx : null,
        edgeClipped,
        sizeCorrection,
        actualHeightPx,
        targetHeightPx,
      },
    });
  } catch (err) {
    logger.error({ err }, 'spike merge failed');
    next(err);
  }
  },
);

// -----------------------------------------------------------------------------
// GET /api/spike/templates — return launch templates from shared constants
// -----------------------------------------------------------------------------
spikeRouter.get('/templates', (_req, res) => {
  const templates: TributeTemplate[] = LAUNCH_TEMPLATES;
  ok(res, { templates });
});
