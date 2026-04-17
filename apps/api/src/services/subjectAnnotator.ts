// =============================================================================
// Subject annotator — visual set-of-mark prompting
//
// When a photo has multiple people, describing the target subject purely in
// words ("the second person from the left") is brittle — Nano Banana 2 often
// overrides the spatial anchor with its own semantic priors (e.g. "memorial
// photo → elder matriarch") and edits the wrong person.
//
// The reliable fix is to encode the target *visually*: draw a distinct
// marker over the selected subject in the input image itself. Now the
// model doesn't have to reason about spatial descriptions — the target
// is pixel-obvious. Research calls this "set-of-mark prompting"; it
// consistently outperforms text-only subject descriptions for LMM edits.
//
// We draw a bright cyan ring around the subject's bounding box + a cyan
// dot at the centroid. Cyan is chosen because it almost never occurs in
// family photos, so the model can't confuse the marker with clothing or
// backdrop. The calling prompt instructs the model to IGNORE the marker
// pixels when producing its output.
// =============================================================================
import sharp from 'sharp';
import { fal } from '@fal-ai/client';

export interface AnnotateArgs {
  /** Public URL of the source image (already on fal storage or similar). */
  sourceImageUrl: string;
  /** Target subject's bounding box in source-image pixel coordinates. */
  bbox: [number, number, number, number];
}

export interface AnnotateResult {
  /** Public URL of the annotated image. */
  annotatedImageUrl: string;
  /** Short human-readable color of the marker for prompt composition. */
  markerColor: 'cyan';
}

export async function annotateSubject(args: AnnotateArgs): Promise<AnnotateResult> {
  const response = await fetch(args.sourceImageUrl);
  if (!response.ok) {
    throw new Error(`annotator: fetch failed ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());

  const img = sharp(buffer);
  const meta = await img.metadata();
  if (!meta.width || !meta.height) {
    throw new Error('annotator: image has no dimensions');
  }

  const [x1, y1, x2, y2] = args.bbox;
  // Clamp bbox to image bounds — SAM occasionally returns coordinates a
  // pixel or two outside the image frame.
  const bx1 = Math.max(0, Math.min(meta.width, Math.round(x1)));
  const by1 = Math.max(0, Math.min(meta.height, Math.round(y1)));
  const bx2 = Math.max(0, Math.min(meta.width, Math.round(x2)));
  const by2 = Math.max(0, Math.min(meta.height, Math.round(y2)));
  const cx = Math.round((bx1 + bx2) / 2);
  const cy = Math.round((by1 + by2) / 2);
  const boxW = Math.max(1, bx2 - bx1);
  const boxH = Math.max(1, by2 - by1);
  const strokeWidth = Math.max(6, Math.round(Math.min(meta.width, meta.height) * 0.008));
  const dotRadius = Math.max(10, Math.round(Math.min(boxW, boxH) * 0.08));

  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">` +
      `<rect x="${bx1}" y="${by1}" width="${boxW}" height="${boxH}" ` +
      `fill="none" stroke="#00E5FF" stroke-width="${strokeWidth}" rx="8" ry="8" ` +
      `stroke-opacity="0.95" />` +
      `<circle cx="${cx}" cy="${cy}" r="${dotRadius}" fill="#00E5FF" ` +
      `stroke="#003B44" stroke-width="${Math.max(2, Math.round(strokeWidth / 3))}" />` +
      `</svg>`,
  );

  const annotated = await img
    .composite([{ input: svg, top: 0, left: 0, blend: 'over' }])
    .jpeg({ quality: 92 })
    .toBuffer();

  const file = new File([new Uint8Array(annotated)], 'annotated.jpg', {
    type: 'image/jpeg',
  });
  const annotatedImageUrl = await fal.storage.upload(file);
  return { annotatedImageUrl, markerColor: 'cyan' };
}
