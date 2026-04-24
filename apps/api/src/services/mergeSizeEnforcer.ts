// =============================================================================
// HaloFrame API — merge size enforcer
//
// Post-process step for the Reunite flow. Nano Banana 2 ignores size prompts
// (the scale % directive does not measurably change output size — verified in
// user testing). This module enforces `sizeAdjustment` deterministically by:
//
//   1. Measuring neighbor heights in the main photo (SAM-3 person detection).
//   2. Finding the NB2-added subject in the merged output (same detection).
//   3. Computing a target pixel height = avgNeighborHeight × sizeAdjustment.
//   4. If the actual height differs by more than TOLERANCE, extracting the
//      subject from the NB2 output, resizing them, and recompositing onto
//      the pristine main photo (which is guaranteed to match the preview).
//
// 'behind' placement is intentionally skipped — rescaling there would break
// NB2's z-order occlusion (subject partially hidden by the group in front),
// and repairing it would require per-subject masking. The common placements
// (left / right / front) are what the user sees break most often.
//
// Identity is preserved via NB2's LOCKED-face prompt block; the previous
// face-swap post-pass was removed 2026-04-22 after A/B testing showed it
// added grain artifacts + 65% of merge latency without meaningful identity
// improvement.
// =============================================================================
import sharp from 'sharp';
import { fal } from '@fal-ai/client';
import type { Placement } from '@haloframe/shared';
import { logger } from '../config/logger.js';

// -----------------------------------------------------------------------------
// Tuning constants. Kept here so they're easy to find when this gets revisited.
// -----------------------------------------------------------------------------
/**
 * If actual height / target height is within 1 ± this value, skip correction.
 * Smaller tolerance = more aggressive correction = more compute + more chance
 * of artifacts. 0.1 keeps us in "obviously off" territory without firing on
 * every small NB2 variance.
 */
const SIZE_TOLERANCE = 0.1;

/**
 * Sanity bounds on the correction scale factor. If we'd need to scale the
 * subject by more than 2× or less than 0.5× to match target, something is
 * probably wrong with detection (e.g. the bbox snapped to a tiny feature).
 * Skip the correction rather than produce a grotesque output.
 */
const MIN_SCALE_FACTOR = 0.5;
const MAX_SCALE_FACTOR = 2.0;

/**
 * Feather (Gaussian blur sigma) applied to the subject's alpha mask before
 * compositing onto the main photo. 3 is enough to hide a 1-pixel seam on 2K
 * outputs without eating detail on hair/clothing edges.
 */
const EDGE_FEATHER_SIGMA = 3;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
export interface SubjectInfo {
  /** [x1, y1, x2, y2] in image pixel coordinates. */
  bbox: [number, number, number, number];
  /** URL to a binary mask PNG (red channel > 127 = subject pixel). */
  maskUrl: string;
  /** Number of pixels in the mask — used to filter tiny noise masks. */
  pixelCount: number;
}

export interface PhotoSegmentation {
  width: number;
  height: number;
  subjects: SubjectInfo[];
}

export type CorrectionKind =
  | 'no-main-neighbors'
  | 'no-dimensions'
  | 'within-tolerance'
  | 'skipped-behind'
  | 'rescaled'
  | 'rescale-clamped'
  | 'rescale-failed';

export interface EnforceResult {
  url: string;
  correction: CorrectionKind;
  /** Actual added-subject height in output pixels (when measurable). */
  actualHeightPx?: number;
  /** Target height in output pixels (avgNeighborHeight × sizeAdjustment). */
  targetHeightPx?: number;
}

// -----------------------------------------------------------------------------
// SAM-3 person detection. Local helper duplicated from /segment route so this
// service can stand alone — only ~15 lines, not worth exporting.
// -----------------------------------------------------------------------------
export async function measureSubjects(
  imageUrl: string,
): Promise<PhotoSegmentation | null> {
  try {
    const result = await fal.subscribe('fal-ai/sam-3/image', {
      input: {
        image_url: imageUrl,
        prompt: 'person',
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
    };
    const masks = data.masks ?? [];
    if (masks.length === 0) return { width: 0, height: 0, subjects: [] };

    // SAM-3 sometimes omits image.width/height — probe the source image via
    // sharp as a fallback so the rest of the pipeline has real dims.
    let width = data.image?.width ?? 0;
    let height = data.image?.height ?? 0;
    if (!width || !height) {
      try {
        const resp = await fetch(imageUrl);
        const buf = Buffer.from(await resp.arrayBuffer());
        const meta = await sharp(buf).metadata();
        width = meta.width ?? 0;
        height = meta.height ?? 0;
      } catch (probeErr) {
        logger.warn({ probeErr, imageUrl }, 'image size probe failed');
      }
    }

    const analyzed = await Promise.all(
      masks.map(async (m) => {
        const stats = await analyzeMaskBbox(m.url);
        return stats ? { ...stats, maskUrl: m.url } : null;
      }),
    );

    // Filter tiny noise masks (<0.25% of image).
    const minPixels = Math.max(500, Math.round((width * height) / 400));
    const subjects: SubjectInfo[] = analyzed
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .filter((s) => s.pixelCount >= minPixels);

    return { width, height, subjects };
  } catch (err) {
    logger.warn({ err, imageUrl }, 'measureSubjects failed');
    return null;
  }
}

/**
 * SAM-3 with `apply_mask: true` returns the source image with the subject
 * encoded in the ALPHA channel (subject = opaque, background = transparent).
 * Reading the red channel (the pattern used by the older /segment endpoint)
 * misses most subject pixels on anyone with dark skin or dark clothing —
 * produces a 172-pixel bbox for a full-size person. This reads alpha.
 */
async function analyzeMaskBbox(
  maskUrl: string,
): Promise<{ bbox: [number, number, number, number]; pixelCount: number } | null> {
  try {
    const resp = await fetch(maskUrl);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());

    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        const a = data[idx + 3] ?? 0;
        if (a > 127) {
          count++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (count === 0) return null;
    return { bbox: [minX, minY, maxX, maxY], pixelCount: count };
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Identify which output subject is the NB2-added loved one.
//
// First strategy (robust): find output subjects whose bbox doesn't match any
// main-photo subject in normalized coordinates — those are the "new" people
// (should be exactly one, the added loved one). If a placement-side main
// subject exists, the extremum heuristic alone would pick them instead of the
// loved one, and we'd heal the wrong body + rescale them.
//
// Fallback (when main segmentation is unavailable): placement extremum.
// -----------------------------------------------------------------------------
function normalizeBbox(
  bbox: [number, number, number, number],
  width: number,
  height: number,
): [number, number, number, number] {
  return [bbox[0] / width, bbox[1] / height, bbox[2] / width, bbox[3] / height];
}

function bboxIoU(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  const ix1 = Math.max(a[0], b[0]);
  const iy1 = Math.max(a[1], b[1]);
  const ix2 = Math.min(a[2], b[2]);
  const iy2 = Math.min(a[3], b[3]);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  const inter = (ix2 - ix1) * (iy2 - iy1);
  const areaA = (a[2] - a[0]) * (a[3] - a[1]);
  const areaB = (b[2] - b[0]) * (b[3] - b[1]);
  return inter / (areaA + areaB - inter);
}

function pickByPlacement(
  subjects: SubjectInfo[],
  placement: Placement,
): SubjectInfo | null {
  if (subjects.length === 0) return null;
  const first = subjects[0]!;
  switch (placement) {
    case 'left': {
      let best = first;
      for (const s of subjects) if (s.bbox[0] < best.bbox[0]) best = s;
      return best;
    }
    case 'right': {
      let best = first;
      for (const s of subjects) if (s.bbox[2] > best.bbox[2]) best = s;
      return best;
    }
    case 'behind': {
      let best = first;
      for (const s of subjects) if (s.bbox[1] < best.bbox[1]) best = s;
      return best;
    }
    case 'front': {
      let best = first;
      for (const s of subjects) if (s.bbox[3] > best.bbox[3]) best = s;
      return best;
    }
    default:
      return first;
  }
}

export function findAddedSubject(
  outputSubjects: SubjectInfo[],
  placement: Placement,
  mainContext?: {
    subjects: SubjectInfo[];
    width: number;
    height: number;
    outputWidth: number;
    outputHeight: number;
  },
): SubjectInfo | null {
  if (outputSubjects.length === 0) return null;

  if (mainContext && mainContext.subjects.length > 0) {
    const unmatched = outputSubjects.filter((out) => {
      const outNorm = normalizeBbox(
        out.bbox,
        mainContext.outputWidth,
        mainContext.outputHeight,
      );
      for (const m of mainContext.subjects) {
        const mNorm = normalizeBbox(m.bbox, mainContext.width, mainContext.height);
        if (bboxIoU(mNorm, outNorm) > 0.3) return false;
      }
      return true;
    });
    // Prefer placement-side pick within the unmatched set; with exactly one
    // unmatched subject (the common case) this just returns it.
    if (unmatched.length > 0) return pickByPlacement(unmatched, placement);
  }
  // Fallback: no main context or everyone matched — use extremum.
  return pickByPlacement(outputSubjects, placement);
}

// -----------------------------------------------------------------------------
// Main orchestrator.
// -----------------------------------------------------------------------------
export async function enforceTargetSize(args: {
  mergedUrl: string;
  mainPhotoUrl: string;
  mainSegmentation: PhotoSegmentation | null;
  outputSegmentation: PhotoSegmentation;
  addedSubject: SubjectInfo;
  sizeAdjustment: number;
  placement: Placement;
}): Promise<EnforceResult> {
  const {
    mergedUrl,
    mainPhotoUrl,
    mainSegmentation,
    outputSegmentation,
    addedSubject,
    sizeAdjustment,
    placement,
  } = args;

  // 'behind' correction would require compositing the resized subject BEHIND
  // the existing people (using their output masks as z-order gates). We don't
  // have a good story for that yet — the subject would read as "pasted in
  // front" if we naively composited onto main. Preserve NB2's output instead;
  // the slider effect is minor for behind placement regardless.
  if (placement === 'behind') {
    return { url: mergedUrl, correction: 'skipped-behind' };
  }

  // No neighbors in main photo → "% of neighbors' height" is undefined. The
  // user's slider is meant to scale RELATIVE to the existing group; a solo
  // main photo has no relative reference.
  if (!mainSegmentation || mainSegmentation.subjects.length === 0) {
    return { url: mergedUrl, correction: 'no-main-neighbors' };
  }

  const { width: mainW, height: mainH } = mainSegmentation;
  const { width: outputW, height: outputH } = outputSegmentation;
  if (!mainH || !outputH || !mainW || !outputW) {
    return { url: mergedUrl, correction: 'no-dimensions' };
  }

  // Compute target in OUTPUT pixel space. We measure in main space then
  // scale up to output, because NB2's 2K output is often larger than the
  // upload; doing the math in output space keeps everything downstream
  // (crop, resize, paste) in one coordinate system.
  const neighborHeights = mainSegmentation.subjects.map((s) => s.bbox[3] - s.bbox[1]);
  const avgNeighborMain = neighborHeights.reduce((a, b) => a + b, 0) / neighborHeights.length;
  const mainToOutputScale = outputH / mainH;
  const targetHeightPx = avgNeighborMain * mainToOutputScale * sizeAdjustment;

  const actualHeightPx = addedSubject.bbox[3] - addedSubject.bbox[1];
  if (actualHeightPx <= 0) {
    return { url: mergedUrl, correction: 'no-dimensions', targetHeightPx };
  }

  const ratio = actualHeightPx / targetHeightPx;
  if (ratio > 1 - SIZE_TOLERANCE && ratio < 1 + SIZE_TOLERANCE) {
    return {
      url: mergedUrl,
      correction: 'within-tolerance',
      actualHeightPx,
      targetHeightPx,
    };
  }

  const scaleFactor = targetHeightPx / actualHeightPx;
  if (scaleFactor < MIN_SCALE_FACTOR || scaleFactor > MAX_SCALE_FACTOR) {
    // A detection error or a wildly extreme slider would land here. Refuse
    // to produce a distorted result — the raw NB2 output is still usable.
    return {
      url: mergedUrl,
      correction: 'rescale-clamped',
      actualHeightPx,
      targetHeightPx,
    };
  }

  try {
    const correctedUrl = await rescaleSubjectInOutput({
      mergedUrl,
      mainPhotoUrl,
      addedSubject,
      outputWidth: outputW,
      outputHeight: outputH,
      targetHeightPx,
      placement,
    });
    return {
      url: correctedUrl,
      correction: 'rescaled',
      actualHeightPx,
      targetHeightPx,
    };
  } catch (err) {
    logger.warn({ err }, 'size correction failed; returning raw merge');
    return {
      url: mergedUrl,
      correction: 'rescale-failed',
      actualHeightPx,
      targetHeightPx,
    };
  }
}

// -----------------------------------------------------------------------------
// The actual image work.
//
// Architecture: NB2 output is the base. The subject gets extracted, resized,
// and pasted back on top of the same NB2 output — so the subject keeps the
// lighting context NB2 adapted them to. Main photo is used only to HEAL the
// pixels where the (bigger, original) subject used to occupy the frame; NB2's
// own rendering of that area would show "ghost subject" pixels after the
// smaller resized subject is pasted.
//
// Why not main-as-base (previous iteration):
//   - NB2 renders the subject to blend with NB2's scene lighting. Pasting
//     that subject onto the pristine main photo orphans them from the
//     lighting context they were designed for — the classic "cutout on the
//     wrong backdrop" / "pasted in a box" look the user called out.
//   - Using NB2 as base preserves scene/subject lighting coherence.
// -----------------------------------------------------------------------------
async function rescaleSubjectInOutput(args: {
  mergedUrl: string;
  mainPhotoUrl: string;
  addedSubject: SubjectInfo;
  outputWidth: number;
  outputHeight: number;
  targetHeightPx: number;
  placement: Placement;
}): Promise<string> {
  const {
    mergedUrl,
    mainPhotoUrl,
    addedSubject,
    outputWidth: W,
    outputHeight: H,
    targetHeightPx,
    placement,
  } = args;

  const [mergedResp, maskResp, mainResp] = await Promise.all([
    fetch(mergedUrl),
    fetch(addedSubject.maskUrl),
    fetch(mainPhotoUrl),
  ]);
  if (!mergedResp.ok || !maskResp.ok || !mainResp.ok) {
    throw new Error(
      `rescale fetch failed: merged=${mergedResp.status} mask=${maskResp.status} main=${mainResp.status}`,
    );
  }

  const mergedBuf = Buffer.from(await mergedResp.arrayBuffer());
  const maskBuf = Buffer.from(await maskResp.arrayBuffer());
  const mainBuf = Buffer.from(await mainResp.arrayBuffer());

  // NB2 output at output resolution becomes the canvas. The loved-one subject
  // is currently embedded in NB2's integrated scene; we'll extract and replace
  // them in the same canvas at the new scale.
  const nb2BaseRgb = await sharp(mergedBuf)
    .resize(W, H, { fit: 'fill' })
    .removeAlpha()
    .png()
    .toBuffer();

  // SAM-3 encodes the subject mask in the ALPHA channel of the mask PNG (not
  // red — see analyzeMaskBbox). Explicit `.raw()` forces single-channel raw
  // byte output so downstream joinChannel's raw interpretation is defined;
  // without it sharp emits PNG and joinChannel throws "memory area too small".
  const maskAligned = await sharp(maskBuf)
    .resize(W, H, { fit: 'fill' })
    .extractChannel('alpha')
    .raw()
    .toBuffer();

  // Dilate then feather the subject mask. The dilation (blur(2)+threshold(80))
  // expands the mask outward by ~1-2px so the subsequent feather doesn't eat
  // visible subject-edge pixels. The feather (blur sigma=3) gives smooth
  // compositing edges so the heal pass and rescaled subject blend without a
  // hard seam.
  //
  // .toColorspace('b-w') is load-bearing: without it sharp's .blur() silently
  // promotes the single-channel raw input to a 3-channel buffer. The next
  // pipeline that declares `channels: 1` then reads the wrong slice of that
  // 3× buffer, garbling alpha values to near-zero. Net effect: the heal mask
  // becomes effectively black, the heal does nothing, and the original
  // NB2-painted subject survives as a ghost above the rescaled paste-back.
  // (Verified 2026-04-23 — see SAM-3 + Sharp gotchas in memory.)
  const featheredMask = await sharp(maskAligned, {
    raw: { width: W, height: H, channels: 1 },
  })
    .blur(2)
    .threshold(80)
    .blur(EDGE_FEATHER_SIGMA)
    .toColorspace('b-w')
    .raw()
    .toBuffer();

  // --- HEAL PASS ---------------------------------------------------------
  // Overlay main-photo pixels onto NB2 base at the old subject's location.
  // Purpose: when the resized subject is pasted at a smaller size, there
  // would otherwise be a remaining "ghost" of the NB2-rendered subject.
  // Main pixels restore the pristine background. The featheredMask alpha
  // fades the heal region into NB2's rendering at its boundary so there's
  // no hard seam.
  const mainResized = await sharp(mainBuf)
    .resize(W, H, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer();

  const mainWithSubjectAlpha = await sharp(mainResized, {
    raw: {
      width: W,
      height: H,
      channels: 3,
    },
  })
    .joinChannel(featheredMask, {
      raw: { width: W, height: H, channels: 1 },
    })
    .png()
    .toBuffer();

  const healedBase = await sharp(nb2BaseRgb)
    .composite([{ input: mainWithSubjectAlpha, blend: 'over' }])
    .png()
    .toBuffer();

  // --- SUBJECT EXTRACTION + RESIZE ---------------------------------------
  // Re-read NB2 output with the feathered mask as alpha, then crop to the
  // subject's bbox so we don't drag a full-frame transparent PNG into the
  // resize step (much smaller buffer, proportionally faster).
  const subjectRgba = await sharp(mergedBuf)
    .resize(W, H, { fit: 'fill' })
    .removeAlpha()
    .joinChannel(featheredMask, {
      raw: { width: W, height: H, channels: 1 },
    })
    .png()
    .toBuffer();

  const [x1, y1, x2, y2] = addedSubject.bbox;
  const bboxW = Math.max(1, x2 - x1);
  const bboxH = Math.max(1, y2 - y1);

  const cropLeft = Math.max(0, Math.min(W - 1, x1));
  const cropTop = Math.max(0, Math.min(H - 1, y1));
  const cropWidth = Math.max(1, Math.min(bboxW, W - cropLeft));
  const cropHeight = Math.max(1, Math.min(bboxH, H - cropTop));

  const subjectCropped = await sharp(subjectRgba)
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .toBuffer();

  const scaleFactor = targetHeightPx / cropHeight;
  const newW = Math.max(1, Math.round(cropWidth * scaleFactor));
  const newH = Math.max(1, Math.round(cropHeight * scaleFactor));
  const subjectResized = await sharp(subjectCropped)
    .resize(newW, newH, { fit: 'fill' })
    .png()
    .toBuffer();

  // --- PLACEMENT ---------------------------------------------------------
  // Horizontal: keep NB2's chosen center-x so placement side stays honored.
  // Vertical: anchor at the original bbox's bottom so feet stay on the
  // ground line. For 'front' that keeps the subject's feet near the frame
  // bottom; for 'left'/'right' they stand level with the group.
  const origCenterX = (x1 + x2) / 2;
  const origBottomY = y2;
  const newLeft = Math.round(origCenterX - newW / 2);
  const newTop = Math.round(origBottomY - newH);

  const finalLeft = Math.max(0, Math.min(W - newW, newLeft));
  const finalTop = Math.max(0, Math.min(H - newH, newTop));

  // Final: healed base + rescaled subject on top.
  const finalBuf = await sharp(healedBase)
    .composite([{ input: subjectResized, left: finalLeft, top: finalTop, blend: 'over' }])
    .png()
    .toBuffer();

  const file = new File([new Uint8Array(finalBuf)], `merge-size-corrected-${placement}.png`, {
    type: 'image/png',
  });
  return await fal.storage.upload(file);
}
