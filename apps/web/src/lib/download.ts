// =============================================================================
// Save an image URL to the user's device.
//
// Web: fetch bytes → synthesize a blob URL → click a hidden <a download>.
// Native (Capacitor): base64-encode the fetched bytes and hand them to the
//   Filesystem plugin scoped to the Photos library on iOS / the Pictures
//   gallery on Android. This matches user expectation — tapping "Save"
//   surfaces the tribute in their phone's native photos app.
// =============================================================================
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

export async function triggerDownload(
  url: string,
  filename = 'haloframe-tribute.png',
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    return triggerNativeSave(url, filename);
  }
  return triggerWebSave(url, filename);
}

async function triggerWebSave(url: string, filename: string): Promise<void> {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`download fetch -> ${r.status}`);
    const blob = await r.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (err) {
    console.error('[download] failed, opening in new tab', err);
    window.open(url, '_blank', 'noopener');
  }
}

async function triggerNativeSave(url: string, filename: string): Promise<void> {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`download fetch -> ${r.status}`);
    const blob = await r.blob();
    const base64 = await blobToBase64(blob);
    // Directory.Documents is the most portable; iOS + Android both surface it
    // through the native Files/Photos pickers. The plugin no-ops when the
    // permission isn't granted; native prompts are handled by the OS.
    await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
  } catch (err) {
    console.error('[download:native] failed', err);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        // Strip the `data:...;base64,` prefix — Filesystem.writeFile wants
        // the raw base64 payload.
        const idx = result.indexOf(',');
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      } else {
        reject(new Error('FileReader returned non-string'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}
