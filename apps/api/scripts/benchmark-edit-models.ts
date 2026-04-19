// =============================================================================
// benchmark-edit-models.ts — one-shot A/B of image-edit models on fal.ai.
//
// Purpose: help us pick the fastest model with acceptable quality for the
// "pre-render every style on Editor mount" flow. We render the `angel_wings`
// template against `.playwright-mcp/portrait.jpg` on each candidate at 2K,
// measure wall-clock, and save outputs so the user can eyeball quality.
//
// Run with: npm run benchmark:models (from apps/api/)
// =============================================================================
import { config as loadDotenv } from 'dotenv';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { fal } from '@fal-ai/client';
import { LAUNCH_TEMPLATES } from '@haloframe/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
loadDotenv({ path: resolve(REPO_ROOT, '.env') });

fal.config({ credentials: process.env.FAL_KEY ?? '' });

const PORTRAIT_PATH = resolve(REPO_ROOT, '.playwright-mcp', 'portrait.jpg');
const OUT_DIR = resolve(REPO_ROOT, 'apps', 'web', 'public', 'samples');
const TEMPLATE_ID = 'angel_wings';
const SUBJECT_DESCRIPTION = 'the person';
const INTENSITY: 'low' | 'medium' | 'high' = 'medium';

function extractFirstImageUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as {
    images?: Array<{ url?: string }>;
    image?: { url?: string };
  };
  if (d.images && d.images.length > 0 && d.images[0]?.url) return d.images[0].url;
  if (d.image?.url) return d.image.url;
  return null;
}

async function uploadPortrait(): Promise<string> {
  if (!existsSync(PORTRAIT_PATH)) {
    throw new Error(`Stock portrait not found at ${PORTRAIT_PATH}`);
  }
  const buf = await readFile(PORTRAIT_PATH);
  const blob = new Blob([buf], { type: 'image/jpeg' });
  const file = new File([blob], 'portrait.jpg', { type: 'image/jpeg' });
  return fal.storage.upload(file);
}

interface Candidate {
  name: string;
  endpoint: string;
  buildInput: (prompt: string, imageUrl: string) => Record<string, unknown>;
}

const CANDIDATES: Candidate[] = [
  {
    name: 'nano-banana-2',
    endpoint: 'fal-ai/nano-banana-2/edit',
    buildInput: (prompt, imageUrl) => ({
      prompt,
      image_urls: [imageUrl],
      resolution: '2K',
      output_format: 'png',
      aspect_ratio: 'auto',
    }),
  },
  {
    name: 'qwen-image-edit-plus',
    endpoint: 'fal-ai/qwen-image-edit-plus',
    buildInput: (prompt, imageUrl) => ({
      prompt,
      image_urls: [imageUrl],
      num_inference_steps: 30,
      output_format: 'png',
    }),
  },
  {
    name: 'seedream-4-edit',
    endpoint: 'fal-ai/bytedance/seedream/v4/edit',
    buildInput: (prompt, imageUrl) => ({
      prompt,
      image_urls: [imageUrl],
      image_size: { width: 2048, height: 2048 },
    }),
  },
  {
    name: 'flux-pro-kontext',
    endpoint: 'fal-ai/flux-pro/kontext',
    buildInput: (prompt, imageUrl) => ({
      prompt,
      image_url: imageUrl,
      output_format: 'png',
      aspect_ratio: '1:1',
    }),
  },
];

interface Result {
  name: string;
  endpoint: string;
  durationMs: number;
  outputUrl: string | null;
  savedPath: string | null;
  error: string | null;
}

async function downloadTo(url: string, path: string): Promise<void> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} → ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await writeFile(path, buf);
}

async function benchOne(
  cand: Candidate,
  prompt: string,
  imageUrl: string,
): Promise<Result> {
  const start = Date.now();
  try {
    const result = await fal.subscribe(cand.endpoint, {
      input: cand.buildInput(prompt, imageUrl),
      logs: false,
    });
    const out = extractFirstImageUrl(result.data);
    const durationMs = Date.now() - start;
    if (!out) {
      return {
        name: cand.name,
        endpoint: cand.endpoint,
        durationMs,
        outputUrl: null,
        savedPath: null,
        error: 'model returned no image URL',
      };
    }
    const savedPath = join(OUT_DIR, `_bench_${cand.name}.png`);
    await downloadTo(out, savedPath);
    return {
      name: cand.name,
      endpoint: cand.endpoint,
      durationMs,
      outputUrl: out,
      savedPath,
      error: null,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: cand.name,
      endpoint: cand.endpoint,
      durationMs,
      outputUrl: null,
      savedPath: null,
      error: message.slice(0, 200),
    };
  }
}

async function main(): Promise<void> {
  if (!process.env.FAL_KEY) {
    console.error('FAL_KEY not set.');
    process.exit(1);
  }

  const template = LAUNCH_TEMPLATES.find((t) => t.id === TEMPLATE_ID);
  if (!template) throw new Error(`Template ${TEMPLATE_ID} not found`);

  const base = template.promptTemplate.replace(
    /\{subject_description\}/g,
    SUBJECT_DESCRIPTION,
  );
  const modifier = template.promptModifiers[INTENSITY];
  const prompt = modifier ? `${base} ${modifier}.` : base;

  await mkdir(OUT_DIR, { recursive: true });

  console.log(`🎤 Uploading portrait → fal storage...`);
  const imageUrl = await uploadPortrait();
  console.log(`   ${imageUrl}\n`);

  console.log(`🏁 Benchmarking ${CANDIDATES.length} models on "${TEMPLATE_ID}" / "${INTENSITY}"\n`);

  const results: Result[] = [];
  for (const cand of CANDIDATES) {
    process.stdout.write(`  ${cand.name.padEnd(24)} ... `);
    const r = await benchOne(cand, prompt, imageUrl);
    if (r.error) {
      console.log(`✗ ${r.durationMs}ms  (${r.error})`);
    } else {
      console.log(`✓ ${r.durationMs}ms  → ${r.savedPath}`);
    }
    results.push(r);
  }

  console.log('\n📊 Summary');
  console.log('─'.repeat(80));
  const sorted = [...results].sort((a, b) => a.durationMs - b.durationMs);
  for (const r of sorted) {
    const flag = r.error ? '⚠︎' : '✓';
    console.log(
      `  ${flag}  ${r.name.padEnd(24)} ${String(r.durationMs).padStart(6)}ms   ${r.error ?? r.savedPath ?? ''}`,
    );
  }
  console.log('─'.repeat(80));

  const fastest = sorted.find((r) => !r.error);
  if (fastest) {
    console.log(`\n🏆 Fastest successful model: ${fastest.name} (${fastest.durationMs}ms)`);
  }
  console.log(
    `\nOpen apps/web/public/samples/_bench_*.png to eyeball quality.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
