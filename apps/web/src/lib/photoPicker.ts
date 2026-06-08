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

// Derive a Filesystem-readable `file://` path from a Capacitor webPath.
// PHPicker's webPath looks like
//   capacitor://localhost/_capacitor_file_/var/mobile/.../img.jpg
// while the bytes live at file:///var/mobile/.../img.jpg. This lets us read
// the file even on an iOS/plugin version that returns webPath but omits the
// documented `path` field — a second independent route to the same bytes.
function nativePathFromWebPath(webPath: string | undefined): string | null {
  if (!webPath) return null;
  const marker = '_capacitor_file_';
  const i = webPath.indexOf(marker);
  if (i === -1) return null;
  const abs = webPath.slice(i + marker.length);
  return abs.startsWith('/') ? `file://${abs}` : null;
}

export async function pickPhoto(): Promise<PickedPhoto | null> {
  if (Capacitor.isNativePlatform()) {
    const { Camera } = await import('@capacitor/camera');
    const result = await Camera.pickImages({ limit: 1, quality: 90 });
    const photo = result.photos[0];
    if (!photo) return null; // user cancelled the picker

    const mime = photo.format ? `image/${photo.format}` : 'image/jpeg';

    // Read the bytes via @capacitor/filesystem, NOT fetch(photo.webPath).
    // CapacitorHttp.enabled (capacitor.config.ts) patches the global fetch to
    // route through the native HTTP bridge, which doesn't understand the
    // capacitor:// scheme PHPicker returns — fetch(webPath) fails silently,
    // blob stays undefined, and every caller bailed at
    // `if (!photo?.blob) return;`. The user's tap did nothing: the TestFlight
    // gallery-upload bug. Filesystem talks to its own native plugin and is
    // unaffected.
    //
    // Try the documented `path` first, then a path derived from `webPath`, so
    // a single missing or unreadable field can't strand the upload again.
    let blob: Blob | undefined;
    const candidates: string[] = [];
    if (photo.path) candidates.push(photo.path);
    const fromWeb = nativePathFromWebPath(photo.webPath);
    if (fromWeb && fromWeb !== photo.path) candidates.push(fromWeb);

    if (candidates.length > 0) {
      const { Filesystem } = await import('@capacitor/filesystem');
      for (const path of candidates) {
        try {
          const file = await Filesystem.readFile({ path });
          const data = typeof file.data === 'string' ? file.data : '';
          if (data) {
            blob = new Blob([base64ToArrayBuffer(data)], { type: mime });
            break;
          }
        } catch {
          // Try the next candidate path.
        }
      }
    }

    // Last resort: fetch(webPath). Broken when CapacitorHttp patches fetch
    // (the bug above), but harmless to try, and works on any platform where
    // fetch isn't intercepted.
    if (!blob) {
      try {
        const res = await fetch(photo.webPath);
        blob = await res.blob();
      } catch {
        blob = undefined;
      }
    }

    // Return a blob-less photo when every read failed — callers surface a
    // visible "couldn't read that photo" error instead of bailing silently.
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
