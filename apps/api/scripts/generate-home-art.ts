// =============================================================================
// generate-home-art.ts — produces the hero thumbnail for the Home screen's
// "Add a Loved One to a Photo" card. The existing generate-samples.ts covers
// per-template style swatches; this card is not a template, so it gets its
// own prompt and its own output path.
//
// Output: apps/web/public/samples/add_loved_one.jpg (512×512, JPEG q80).
// Run with: npm run generate:home-art
// Model: fal-ai/flux/schnell (text-to-image, ~1¢ per call).
// =============================================================================
import { config as loadDotenv } from 'dotenv';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { fal } from '@fal-ai/client';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
loadDotenv({ path: resolve(REPO_ROOT, '.env') });

fal.config({ credentials: process.env.FAL_KEY ?? '' });

const OUT_DIR = resolve(REPO_ROOT, 'apps', 'web', 'public', 'samples');
const OUT_FILE = join(OUT_DIR, 'add_loved_one.jpg');
const RESIZE_PX = 512;
const JPEG_QUALITY = 80;

const PROMPT =
  'Two old painterly family photographs gently overlapping and merging into one, with a warm golden glow between them where they meet. Soft watercolor brush strokes, cream paper background, tender silhouettes of old photos merging, golden-hour tones, memorial aesthetic, painterly, ethereal. No legible faces, no text, no logos — only the emotional suggestion of two memories being brought together into one photograph.';

function extractFirstImageUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { images?: Array<{ url?: string }>; image?: { url?: string } };
  if (d.images && d.images.length > 0 && d.images[0]?.url) return d.images[0].url;
  if (d.image?.url) return d.image.url;
  return null;
}

async function main(): Promise<void> {
  if (!process.env.FAL_KEY) {
    console.error('FAL_KEY not set in .env — cannot generate home art.');
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  console.log(`🎨 Generating home card art → ${OUT_FILE}`);
  const start = Date.now();
  const result = await fal.subscribe('fal-ai/flux/schnell', {
    input: {
      prompt: PROMPT,
      image_size: 'square_hd',
      num_inference_steps: 4,
      num_images: 1,
      enable_safety_checker: false,
    },
    logs: false,
  });

  const url = extractFirstImageUrl(result.data);
  if (!url) throw new Error('fal returned no image');

  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch result -> ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());

  await sharp(buf)
    .resize(RESIZE_PX, RESIZE_PX, { fit: 'cover', position: 'center' })
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(OUT_FILE);

  if (!existsSync(OUT_FILE)) throw new Error(`sharp did not write ${OUT_FILE}`);
  console.log(`✓ done in ${Date.now() - start}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
