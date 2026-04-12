// =============================================================================
// Shared helpers for the Phase 0 fal.ai de-risking spikes.
// =============================================================================
import 'dotenv/config';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const SPIKE_DIR = resolve(process.cwd(), '..', '..', 'docs', 'spike-results');
export const TEST_PHOTOS_DIR = resolve(process.cwd(), '..', '..', 'docs', 'test-photos');

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function downloadImage(url: string, destPath: string): Promise<void> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await writeFile(destPath, buf);
}

export async function loadTestPhotos(): Promise<string[]> {
  if (!existsSync(TEST_PHOTOS_DIR)) {
    throw new Error(
      `No test photos found. Place real-world memorial-style photos in:\n  ${TEST_PHOTOS_DIR}\nThen rerun.`,
    );
  }
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(TEST_PHOTOS_DIR);
  return files
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .map((f) => join(TEST_PHOTOS_DIR, f));
}

export async function uploadToFal(localPath: string): Promise<string> {
  const { fal } = await import('@fal-ai/client');
  const buf = await readFile(localPath);
  const blob = new Blob([buf]);
  const url = await fal.storage.upload(blob as unknown as File);
  return url;
}

export async function writeReport(name: string, content: string): Promise<void> {
  await ensureDir(SPIKE_DIR);
  const path = join(SPIKE_DIR, name);
  await writeFile(path, content);
  console.log(`📝 Report written to ${path}`);
}
