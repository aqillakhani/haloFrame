// =============================================================================
// HaloFrame web — thin client for the Express /api routes
//
// Every request carries the current Supabase session's access_token as a
// Bearer header (see getAuthHeader). Cost-bearing endpoints require auth;
// the browseable `/api/spike/segment` and `/api/spike/apply` (preview
// resolution) routes accept an absent header.
// =============================================================================
import type {
  ApiResponse,
  SubscriptionSnapshot,
  Tribute,
  TributeTemplate,
} from '@haloframe/shared';
import { supabase } from './supabase';

// Router-mode flag. `prod` (default) enables the /api/tribute/* bridge for
// list/delete/save. `spike` disables it — useful for AI-only local iteration
// against a server booted with SPIKE_MODE=true where the tribute routes
// aren't mounted. See docs/plans/2026-04-21-production-ready-progress.md
// (Phase B scope decision).
export const API_MODE: 'prod' | 'spike' =
  (import.meta.env.VITE_API_MODE as 'prod' | 'spike' | undefined) ?? 'prod';

export const isTributeBridgeEnabled = (): boolean => API_MODE === 'prod';

// -----------------------------------------------------------------------------
// Typed errors — consumers can branch on .code without string-matching
// message copy.
// -----------------------------------------------------------------------------
export class ApiRequestError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details: unknown;
  constructor(code: string, message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function isInsufficientCreditsError(err: unknown): err is ApiRequestError {
  return err instanceof ApiRequestError && err.code === 'insufficient_credits';
}

export function isRateLimitedError(err: unknown): err is ApiRequestError {
  return err instanceof ApiRequestError && err.code === 'rate_limited';
}

// -----------------------------------------------------------------------------
// Low-level fetch wrappers
// -----------------------------------------------------------------------------
async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readJson<T>(res: Response): Promise<T> {
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !json.ok) {
    if (!json.ok) {
      throw new ApiRequestError(
        json.error.code,
        json.error.message,
        res.status,
        json.error.details,
      );
    }
    throw new ApiRequestError('http_error', `HTTP ${res.status}`, res.status);
  }
  return json.data;
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(await getAuthHeader()),
    },
    body: JSON.stringify(body),
    signal,
  });
  return readJson<T>(res);
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    headers: await getAuthHeader(),
    signal,
  });
  return readJson<T>(res);
}

// -----------------------------------------------------------------------------
// Upload — convert a File to a base64 data URL and POST to /spike/upload
// -----------------------------------------------------------------------------
export async function uploadFile(
  file: File,
): Promise<{ url: string; mime: string; sizeBytes: number }> {
  const dataUrl = await readFileAsDataUrl(file);
  return postJson('/api/spike/upload', { dataUrl, filename: file.name });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// -----------------------------------------------------------------------------
// Segment
// -----------------------------------------------------------------------------
export interface Subject {
  maskId: string;
  maskUrl: string;
  label: string;
  confidence: number;
  centroid: { x: number; y: number };
  bbox: [number, number, number, number];
  pixelCount: number;
}

export interface SegmentResult {
  imageWidth: number;
  imageHeight: number;
  subjects: Subject[];
  /**
   * When the caller passes `returnCutout: true`, the server returns a URL to
   * a transparent-background PNG of the dominant subject (`subjects[0]`).
   * Undefined if cutout wasn't requested or failed (client falls back to the
   * raw uploaded photo in that case).
   */
  cutoutUrl?: string;
}

export async function segmentImage(
  imageUrl: string,
  detectPets: boolean,
  returnCutout = false,
  signal?: AbortSignal,
): Promise<SegmentResult> {
  return postJson('/api/spike/segment', { imageUrl, detectPets, returnCutout }, signal);
}

// -----------------------------------------------------------------------------
// Apply template
// -----------------------------------------------------------------------------
export type ApplyResolution = 'preview' | 'final';

export interface ApplyResult {
  imageUrl: string;
  prompt: string;
  templateIds: string[];
  intensity: 'low' | 'medium' | 'high';
  resolution: ApplyResolution;
  skipped?: boolean;
  /** Present on final resolution — the balance the user has left after this save. */
  creditsRemaining?: number;
}

export interface ApplySubjectContext {
  centroid: { x: number; y: number };
  bbox: [number, number, number, number];
  /**
   * SAM mask URL for this subject. When the server gets non-target masks
   * it post-processes the NB2 edit to composite original pixels back over
   * non-target people, preventing style bleed. Optional so legacy paths
   * that only had bboxes still work.
   */
  maskUrl?: string;
}

export async function applyTemplate(
  args: {
    imageUrl: string;
    /**
     * One or more template IDs. Multiple IDs are combined into ONE API call on
     * the backend so cost is constant regardless of how many styles are stacked.
     */
    templateIds: string[];
    intensity: 'low' | 'medium' | 'high';
    subjectName?: string;
    isPet: boolean;
    /** Pass the same subjects array from SegmentResult + the selected index to
     *  disambiguate which person gets the effect in multi-person photos. */
    subjects?: ApplySubjectContext[];
    selectedSubjectIndex?: number;
    imageWidth?: number;
    imageHeight?: number;
    /** 'preview' = 1K (fast, used for in-editor previews and mixing). 'final' = 2K (default, what users save/print). */
    resolution?: ApplyResolution;
    /** Reunite placement context — drives wings z-order. See spike.ts /apply. */
    placement?: 'left' | 'right' | 'behind' | 'front';
    /** Stable save id — doubles as the ledger dedupe key on final renders. */
    saveId?: string;
  },
  signal?: AbortSignal,
): Promise<ApplyResult> {
  return postJson('/api/spike/apply', args, signal);
}

// -----------------------------------------------------------------------------
// Merge (Reunite flow)
// -----------------------------------------------------------------------------
export interface MergeResult {
  imageUrl: string;
  prompt: string;
  placement: 'left' | 'right' | 'behind' | 'front';
  creditsRemaining?: number;
}

export async function mergePhotos(
  args: {
    mainPhotoUrl: string;
    lovedOnePhotoUrl: string;
    /**
     * Transparent-background cutout of the loved one. When supplied, the
     * server pre-composites them onto the main photo at a precise target
     * size/position, which is the reliable way to honor the user's size
     * slider. See /spike/merge for the composite path.
     */
    lovedOneCutoutUrl?: string;
    placement: 'left' | 'right' | 'behind' | 'front';
    subjectName?: string;
    isPet: boolean;
    sizeAdjustment?: number;
    saveId?: string;
  },
  signal?: AbortSignal,
): Promise<MergeResult> {
  return postJson('/api/spike/merge', args, signal);
}

// -----------------------------------------------------------------------------
// Templates
// -----------------------------------------------------------------------------
export async function fetchTemplates(signal?: AbortSignal): Promise<TributeTemplate[]> {
  const data = await getJson<{ templates: TributeTemplate[] }>('/api/spike/templates', signal);
  return data.templates;
}

// -----------------------------------------------------------------------------
// Tribute persistence bridge (Phase B)
// -----------------------------------------------------------------------------
// The AI pipeline stays on /api/spike/*. These thin calls live on
// /api/tribute/* and give MyTributes + account-delete a real data source.
// All three silently no-op in `spike` API mode so an AI-only dev loop still
// works without the production router mounted.
// -----------------------------------------------------------------------------

export interface SaveSpikeResultArgs {
  flowType: 'enhance' | 'reunite' | 'pet_enhance' | 'pet_reunite';
  isPet: boolean;
  templateIds: string[];
  intensity: 'low' | 'medium' | 'high';
  finalImageUrl: string;
  /** Stable idempotency key — reusing the same key returns the existing row. */
  saveId: string;
  subjectName?: string;
  placement?: 'left' | 'right' | 'behind' | 'front';
}

export async function saveSpikeResult(
  args: SaveSpikeResultArgs,
  signal?: AbortSignal,
): Promise<Tribute | null> {
  if (!isTributeBridgeEnabled()) return null;
  const data = await postJson<{ tribute: Tribute }>('/api/tribute/save-spike-result', args, signal);
  return data.tribute;
}

export async function listTributes(signal?: AbortSignal): Promise<Tribute[]> {
  if (!isTributeBridgeEnabled()) return [];
  const data = await getJson<{ tributes: Tribute[] }>('/api/tribute/', signal);
  return data.tributes;
}

export async function deleteTribute(
  tributeId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!isTributeBridgeEnabled()) return false;
  const res = await fetch(`/api/tribute/${encodeURIComponent(tributeId)}`, {
    method: 'DELETE',
    headers: await getAuthHeader(),
    signal,
  });
  const json = (await res.json()) as ApiResponse<{ deleted: boolean }>;
  if (!res.ok || !json.ok) {
    if (!json.ok) {
      throw new ApiRequestError(
        json.error.code,
        json.error.message,
        res.status,
        json.error.details,
      );
    }
    throw new ApiRequestError('http_error', `HTTP ${res.status}`, res.status);
  }
  return json.data.deleted;
}

// -----------------------------------------------------------------------------
// Subscription / credits
// -----------------------------------------------------------------------------
export async function fetchSubscriptionStatus(
  signal?: AbortSignal,
): Promise<SubscriptionSnapshot> {
  return getJson<SubscriptionSnapshot>('/api/subscription/status', signal);
}

export interface StartPurchaseResult {
  /** Present once Stripe/RC checkout is wired. During MVP we throw instead. */
  checkoutUrl?: string;
}

export async function startPurchase(args: {
  planId:
    | 'keepsake_monthly'
    | 'heritage_monthly'
    | 'heritage_annual'
    | 'topup_4pack'
    | 'topup_single';
  successUrl?: string;
  cancelUrl?: string;
}): Promise<StartPurchaseResult> {
  return postJson<StartPurchaseResult>('/api/subscription/purchase', {
    ...args,
    platform: 'web',
  });
}

// Warm the browser cache for static FLUX style thumbs so they paint instantly
// when the gallery mounts inside the Editor. Without this, the gallery first
// paints with empty tile gradients and the thumbs trickle in over a few
// hundred ms — looks broken because the thumbs are the entire point of the
// tile. Idempotent: the browser dedupes by URL, so calling it from both flows
// is fine. References are stashed globally so the browser doesn't GC pending
// loads before they complete. fetchpriority="high" aligns with the consuming
// <img> tags so the preload cache entry matches and gets reused.
const PRELOADED_IMAGES = new Set<HTMLImageElement>();

export function preloadSampleImages(templates: TributeTemplate[]): void {
  if (typeof window === 'undefined') return;
  for (const t of templates) {
    if (!t.sampleImageUrl) continue;
    const img = new Image();
    img.decoding = 'async';
    // fetchpriority is a valid HTML attribute but missing from DOM types in
    // this version. Setting via setAttribute avoids the type gap.
    img.setAttribute('fetchpriority', 'high');
    img.src = t.sampleImageUrl;
    PRELOADED_IMAGES.add(img);
  }
}
