// =============================================================================
// EternalFrame web — thin client for the Express /api/spike/* routes
// =============================================================================
import type { ApiResponse, TributeTemplate } from '@eternalframe/shared';

const API_BASE = '/api/spike';

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !json.ok) {
    const errMsg = !json.ok ? json.error.message : `HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  return json.data;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !json.ok) {
    const errMsg = !json.ok ? json.error.message : `HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  return json.data;
}

// -----------------------------------------------------------------------------
// Upload — convert a File to a base64 data URL and POST to /spike/upload
// -----------------------------------------------------------------------------
export async function uploadFile(
  file: File,
): Promise<{ url: string; mime: string; sizeBytes: number }> {
  const dataUrl = await readFileAsDataUrl(file);
  return postJson('/upload', { dataUrl, filename: file.name });
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
  return postJson('/segment', { imageUrl, detectPets, returnCutout }, signal);
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
  },
  signal?: AbortSignal,
): Promise<ApplyResult> {
  return postJson('/apply', args, signal);
}

// -----------------------------------------------------------------------------
// Merge (Reunite flow)
// -----------------------------------------------------------------------------
export interface MergeResult {
  imageUrl: string;
  prompt: string;
  placement: 'left' | 'right' | 'behind' | 'front';
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
  },
  signal?: AbortSignal,
): Promise<MergeResult> {
  return postJson('/merge', args, signal);
}

// -----------------------------------------------------------------------------
// Templates
// -----------------------------------------------------------------------------
export async function fetchTemplates(signal?: AbortSignal): Promise<TributeTemplate[]> {
  const data = await getJson<{ templates: TributeTemplate[] }>('/templates', signal);
  return data.templates;
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
