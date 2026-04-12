// =============================================================================
// SPIKE C — Reunite flow merge realism
//
// Goal: validate that Nano Banana 2 Edit can merge a deceased loved one into
// a group photo at all 4 placements. Checking specifically that "behind"
// placement actually works — if it doesn't, drop to 3 placement options.
//
// Setup:
//   1. Place pairs of photos in docs/test-photos/merge-pairs/
//      Each pair as: pair-N-main.jpg + pair-N-loved.jpg
//   2. FAL_KEY in .env
//   3. npm run spike:merge
// =============================================================================
import 'dotenv/config';
import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fal } from '@fal-ai/client';
import {
  downloadImage,
  ensureDir,
  SPIKE_DIR,
  uploadToFal,
  writeReport,
} from './_spike-helpers.js';

fal.config({ credentials: process.env.FAL_KEY ?? '' });

const PAIRS_DIR = resolve(process.cwd(), '..', '..', 'docs', 'test-photos', 'merge-pairs');

const PLACEMENTS = ['left', 'right', 'behind', 'center'] as const;
type Placement = (typeof PLACEMENTS)[number];

const INSTRUCTIONS: Record<Placement, string> = {
  left: 'Place the person from the second image on the left side of the group in the first image',
  right:
    'Place the person from the second image on the right side of the group in the first image',
  behind:
    'Place the person from the second image standing behind the group in the first image, slightly visible between or above other people',
  center:
    'Place the person from the second image in the center of the group in the first image, naturally integrated among the other people',
};

async function mergePair(mainUrl: string, lovedUrl: string, placement: Placement) {
  const prompt = [
    'Take the first image as the main scene.',
    'Take the person from the second image and naturally integrate them into the first image.',
    `${INSTRUCTIONS[placement]}.`,
    'Match the lighting, color temperature, perspective, and scale so the person looks like they were genuinely present in the original photo.',
    'Preserve everyone else in the main photo exactly as they are.',
    'The result should look like a natural, authentic photograph.',
  ].join(' ');

  const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
    input: {
      prompt,
      image_urls: [mainUrl, lovedUrl],
      resolution: '2K',
      output_format: 'png',
      aspect_ratio: 'auto',
    },
    logs: false,
  });
  const data = result.data as { images?: Array<{ url?: string }> };
  return data.images?.[0]?.url ?? null;
}

async function loadPairs(): Promise<Array<{ id: string; main: string; loved: string }>> {
  if (!existsSync(PAIRS_DIR)) {
    throw new Error(
      `No merge pairs found. Create:\n  ${PAIRS_DIR}\n` +
        `with files like pair-1-main.jpg + pair-1-loved.jpg`,
    );
  }
  const files = await readdir(PAIRS_DIR);
  const pairs: Array<{ id: string; main: string; loved: string }> = [];
  const seen = new Set<string>();
  for (const f of files) {
    const m = f.match(/^(pair-\d+)-main\.(jpe?g|png|webp)$/i);
    if (!m) continue;
    const id = m[1]!;
    if (seen.has(id)) continue;
    const lovedFile = files.find((g) => new RegExp(`^${id}-loved\\.`, 'i').test(g));
    if (!lovedFile) continue;
    seen.add(id);
    pairs.push({ id, main: join(PAIRS_DIR, f), loved: join(PAIRS_DIR, lovedFile) });
  }
  return pairs;
}

async function main(): Promise<void> {
  const outDir = `${SPIKE_DIR}/merge`;
  await ensureDir(outDir);
  const pairs = await loadPairs();
  if (pairs.length === 0) throw new Error('No merge pairs found.');

  console.log(`🔬 Spike C: ${pairs.length} pairs × ${PLACEMENTS.length} placements\n`);

  const rows: Array<{ pair: string; placement: Placement; ok: boolean; durationMs: number; error?: string }> = [];

  for (const pair of pairs) {
    console.log(`\n📷 ${pair.id}`);
    const mainUrl = await uploadToFal(pair.main);
    const lovedUrl = await uploadToFal(pair.loved);

    for (const placement of PLACEMENTS) {
      process.stdout.write(`  ${placement} ... `);
      const start = Date.now();
      try {
        const url = await mergePair(mainUrl, lovedUrl, placement);
        const durationMs = Date.now() - start;
        if (url) {
          await downloadImage(url, `${outDir}/${pair.id}__${placement}.png`);
          console.log(`✓ (${durationMs}ms)`);
          rows.push({ pair: pair.id, placement, ok: true, durationMs });
        } else {
          console.log('✗ no image returned');
          rows.push({ pair: pair.id, placement, ok: false, durationMs, error: 'no image' });
        }
      } catch (err) {
        const durationMs = Date.now() - start;
        console.log(`✗ ${String(err).slice(0, 60)}`);
        rows.push({ pair: pair.id, placement, ok: false, durationMs, error: String(err) });
      }
    }
  }

  const byPlacement = PLACEMENTS.map((p) => {
    const subset = rows.filter((r) => r.placement === p);
    const ok = subset.filter((r) => r.ok).length;
    return { placement: p, ok, total: subset.length };
  });

  const report = [
    '# Reunite Merge Realism Spike — Results',
    '',
    `Date: ${new Date().toISOString()}`,
    `Pairs tested: ${pairs.length}`,
    '',
    '## API success by placement',
    '',
    '| Placement | Success |',
    '|-----------|---------|',
    ...byPlacement.map(
      (b) => `| ${b.placement} | ${b.ok}/${b.total} (${((b.ok / b.total) * 100).toFixed(0)}%) |`,
    ),
    '',
    '## Manual review',
    '',
    `Open ${outDir}/ and inspect every output. For each placement, mark:`,
    '',
    '- **REALISTIC** — looks like the person was actually there',
    '- **OBVIOUS COMPOSITE** — wrong scale, wrong lighting, jarring',
    '- **BROKEN** — distorted faces, missing limbs, etc.',
    '',
    'If "behind" placement is broken on >25% of pairs, drop it from the placement picker (use 3 options instead of 4).',
    '',
    '## Per-call results',
    '',
    '| Pair | Placement | OK | Duration | Error |',
    '|------|-----------|----|---------:|-------|',
    ...rows.map(
      (r) =>
        `| ${r.pair} | ${r.placement} | ${r.ok ? '✓' : '✗'} | ${r.durationMs}ms | ${r.error ? r.error.slice(0, 60) : ''} |`,
    ),
    '',
  ].join('\n');

  await writeReport('spike-merge.md', report);
  console.log(`\nDone. Review images in ${outDir}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
