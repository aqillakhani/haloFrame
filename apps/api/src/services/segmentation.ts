// =============================================================================
// EternalFrame API — segmentation post-processing
//
// Takes raw SAM 3 mask URLs, downloads each PNG, computes the centroid +
// bounding box of the mask using sharp, and returns a normalized
// SegmentationData payload that the mobile app can render as tappable targets.
// =============================================================================
import sharp from 'sharp';
import type { DetectedSubject, SegmentationData } from '@eternalframe/shared';
import { logger } from '../config/logger.js';
import type { SamResult } from './falai.js';

interface MaskStats {
  centroid: { x: number; y: number };
  bbox: [number, number, number, number];
  pixelCount: number;
}

/**
 * Download a binary mask PNG and compute its centroid + bounding box.
 * Uses sharp's raw pixel access. Treats any pixel with red channel > 127 as "in mask".
 */
async function analyzeMask(maskUrl: string): Promise<MaskStats | null> {
  const response = await fetch(maskUrl);
  if (!response.ok) {
    logger.warn({ maskUrl, status: response.status }, 'mask download failed');
    return null;
  }
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
      // Mask is non-zero where the subject is. Use red channel > 127 as the test.
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

/**
 * Convert a raw SAM 3 result into our normalized SegmentationData shape.
 * Filters out tiny masks (likely noise) and sorts subjects by pixel count
 * (largest first — usually the most prominent person/pet).
 */
export async function processSamResult(
  raw: SamResult,
  /** Where to store the persisted mask URLs after we re-host them in our bucket */
  rehostMaskUrls: string[],
): Promise<SegmentationData> {
  if (raw.masks.length !== rehostMaskUrls.length) {
    throw new Error(
      `mask count mismatch: raw=${raw.masks.length} rehosted=${rehostMaskUrls.length}`,
    );
  }

  const minPixelCount = Math.max(
    500,
    Math.round((raw.width * raw.height) / 400), // ~0.25% of image
  );

  const subjects: DetectedSubject[] = [];

  for (let i = 0; i < raw.masks.length; i++) {
    const mask = raw.masks[i]!;
    const rehosted = rehostMaskUrls[i]!;
    try {
      const stats = await analyzeMask(mask.url);
      if (!stats) continue;
      if (stats.pixelCount < minPixelCount) {
        logger.debug(
          { maskUrl: mask.url, pixels: stats.pixelCount, threshold: minPixelCount },
          'mask filtered as noise',
        );
        continue;
      }
      subjects.push({
        maskId: String(i),
        centroid: stats.centroid,
        bbox: stats.bbox,
        confidence: mask.score,
        maskUrl: rehosted,
        label: mask.label,
      });
    } catch (err) {
      logger.warn({ err, maskUrl: mask.url }, 'mask analysis errored, skipping');
    }
  }

  // Sort by pixel area descending so the dominant subject is index 0
  subjects.sort((a, b) => bboxArea(b.bbox) - bboxArea(a.bbox));
  // Re-key maskIds after sort so they're stable 0..N-1 in display order
  subjects.forEach((s, i) => {
    s.maskId = String(i);
  });

  return {
    imageWidth: raw.width,
    imageHeight: raw.height,
    subjects,
  };
}

function bboxArea(bbox: [number, number, number, number]): number {
  const [x1, y1, x2, y2] = bbox;
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}
