// =============================================================================
// HaloFrame API — Supabase Storage helpers
// =============================================================================
import { supabaseAdmin } from '../config/supabase.js';
import { errors } from '../lib/errors.js';
import { logger } from '../config/logger.js';

const SOURCE_BUCKET = 'tributes-source';
const FINAL_BUCKET = 'tributes-final';

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — long enough for fal.ai to fetch

/**
 * Returns a short-lived signed URL the mobile client can PUT a file directly to.
 * Path layout: <user_id>/<tribute_id>/<filename>
 */
export async function createUploadUrl(opts: {
  userId: string;
  tributeId: string;
  filename: string;
}): Promise<{ uploadUrl: string; storagePath: string; token: string }> {
  const path = `${opts.userId}/${opts.tributeId}/${opts.filename}`;
  const { data, error } = await supabaseAdmin.storage
    .from(SOURCE_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw errors.storage('Failed to create signed upload URL', { error });
  }
  return {
    uploadUrl: data.signedUrl,
    storagePath: path,
    token: data.token,
  };
}

/**
 * Returns a signed URL fal.ai can use to fetch the source photo.
 */
export async function createSourceSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(SOURCE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    throw errors.storage('Failed to sign source URL', { error });
  }
  return data.signedUrl;
}

/**
 * Signed URL for a final-bucket asset. Used by GET /api/tribute/ so the web
 * gallery can render directly against the private bucket without embedding
 * service-role credentials. Returns null on sign failure (caller falls back
 * to a placeholder) rather than throwing — a single rotten row shouldn't
 * blank the whole gallery.
 */
export async function tryCreateFinalSignedUrl(
  storagePath: string | null,
): Promise<string | null> {
  if (!storagePath) return null;
  const { data, error } = await supabaseAdmin.storage
    .from(FINAL_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Download an arbitrary URL (e.g. fal.ai result) and re-host it in our final
 * bucket so we own the data and can delete on user request.
 */
export async function rehostFromUrl(opts: {
  sourceUrl: string;
  userId: string;
  tributeId: string;
  filename: string;
  bucket?: 'source' | 'final';
}): Promise<{ storagePath: string; signedUrl: string }> {
  const bucketId = opts.bucket === 'final' ? FINAL_BUCKET : SOURCE_BUCKET;
  const path = `${opts.userId}/${opts.tributeId}/${opts.filename}`;

  const fetched = await fetch(opts.sourceUrl);
  if (!fetched.ok) {
    throw errors.storage(`Failed to download ${opts.sourceUrl}`, {
      status: fetched.status,
    });
  }
  const buffer = Buffer.from(await fetched.arrayBuffer());
  const contentType = fetched.headers.get('content-type') ?? 'image/png';

  const { error: uploadError } = await supabaseAdmin.storage
    .from(bucketId)
    .upload(path, buffer, {
      contentType,
      upsert: true,
    });
  if (uploadError) {
    throw errors.storage('Failed to upload to storage', { uploadError });
  }

  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from(bucketId)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed) {
    throw errors.storage('Failed to sign rehosted URL', { signError });
  }

  logger.debug({ path, bucketId, contentType }, 'rehosted asset');
  return { storagePath: path, signedUrl: signed.signedUrl };
}

/**
 * Delete every object under tributes/<user_id>/<tribute_id>/.
 * Used when a tribute is deleted, and by the 30-day cleanup cron.
 */
export async function deleteTributeAssets(opts: {
  userId: string;
  tributeId: string;
}): Promise<void> {
  const prefix = `${opts.userId}/${opts.tributeId}/`;
  for (const bucket of [SOURCE_BUCKET, FINAL_BUCKET]) {
    const { data: files } = await supabaseAdmin.storage.from(bucket).list(prefix);
    if (!files || files.length === 0) continue;
    const paths = files.map((f) => `${prefix}${f.name}`);
    await supabaseAdmin.storage.from(bucket).remove(paths);
  }
}

export const STORAGE_BUCKETS = {
  source: SOURCE_BUCKET,
  final: FINAL_BUCKET,
} as const;
