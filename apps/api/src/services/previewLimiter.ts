// =============================================================================
// HaloFrame — preview rate limiter
//
// Option C pricing says users explore for free (upload, segment, 1K preview)
// and only pay at save time. To prevent a pathological user from running
// hundreds of preview renders against the same uploaded photo without ever
// committing to a save, we cap preview requests per-upload at
// MAX_PREVIEWS_PER_UPLOAD (see packages/shared/src/constants).
//
// Counter is in-memory per-process: acceptable for the single-instance
// deploy shape (one Railway/Render service). If we ever horizontally scale,
// move this to Redis or a ledger table — the imageUrl is stable across
// processes so either backend is trivial.
// =============================================================================
import { MAX_PREVIEWS_PER_UPLOAD } from '@haloframe/shared';

// LRU-ish bound on the map so a long-lived server doesn't grow without
// limit. 10k entries ~= 10k unique uploads tracked at once, which is far
// more than a single instance would realistically juggle.
const MAX_TRACKED_URLS = 10_000;

const previewCounts = new Map<string, number>();

export interface PreviewTrackResult {
  count: number;
  exceeded: boolean;
  limit: number;
}

/**
 * Increment the preview counter for a given source image URL and report
 * whether the cap has been crossed. The handler should reject with
 * `errors.rateLimited()` when `exceeded === true`.
 *
 * `imageUrl` uniquely identifies an upload (fal storage URLs include a
 * random token, so two different uploads of the same file get distinct
 * URLs and distinct counters — the desired behavior: the limit is
 * per-upload-session, not per-bytes-of-image).
 */
export function trackPreview(imageUrl: string): PreviewTrackResult {
  const next = (previewCounts.get(imageUrl) ?? 0) + 1;
  previewCounts.set(imageUrl, next);

  // Bounded eviction: Map iteration is insertion-order, so the first key
  // is the oldest-seen upload. Dropping one on each overflow keeps the
  // map at MAX_TRACKED_URLS entries.
  if (previewCounts.size > MAX_TRACKED_URLS) {
    const firstKey = previewCounts.keys().next().value;
    if (firstKey !== undefined) previewCounts.delete(firstKey);
  }

  return {
    count: next,
    exceeded: next > MAX_PREVIEWS_PER_UPLOAD,
    limit: MAX_PREVIEWS_PER_UPLOAD,
  };
}

/**
 * Testing/diagnostics: peek at the current count without incrementing.
 * Not wired into any route — exported for unit tests.
 */
export function peekPreviewCount(imageUrl: string): number {
  return previewCounts.get(imageUrl) ?? 0;
}

/**
 * Clear all counters. Test-only. Never call in prod paths — a save doesn't
 * reset the counter for that imageUrl either (the save moved to a different
 * operation and is unaffected).
 */
export function __resetPreviewLimiterForTests(): void {
  previewCounts.clear();
}
