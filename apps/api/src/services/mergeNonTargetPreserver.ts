// =============================================================================
// HaloFrame API — non-target preservation for the Reunite merge
//
// Nano Banana 2 modifies non-target faces (user reports missing eyebrows,
// altered beards) despite prompt-level instructions to preserve the scene.
// The existing /apply route handles this via `preserveNonTargetSubjects` in
// routes/spike.ts but that implementation reads the RED channel of SAM-3
// masks — SAM-3 actually encodes masks in the ALPHA channel (~7000 vs ~170
// pixels captured on the same mask, discovered while fixing the size
// enforcer). That latent bug is left alone in /apply for now; this service
// is a clean reimplementation that reads alpha correctly and is gated by
// IoU so we don't smear stale main-photo pixels over a neighbor NB2 shifted.
// =============================================================================
import sharp from 'sharp';
import { fal } from '@fal-ai/client';
import { logger } from '../config/logger.js';
import type { PhotoSegmentation, SubjectInfo } from './mergeSizeEnforcer.js';

/**
 * Gaussian blur sigma applied to the combined non-target mask. 6 matches the
 * /apply pattern — enough to hide a seam on 2K outputs without leaking the
 * mask into neighboring regions.
 */
const EDGE_FEATHER_SIGMA = 6;

/**
 * Minimum bbox IoU (in normalized image coordinates) for a main-photo subject
 * to be considered "still at the same place" in the NB2 output. Below this,
 * we assume NB2 shifted the person enough that compositing their main-photo
 * pixels over the output would create a double-exposure artifact instead of
 * restoring them.
 */
const MATCH_IOU_MIN = 0.3;

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

/**
 * Returns the subset of main-photo subjects whose bboxes still match an
 * output subject (excluding the added one) within IoU threshold. Main
 * subjects that NB2 apparently moved or dropped get filtered out so we
 * don't composite their main pixels over the wrong place in the output.
 */
export function selectPreservableMainSubjects(args: {
  mainSegmentation: PhotoSegmentation;
  outputSegmentation: PhotoSegmentation;
  addedSubject: SubjectInfo;
}): SubjectInfo[] {
  const { mainSegmentation, outputSegmentation, addedSubject } = args;
  const preservable: SubjectInfo[] = [];

  for (const mainSubj of mainSegmentation.subjects) {
    const mainNorm = normalizeBbox(
      mainSubj.bbox,
      mainSegmentation.width,
      mainSegmentation.height,
    );

    let bestIoU = 0;
    for (const outSubj of outputSegmentation.subjects) {
      // Skip the added subject — it's not in the main photo by definition.
      if (
        outSubj.bbox[0] === addedSubject.bbox[0] &&
        outSubj.bbox[1] === addedSubject.bbox[1] &&
        outSubj.bbox[2] === addedSubject.bbox[2] &&
        outSubj.bbox[3] === addedSubject.bbox[3]
      ) {
        continue;
      }
      const outNorm = normalizeBbox(
        outSubj.bbox,
        outputSegmentation.width,
        outputSegmentation.height,
      );
      const iou = bboxIoU(mainNorm, outNorm);
      if (iou > bestIoU) bestIoU = iou;
    }

    if (bestIoU >= MATCH_IOU_MIN) {
      preservable.push(mainSubj);
    } else {
      logger.info(
        { mainBbox: mainSubj.bbox, bestIoU },
        'skipping preservation: main subject has no close match in output',
      );
    }
  }

  return preservable;
}

/**
 * Composite main-photo pixels back over the NB2 output at every preservable
 * subject's mask location, using a feathered-alpha blend so the restored
 * regions melt into the NB2 scene without a seam. Returns the uploaded URL
 * of the composited image, or `null` on failure (caller should fall back
 * to the uncorrected NB2 output).
 *
 * `addedSubjectMaskUrl`: when provided, subtracted from the combined mask
 * so preservation cannot paint main pixels onto the loved one (even at the
 * feathered edge — a mom's mask edge 15px from the loved one's left edge
 * was bleeding into her body and making her look semi-transparent).
 *
 * `addedBbox`: when provided, carved out of the combined mask in full.
 * Primary protection against the bleed documented above — SAM-3's mask
 * of the loved one in NB2's output often misses her lower body (NB2
 * renders torso but SAM stops at a waist-ish boundary), leaving a window
 * where main-photo wall pixels paint over her legs/chest and make her
 * look semi-transparent. The bbox is SAM's bounding rectangle of her
 * visible silhouette; carving it entirely means main pixels can never
 * land inside that rectangle even if her mask has gaps.
 */
export async function preservePeopleFromMain(args: {
  mainPhotoUrl: string;
  editedImageUrl: string;
  maskUrls: string[];
  addedSubjectMaskUrl?: string;
  addedBbox?: [number, number, number, number];
}): Promise<string | null> {
  const { mainPhotoUrl, editedImageUrl, maskUrls, addedSubjectMaskUrl, addedBbox } = args;
  if (maskUrls.length === 0) return editedImageUrl;

  try {
    const [mainResp, editedResp, addedResp, ...maskResps] = await Promise.all([
      fetch(mainPhotoUrl),
      fetch(editedImageUrl),
      addedSubjectMaskUrl
        ? fetch(addedSubjectMaskUrl)
        : Promise.resolve(null as unknown as Response),
      ...maskUrls.map((url) => fetch(url)),
    ]);
    if (!mainResp.ok || !editedResp.ok) {
      throw new Error(
        `preserve fetch failed: main=${mainResp.status} edited=${editedResp.status}`,
      );
    }
    for (const m of maskResps) {
      if (!m.ok) throw new Error(`preserve mask fetch failed: ${m.status}`);
    }

    const mainBuf = Buffer.from(await mainResp.arrayBuffer());
    const editedBuf = Buffer.from(await editedResp.arrayBuffer());
    const maskBufs = await Promise.all(
      maskResps.map(async (r) => Buffer.from(await r.arrayBuffer())),
    );
    const addedMaskBuf =
      addedSubjectMaskUrl && addedResp && addedResp.ok
        ? Buffer.from(await addedResp.arrayBuffer())
        : null;

    const editedMeta = await sharp(editedBuf).metadata();
    const W = editedMeta.width;
    const H = editedMeta.height;
    if (!W || !H) throw new Error('preserve: edited output has no dimensions');

    // Extract each mask's ALPHA channel (SAM-3 encodes the mask in alpha,
    // not red — see analyzeMaskBbox in mergeSizeEnforcer.ts) and resize to
    // the edited output's dimensions. `.raw()` forces single-channel raw
    // byte output so the subsequent joinChannel reads them correctly.
    const resizedMasks = await Promise.all(
      maskBufs.map(async (buf) =>
        sharp(buf)
          .resize(W, H, { fit: 'fill' })
          .extractChannel('alpha')
          .raw()
          .toBuffer(),
      ),
    );

    // Combine masks with a per-pixel MAX — any subject wants this pixel, so
    // we restore from main. Iterating raw bytes is the simplest correct op.
    const combined = Buffer.alloc(W * H);
    for (const m of resizedMasks) {
      for (let i = 0; i < combined.length; i++) {
        const v = m[i] ?? 0;
        if (v > (combined[i] ?? 0)) combined[i] = v;
      }
    }

    // Subtract the added subject's mask. Dilate slightly before subtracting
    // so the loved one plus a small safety margin around her silhouette is
    // protected from the feather — otherwise main pixels creep in at the
    // seam and wash her out at the edges.
    if (addedMaskBuf) {
      const addedAlphaRaw = await sharp(addedMaskBuf)
        .resize(W, H, { fit: 'fill' })
        .extractChannel('alpha')
        .raw()
        .toBuffer();
      const dilatedAdded = await sharp(addedAlphaRaw, {
        raw: { width: W, height: H, channels: 1 },
      })
        .blur(4)
        .raw()
        .toBuffer();
      for (let i = 0; i < combined.length; i++) {
        const added = dilatedAdded[i] ?? 0;
        if (added > 32) combined[i] = 0;
      }
    }

    // Carve out the loved one's entire bbox. Mask-subtract alone is not
    // enough: SAM-3's silhouette of her in the NB2 output can miss her
    // lower body (torso rendered by NB2, but SAM reports only head+
    // shoulders), leaving a window in `combined` where main-photo pixels
    // get painted over her legs. Zeroing the full bbox closes that window
    // regardless of mask quality. Cost: if a family member's arm reaches
    // into her bbox, that arm won't get main-pixel preserved there — an
    // acceptable tradeoff since preserver's job is fixing face/beard
    // tampering, not arm pixels.
    if (addedBbox) {
      const [bx1, by1, bx2, by2] = addedBbox;
      const cx1 = Math.max(0, Math.min(W, bx1));
      const cx2 = Math.max(0, Math.min(W, bx2));
      const cy1 = Math.max(0, Math.min(H, by1));
      const cy2 = Math.max(0, Math.min(H, by2));
      for (let y = cy1; y < cy2; y++) {
        const rowStart = y * W;
        for (let x = cx1; x < cx2; x++) {
          combined[rowStart + x] = 0;
        }
      }
    }

    // `.blur()` on a 1-channel input converts to sRGB and returns a
    // 3-channel buffer (R=G=B=grayscale). If we then hand it to
    // joinChannel({channels: 1}) the raw byte layout is interpreted as
    // a 1-channel alpha plane, which spreads the mask at 3× horizontal
    // density — main-photo pixels then composite inside the loved one's
    // bbox and she reads as semi-transparent. `toColourspace('b-w')`
    // forces it back to a true 1-channel grayscale buffer.
    const featheredMask = await sharp(combined, {
      raw: { width: W, height: H, channels: 1 },
    })
      .blur(EDGE_FEATHER_SIGMA)
      .toColourspace('b-w')
      .raw()
      .toBuffer();


    const mainResized = await sharp(mainBuf)
      .resize(W, H, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();

    const mainWithAlpha = await sharp(mainResized, {
      raw: { width: W, height: H, channels: 3 },
    })
      .joinChannel(featheredMask, {
        raw: { width: W, height: H, channels: 1 },
      })
      .png()
      .toBuffer();

    const finalBuf = await sharp(editedBuf)
      .composite([{ input: mainWithAlpha, blend: 'over' }])
      .png()
      .toBuffer();

    const file = new File([new Uint8Array(finalBuf)], 'merge-preserved.png', {
      type: 'image/png',
    });
    return await fal.storage.upload(file);
  } catch (err) {
    logger.warn({ err }, 'preservePeopleFromMain failed; returning unpreserved');
    return null;
  }
}
