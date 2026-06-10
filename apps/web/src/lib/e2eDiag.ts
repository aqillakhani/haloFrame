// =============================================================================
// E2E Simulator diagnostic — runs ONLY when VITE_E2E_DIAG === '1' (set by the
// Codemagic `ios-sim-diagnostic` workflow; never in prod). It exercises the
// REAL native upload pipeline suspected of failing on TestFlight —
// Filesystem read -> uploadFile -> segmentImage — WITHOUT driving PHPicker
// (which would hang an unattended simulator). The post-pick path is the
// suspect: rc6 shipped the Filesystem read fix and upload still fails on a
// real device, so this isolates which step actually breaks on an iOS runtime.
//
// Output goes to two places so CI can read it without flaky log scraping:
//   1. a fullscreen DOM panel (captured by `simctl io screenshot`)
//   2. Documents/e2e-result.txt (read back via `simctl get_app_container`)
//
// Gated behind a dynamic import in main.tsx, so it tree-shakes out of normal
// builds entirely.
// =============================================================================
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import { uploadFile, segmentImage } from './api';

const lines: string[] = [];
let panel: HTMLPreElement | null = null;

function log(msg: string): void {
  lines.push(msg);
  // eslint-disable-next-line no-console
  console.log(`[E2E_DIAG] ${msg}`);
  if (panel) panel.textContent = lines.join('\n');
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('FileReader failed'));
    r.readAsDataURL(file);
  });
}

// A synthetic portrait-ish JPEG generated at runtime (no bundled asset, no
// fetch — fetch of capacitor:// is exactly what CapacitorHttp breaks).
function makeTestJpeg(): File {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d canvas context');
  ctx.fillStyle = '#d8c9a8';
  ctx.fillRect(0, 0, 320, 320);
  ctx.fillStyle = '#3a2f24';
  ctx.beginPath();
  ctx.arc(160, 140, 70, 0, Math.PI * 2); // head
  ctx.fill();
  ctx.fillRect(110, 200, 100, 120); // shoulders
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  const b64 = dataUrl.split(',')[1] ?? '';
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new File([new Blob([bytes], { type: 'image/jpeg' })], 'e2e.jpg', {
    type: 'image/jpeg',
  });
}

async function writeResult(): Promise<void> {
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    await Filesystem.writeFile({
      path: 'e2e-result.txt',
      data: lines.join('\n'),
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('[E2E_DIAG] writeResult failed', e);
  }
}

export async function runE2EDiag(): Promise<void> {
  panel = document.createElement('pre');
  panel.id = 'e2e-diag';
  panel.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;margin:0;padding:14px;background:#fff;color:#111;font:13px/1.45 ui-monospace,monospace;white-space:pre-wrap;overflow:auto;';
  document.body.appendChild(panel);

  log(`START platform=${Capacitor.getPlatform()} native=${Capacitor.isNativePlatform()}`);
  try {
    // 0. Wait briefly for the anonymous session the app signs in on boot.
    log('step0: wait for supabase session...');
    let haveSession = false;
    for (let i = 0; i < 20; i++) {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        haveSession = true;
        log(`  session present uid=${data.session.user.id.slice(0, 8)}`);
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!haveSession) log('  session NONE (anon sign-in did not complete)');

    // 1. Filesystem write+read round-trip — mirrors the picker reading the
    //    PHPicker temp file via @capacitor/filesystem (the rc6 fix mechanism).
    log('step1: Filesystem write+read round-trip...');
    const seed = makeTestJpeg();
    const seedB64 = await fileToBase64(seed);
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.writeFile({
      path: 'e2e-src.jpg',
      data: seedB64,
      directory: Directory.Cache,
    });
    const { uri } = await Filesystem.getUri({ path: 'e2e-src.jpg', directory: Directory.Cache });
    log(`  wrote, uri=${uri}`);
    const read = await Filesystem.readFile({ path: uri });
    const readB64 = typeof read.data === 'string' ? read.data : '';
    log(`  readFile ok base64Len=${readB64.length}`);
    const bytes = Uint8Array.from(atob(readB64), (c) => c.charCodeAt(0));
    const file = new File([new Blob([bytes], { type: 'image/jpeg' })], 'e2e.jpg', {
      type: 'image/jpeg',
    });
    log(`  rebuilt File size=${file.size}`);

    // 2. uploadFile — base64 dataURL POST through CapacitorHttp to the API.
    log('step2: uploadFile (CapacitorHttp POST)...');
    const up = await uploadFile(file);
    log(`  upload OK url=${(up.url || '').slice(0, 64)} bytes=${up.sizeBytes}`);

    // 3. segmentImage.
    log('step3: segmentImage...');
    const seg = await segmentImage(up.url, true);
    log(`  segment OK subjects=${seg.subjects.length} dims=${seg.imageWidth}x${seg.imageHeight}`);

    log('RESULT: PASS — native upload pipeline works on this runtime');
  } catch (err) {
    const e = err as { name?: string; message?: string; stack?: string };
    log(`RESULT: FAIL — ${e?.name || 'Error'}: ${e?.message ?? String(err)}`);
    if (e?.stack) log(`stack: ${e.stack.slice(0, 500)}`);
  } finally {
    await writeResult();
    log('DONE');
    await writeResult();
  }
}
