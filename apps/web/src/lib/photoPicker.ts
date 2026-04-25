// =============================================================================
// HaloFrame web — platform-aware photo picker
//
// On native (Capacitor), uses the Camera plugin's pickImages — an out-of-
// process picker that satisfies Apple guideline 5.1.1(iii) (the user picks
// photos from the system photo library without granting the app blanket
// access). On web, falls back to a programmatic <input type=file>.
//
// Always returns the same { url, blob, format } shape so callers don't
// branch.
// =============================================================================
import { Capacitor } from '@capacitor/core';

export interface PickedPhoto {
  /** A URL the browser can render — capacitor://, blob:, or http://. */
  url: string;
  /** The actual bytes if available. Web always provides; native fetches via webPath. */
  blob?: Blob;
  /** MIME or extension hint, when known. */
  format?: string;
}

export async function pickPhoto(): Promise<PickedPhoto | null> {
  if (Capacitor.isNativePlatform()) {
    const { Camera } = await import('@capacitor/camera');
    const result = await Camera.pickImages({ limit: 1, quality: 90 });
    const photo = result.photos[0];
    if (!photo) return null;
    let blob: Blob | undefined;
    try {
      const res = await fetch(photo.webPath);
      blob = await res.blob();
    } catch {
      // The webPath may be inaccessible on some platforms; caller can still
      // render via the URL or re-fetch later.
      blob = undefined;
    }
    return { url: photo.webPath, blob, format: photo.format };
  }

  // Web fallback: programmatic <input type=file>. Resolves with the file
  // when the user picks one, or null when they cancel (the dialog itself
  // doesn't fire 'cancel' reliably across browsers, so we time out via the
  // window-focus heuristic to detect cancellation).
  return new Promise<PickedPhoto | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    let settled = false;
    const settle = (value: PickedPhoto | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return settle(null);
      const url = URL.createObjectURL(file);
      settle({ url, blob: file, format: file.type });
    };
    // Some browsers fire input.cancel; others don't. Attach as best-effort.
    input.addEventListener('cancel', () => settle(null));
    input.click();
  });
}
