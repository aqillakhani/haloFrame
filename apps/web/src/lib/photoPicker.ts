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
  /** The actual bytes if available. Web always provides; native loads via Filesystem. */
  blob?: Blob;
  /** MIME or extension hint, when known. */
  format?: string;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bin = atob(base64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

export async function pickPhoto(): Promise<PickedPhoto | null> {
  if (Capacitor.isNativePlatform()) {
    const { Camera } = await import('@capacitor/camera');
    const result = await Camera.pickImages({ limit: 1, quality: 90 });
    const photo = result.photos[0];
    if (!photo) return null;
    let blob: Blob | undefined;
    // Native primary: read bytes directly via Filesystem. We avoid
    // fetch(photo.webPath) because CapacitorHttp.enabled (see
    // capacitor.config.ts) patches the global fetch to route through the
    // native HTTP bridge, which does not understand the capacitor://
    // scheme that PHPicker returns. When that fetch failed silently the
    // callers' `if (!photo?.blob) return;` bailed and the user's tap did
    // nothing — the TestFlight gallery-upload regression. Filesystem talks
    // to its own native plugin and is unaffected.
    if (photo.path) {
      try {
        const { Filesystem } = await import('@capacitor/filesystem');
        const file = await Filesystem.readFile({ path: photo.path });
        const data = typeof file.data === 'string' ? file.data : '';
        if (data) {
          const mime = photo.format ? `image/${photo.format}` : 'image/jpeg';
          blob = new Blob([base64ToArrayBuffer(data)], { type: mime });
        }
      } catch {
        // Fall through to the fetch fallback below.
      }
    }
    // Fallback: fetch(webPath). Works for web-rendered paths and any
    // future platform where CapacitorHttp isn't intercepting fetch.
    if (!blob) {
      try {
        const res = await fetch(photo.webPath);
        blob = await res.blob();
      } catch {
        blob = undefined;
      }
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
