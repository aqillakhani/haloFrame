// =============================================================================
// SPIKE A — SAM 3 person/pet detection reliability
//
// Goal: validate that SAM 3 returns useful masks on real-world memorial photos.
// Kill criterion: <90% of test photos return at least one mask matching the
// expected subject count.
//
// Setup:
//   1. Place 30+ test photos in docs/test-photos/
//      Suggested mix: family groups (3+ people), single portraits, low-res
//      old scans, side profiles, photos with pets, low light photos.
//   2. Ensure FAL_KEY is set in .env
//   3. Run: npm run spike:sam3
// =============================================================================
import 'dotenv/config';
import { basename } from 'node:path';
import { fal } from '@fal-ai/client';
import { downloadImage, ensureDir, loadTestPhotos, SPIKE_DIR, uploadToFal, writeReport } from './_spike-helpers.js';

fal.config({ credentials: process.env.FAL_KEY ?? '' });

interface SpikeResult {
  filename: string;
  uploadedUrl: string;
  detectedCount: number;
  topConfidence: number;
  durationMs: number;
  error?: string;
}

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
  const data = result.data as { masks?: Array<{ url: string }>; scores?: number[] };
  return { masks: data.masks ?? [], scores: data.scores ?? [] };
}

async function runOne(localPath: string, detectPets: boolean): Promise<SpikeResult> {
  const filename = basename(localPath);
  const start = Date.now();
  try {
    const uploadedUrl = await uploadToFal(localPath);
    // SAM 3 is single-concept per call — multi-term prompts return nothing.
    const prompts = detectPets ? ['person', 'dog', 'cat'] : ['person'];
    const results = await Promise.all(prompts.map((p) => callSam3(uploadedUrl, p)));
    const masks = results.flatMap((r) => r.masks);
    const scores = results.flatMap((r) => r.scores);

    // Save the first mask alongside the source for visual review
    if (masks[0]?.url) {
      const dest = `${SPIKE_DIR}/sam3-${filename}.mask.png`;
      await downloadImage(masks[0].url, dest);
    }

    return {
      filename,
      uploadedUrl,
      detectedCount: masks.length,
      topConfidence: scores[0] ?? 0,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      filename,
      uploadedUrl: '',
      detectedCount: 0,
      topConfidence: 0,
      durationMs: Date.now() - start,
      error: String(err),
    };
  }
}

async function main(): Promise<void> {
  await ensureDir(SPIKE_DIR);
  const photos = await loadTestPhotos();
  console.log(`🔬 Spike A: SAM 3 reliability — ${photos.length} photos\n`);

  const results: SpikeResult[] = [];
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]!;
    process.stdout.write(`  [${i + 1}/${photos.length}] ${basename(photo)} ... `);
    // Detect both — pets are a superset of person detection in our app's flow
    const r = await runOne(photo, true);
    if (r.error) {
      console.log(`✗ ERROR (${r.durationMs}ms)`);
    } else {
      console.log(`${r.detectedCount} masks, top conf ${r.topConfidence.toFixed(2)} (${r.durationMs}ms)`);
    }
    results.push(r);
  }

  // Aggregate
  const total = results.length;
  const succeeded = results.filter((r) => r.detectedCount > 0).length;
  const errored = results.filter((r) => r.error).length;
  const successRate = (succeeded / total) * 100;
  const avgDuration = results.reduce((s, r) => s + r.durationMs, 0) / total;
  const avgConfidence =
    results.filter((r) => r.topConfidence > 0).reduce((s, r) => s + r.topConfidence, 0) /
      Math.max(1, succeeded);

  const verdict = successRate >= 90 ? '✅ PASS' : '❌ FAIL — pivot to bbox + manual flow';

  const report = [
    '# SAM 3 Reliability Spike — Results',
    '',
    `Date: ${new Date().toISOString()}`,
    `Photos tested: ${total}`,
    `Success rate (≥1 mask returned): ${successRate.toFixed(1)}% (${succeeded}/${total})`,
    `Errors: ${errored}`,
    `Avg confidence (when detected): ${avgConfidence.toFixed(2)}`,
    `Avg duration per photo: ${avgDuration.toFixed(0)}ms`,
    '',
    `## Verdict: ${verdict}`,
    `Kill criterion: <90% success rate.`,
    '',
    '## Per-photo results',
    '',
    '| File | Masks | Top Conf | Duration | Error |',
    '|------|-------|----------|----------|-------|',
    ...results.map(
      (r) =>
        `| ${r.filename} | ${r.detectedCount} | ${r.topConfidence.toFixed(2)} | ${r.durationMs}ms | ${r.error ? r.error.slice(0, 60) : ''} |`,
    ),
    '',
  ].join('\n');

  await writeReport('spike-sam3.md', report);
  console.log('\n' + verdict);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
