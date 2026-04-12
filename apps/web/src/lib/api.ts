// =============================================================================
// EternalFrame web — thin client for the Express /api/spike/* routes
// =============================================================================
import type { ApiResponse, TributeTemplate } from '@eternalframe/shared';

const API_BASE = '/api/spike';

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !json.ok) {
    const errMsg = !json.ok ? json.error.message : `HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  return json.data;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
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
}

export async function segmentImage(
  imageUrl: string,
  detectPets: boolean,
): Promise<SegmentResult> {
  return postJson('/segment', { imageUrl, detectPets });
}

// -----------------------------------------------------------------------------
// Apply template
// -----------------------------------------------------------------------------
export interface ApplyResult {
  imageUrl: string;
  prompt: string;
  templateId: string;
  intensity: 'low' | 'medium' | 'high';
  skipped?: boolean;
}

export interface ApplySubjectContext {
  centroid: { x: number; y: number };
  bbox: [number, number, number, number];
}

export async function applyTemplate(args: {
  imageUrl: string;
  templateId: string;
  intensity: 'low' | 'medium' | 'high';
  subjectName?: string;
  isPet: boolean;
  /** Pass the same subjects array from SegmentResult + the selected index to
   *  disambiguate which person gets the effect in multi-person photos. */
  subjects?: ApplySubjectContext[];
  selectedSubjectIndex?: number;
  imageWidth?: number;
  imageHeight?: number;
}): Promise<ApplyResult> {
  return postJson('/apply', args);
}

// -----------------------------------------------------------------------------
// Merge (Reunite flow)
// -----------------------------------------------------------------------------
export interface MergeResult {
  imageUrl: string;
  prompt: string;
  placement: 'left' | 'right' | 'behind' | 'center';
}

export async function mergePhotos(args: {
  mainPhotoUrl: string;
  lovedOnePhotoUrl: string;
  placement: 'left' | 'right' | 'behind' | 'center';
  subjectName?: string;
  isPet: boolean;
}): Promise<MergeResult> {
  return postJson('/merge', args);
}

// -----------------------------------------------------------------------------
// Templates
// -----------------------------------------------------------------------------
export async function fetchTemplates(): Promise<TributeTemplate[]> {
  const data = await getJson<{ templates: TributeTemplate[] }>('/templates');
  return data.templates;
}
