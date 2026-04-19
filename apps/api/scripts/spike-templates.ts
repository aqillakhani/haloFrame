// =============================================================================
// SPIKE B — Nano Banana 2 Edit aesthetic quality across all 10 templates
//
// Goal: confirm each launch template produces a reverent, visually clean
// result on real photos. Eyeball verdict after running.
//
// Setup:
//   1. Place 5 representative photos in docs/test-photos/ (single portraits work best)
//   2. FAL_KEY in .env
//   3. npm run spike:templates
// Outputs land in docs/spike-results/templates/
// =============================================================================
import 'dotenv/config';
import { basename } from 'node:path';
import { fal } from '@fal-ai/client';
import { LAUNCH_TEMPLATES } from '@haloframe/shared';
import { downloadImage, ensureDir, loadTestPhotos, SPIKE_DIR, uploadToFal, writeReport } from './_spike-helpers.js';

fal.config({ credentials: process.env.FAL_KEY ?? '' });

const SUBJECT_DESCRIPTION = 'the person'; // generic fallback

async function applyTemplate(uploadedUrl: string, tpl: (typeof LAUNCH_TEMPLATES)[number]) {
  if (tpl.promptTemplate === 'NO_EFFECT') return null;
  const prompt = tpl.promptTemplate.replace(/\{subject_description\}/g, SUBJECT_DESCRIPTION);
  const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
    input: {
      prompt,
      image_urls: [uploadedUrl],
      resolution: '2K',
      output_format: 'png',
      aspect_ratio: 'auto',
    },
    logs: false,
  });
  const data = result.data as { images?: Array<{ url?: string }> };
  return data.images?.[0]?.url ?? null;
}

async function main(): Promise<void> {
  const outDir = `${SPIKE_DIR}/templates`;
  await ensureDir(outDir);

  const photos = await loadTestPhotos();
  if (photos.length < 1) throw new Error('Need at least 1 test photo');
  const sample = photos.slice(0, 5);

  console.log(`🔬 Spike B: ${LAUNCH_TEMPLATES.length} templates × ${sample.length} photos\n`);

  const rows: Array<{ photo: string; template: string; ok: boolean; durationMs: number; error?: string }> = [];

  for (const photo of sample) {
    const photoName = basename(photo);
    console.log(`\n📷 ${photoName}`);
    const uploadedUrl = await uploadToFal(photo);

    for (const tpl of LAUNCH_TEMPLATES) {
      process.stdout.write(`  ${tpl.id} ... `);
      const start = Date.now();
      try {
        const url = await applyTemplate(uploadedUrl, tpl);
        const durationMs = Date.now() - start;
        if (url) {
          await downloadImage(url, `${outDir}/${photoName}__${tpl.id}.png`);
          console.log(`✓ (${durationMs}ms)`);
          rows.push({ photo: photoName, template: tpl.id, ok: true, durationMs });
        } else {
          console.log(`(no-op natural blend)`);
          rows.push({ photo: photoName, template: tpl.id, ok: true, durationMs });
        }
      } catch (err) {
        const durationMs = Date.now() - start;
        console.log(`✗ ${String(err).slice(0, 60)}`);
        rows.push({ photo: photoName, template: tpl.id, ok: false, durationMs, error: String(err) });
      }
    }
  }

  const total = rows.length;
  const succeeded = rows.filter((r) => r.ok).length;
  const successRate = (succeeded / total) * 100;
  const avgDuration = rows.reduce((s, r) => s + r.durationMs, 0) / total;

  const report = [
    '# Nano Banana 2 Template Aesthetic Spike — Results',
    '',
    `Date: ${new Date().toISOString()}`,
    `Templates × photos: ${LAUNCH_TEMPLATES.length} × ${sample.length} = ${total}`,
    `API success rate: ${successRate.toFixed(1)}%`,
    `Avg duration per call: ${avgDuration.toFixed(0)}ms`,
    '',
    '## Manual review checklist',
    '',
    'Open `docs/spike-results/templates/` and review every output. For each, mark:',
    '',
    '- **REVERENT** — feels memorial-appropriate, ship it',
    '- **AI-WEIRD** — distorted faces, broken anatomy, off-vibe → revise prompt',
    '- **TOO SUBTLE** — effect barely visible → strengthen prompt or default to high intensity',
    '- **FAIL** — model failed entirely → try Pro fallback',
    '',
    '## Per-call API results',
    '',
    '| Photo | Template | OK | Duration | Error |',
    '|-------|----------|----|---------:|-------|',
    ...rows.map(
      (r) =>
        `| ${r.photo} | ${r.template} | ${r.ok ? '✓' : '✗'} | ${r.durationMs}ms | ${r.error ? r.error.slice(0, 60) : ''} |`,
    ),
    '',
  ].join('\n');

  await writeReport('spike-templates.md', report);
  console.log(`\nDone. Review images in ${outDir}/ and update prompts in packages/shared/src/constants.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
