// =============================================================================
// generate-samples.ts — one-time script that produces pure style-representation
// thumbnails (no people) for each tribute template. These tell the user what
// each style looks like without waiting for a live render of their photo.
//
// Output: apps/web/public/samples/<templateId>.jpg (512×512, JPEG q80).
// Run with: npm run generate:samples
// Model: fal-ai/flux/schnell (text-to-image, ~4¢/9 images).
// =============================================================================
import { config as loadDotenv } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { fal } from '@fal-ai/client';
import sharp from 'sharp';
import { LAUNCH_TEMPLATES } from '@eternalframe/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
loadDotenv({ path: resolve(REPO_ROOT, '.env') });

fal.config({ credentials: process.env.FAL_KEY ?? '' });

const OUT_DIR = resolve(REPO_ROOT, 'apps', 'web', 'public', 'samples');
const RESIZE_PX = 512;
const JPEG_QUALITY = 80;

// Per-template FLUX prompts — each describes the STYLE concept with no people
// in the output. Tune individual prompts and rerun if any result looks off.
const STYLE_PROMPTS: Record<string, string> = {
  heavens_light:
    'Soft painterly clouds in warm evening sky with golden light rays streaming down, ethereal, peaceful, divine atmosphere, on cream background, no people, artistic painting',
  angel_wings:
    'Pair of delicate semi-transparent artistic angel wings, watercolor style, soft white and gold glow, spread outward, on cream background, no people, painterly',
  halo_and_wings:
    'Classic Renaissance-style glowing golden halo ring floating above a pair of delicate semi-transparent watercolor angel wings spread outward, cohesive divine composition, warm gold and soft white glow, cream background, no people, painterly',
  golden_halo:
    'Classic Renaissance-style glowing golden halo ring, warm light emanating outward, on soft cream neutral background, no people, painterly, ornate',
  heavenly_glow:
    'Warm golden luminous aura with light particles and soft bokeh, abstract divine glow, cream background, no people, ethereal',
  among_the_stars:
    'Beautiful artistic starry night sky with warm golden stars and subtle nebula swirl, painterly, peaceful, no people',
  classic_memorial:
    'Elegant high-contrast black and white abstract portrait-style photography backdrop, soft vignette, film grain, no people, moody',
  watercolor_tribute:
    'Soft watercolor painting with gentle brush strokes, warm earth tones and gold, abstract expressive texture, on cream paper, no people',
  rainbow_bridge:
    'Beautiful artistic rainbow arc in a soft painterly sky with gentle warm clouds and golden light, no people, dreamy',
  paw_prints_heaven:
    'Golden painterly paw print impressions trailing upward into soft heavenly clouds, warm-toned, no people, gentle and bittersweet',
};

function extractFirstImageUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as { images?: Array<{ url?: string }>; image?: { url?: string } };
  if (d.images && d.images.length > 0 && d.images[0]?.url) return d.images[0].url;
  if (d.image?.url) return d.image.url;
  return null;
}

async function generateOne(templateId: string, prompt: string): Promise<void> {
  const result = await fal.subscribe('fal-ai/flux/schnell', {
    input: {
      prompt,
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

  const out = join(OUT_DIR, `${templateId}.jpg`);
  await sharp(buf)
    .resize(RESIZE_PX, RESIZE_PX, { fit: 'cover', position: 'center' })
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(out);

  if (!existsSync(out)) throw new Error(`sharp did not write ${out}`);
}

async function main(): Promise<void> {
  if (!process.env.FAL_KEY) {
    console.error('FAL_KEY not set in .env — cannot generate samples.');
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const targets = LAUNCH_TEMPLATES.filter(
    (t) => t.promptTemplate !== 'NO_EFFECT',
  );
  const missingPrompts = targets.filter((t) => !STYLE_PROMPTS[t.id]);
  if (missingPrompts.length > 0) {
    console.error(
      `Missing STYLE_PROMPTS entries for: ${missingPrompts.map((t) => t.id).join(', ')}`,
    );
    process.exit(1);
  }

  console.log(`🎨 Generating ${targets.length} style samples → ${OUT_DIR}\n`);

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    const prompt = STYLE_PROMPTS[t.id]!;
    const start = Date.now();
    process.stdout.write(`  [${i + 1}/${targets.length}] ${t.id} ... `);
    try {
      await generateOne(t.id, prompt);
      console.log(`✓ (${Date.now() - start}ms)`);
      ok++;
    } catch (err) {
      console.log(`✗ ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  await writeFile(
    join(OUT_DIR, 'README.txt'),
    [
      'Auto-generated by apps/api/scripts/generate-samples.ts.',
      `Last run: ${new Date().toISOString()}`,
      `Model: fal-ai/flux/schnell (text-to-image, style-only, no people)`,
      `Templates: ${targets.map((t) => t.id).join(', ')}`,
      '',
      'Re-run after editing STYLE_PROMPTS or template ids. Do not edit these files by hand.',
      '',
    ].join('\n'),
  );

  console.log(`\nDone. ${ok} ok, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
