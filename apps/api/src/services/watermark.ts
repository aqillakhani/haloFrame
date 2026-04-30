// =============================================================================
// HaloFrame API — watermark service
//
// Bakes "✨ AI-generated · gethaloframe.com" into the bottom-right of every
// composite output. The label travels with the file even if downloaded and
// shared outside the app — the deepfake-mitigation half of the App Store /
// Play Store AI labeling guidance.
//
// Implementation: render the label as an SVG (vector → crisp at any size),
// resize to ~38% of the canvas width, then composite over the input. Sharp
// is already in the api dep tree for other image ops.
//
// Disable for tests / debugging via WATERMARK_DISABLED=true.
// =============================================================================
import sharp from 'sharp';

const WATERMARK_TEXT = '✨ AI-generated · gethaloframe.com';

function buildWatermarkSvg(): Buffer {
  // Fixed virtual viewBox (600×80); sharp resizes to the target on composite.
  // Background uses a soft black pill so the label stays legible over both
  // bright and dark composites.
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 80">
      <rect x="0" y="0" rx="20" ry="20" width="600" height="80"
            fill="rgba(0,0,0,0.45)" />
      <text x="36" y="50"
            font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            font-size="32" fill="#ffffff" font-weight="500">${WATERMARK_TEXT}</text>
    </svg>`;
  return Buffer.from(svg);
}

export async function applyWatermark(input: Buffer): Promise<Buffer> {
  if (process.env.WATERMARK_DISABLED === 'true') {
    return input;
  }

  const meta = await sharp(input).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  // Scale watermark width to ~38% of image width, preserve aspect ratio.
  // Soft floor at 220px so normal-sized images get a legible label, but
  // hard-clamp to (width - 2*margin) so we never overflow tiny canvases.
  const margin = Math.max(8, Math.round(width * 0.02));
  const maxAllowed = Math.max(0, width - 2 * margin);
  const wmTargetWidth = Math.min(maxAllowed, Math.max(220, Math.round(width * 0.38)));

  // Pathological case — image too narrow for any watermark. Return as-is.
  if (wmTargetWidth < 60) {
    return input;
  }

  const wmRendered = await sharp(buildWatermarkSvg())
    .resize({ width: wmTargetWidth })
    .png()
    .toBuffer();
  const wmMeta = await sharp(wmRendered).metadata();
  const wmHeight = wmMeta.height ?? 0;

  if (wmHeight === 0 || wmHeight > height - 2 * margin) {
    // Watermark would overflow vertically too; bail out.
    return input;
  }

  const left = Math.max(0, width - wmTargetWidth - margin);
  const top = Math.max(0, height - wmHeight - margin);

  return sharp(input)
    .composite([{ input: wmRendered, left, top }])
    .png()
    .toBuffer();
}
