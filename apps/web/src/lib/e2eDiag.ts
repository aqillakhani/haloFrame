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

// Mirror of photoPicker.ts's nativePathFromWebPath — derive a Filesystem-
// readable file:// path from a Capacitor webPath. Kept in sync deliberately so
// the diagnostic can report WHICH route (photo.path vs webPath-derived) yields
// bytes on a real iOS picker result — exactly the rc6→rc7 difference.
function nativePathFromWebPath(webPath: string | undefined): string | null {
  if (!webPath) return null;
  const marker = '_capacitor_file_';
  const i = webPath.indexOf(marker);
  if (i === -1) return null;
  const abs = webPath.slice(i + marker.length);
  return abs.startsWith('/') ? `file://${abs}` : null;
}

function ensurePanel(): void {
  if (panel) return;
  panel = document.createElement('pre');
  panel.id = 'e2e-diag';
  panel.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;margin:0;padding:14px;background:#fff;color:#111;font:13px/1.45 ui-monospace,monospace;white-space:pre-wrap;overflow:auto;';
  document.body.appendChild(panel);
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
  ensurePanel();

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

// =============================================================================
// REAL-PICKER diagnostic (VITE_E2E_DIAG === '2'). Unlike runE2EDiag (which
// synthesizes a JPEG to isolate the post-pick pipeline), this opens the ACTUAL
// iOS system photo picker via Camera.pickImages — the one link a synthetic test
// and source-reading can't fully prove. The Codemagic `ios-sim-diagnostic`
// workflow seeds the simulator photo library and uses Maestro to tap a photo
// (PHPicker is out-of-process, so a coordinate tap, not element selection).
//
// It then runs the EXACT read-candidate loop photoPicker.ts ships, logging
// which route (photo.path = rc6, or webPath-derived file:// = rc7) actually
// yields bytes — answering both "does the real picker work?" and "would rc6
// alone have worked?".
// =============================================================================
export async function runE2EPickDiag(): Promise<void> {
  ensurePanel();
  log(`START pick-mode platform=${Capacitor.getPlatform()} native=${Capacitor.isNativePlatform()}`);

  let pickOk = false;
  let pipelineOk = false;
  try {
    // Wait briefly for the anonymous session (needed for upload, NOT for the
    // pick/read — so we proceed to pick regardless of the outcome here).
    log('step0: wait up to 8s for supabase session...');
    let haveSession = false;
    for (let i = 0; i < 16; i++) {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        haveSession = true;
        log(`  session present uid=${data.session.user.id.slice(0, 8)}`);
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!haveSession) log('  session NONE (upload may fail; pick/read still tested)');

    // 1. Open the REAL system photo picker. Race a watchdog so a missed tap
    //    writes a useful timeout result instead of hanging the whole build.
    log('step1: opening REAL photo picker (Camera.pickImages)...');
    log('  (waiting for Maestro to tap a seeded photo — PHPicker is on screen)');
    const { Camera } = await import('@capacitor/camera');
    const pickP = Camera.pickImages({ limit: 1, quality: 90 });
    const timeoutP = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('PICK_TIMEOUT — no photo selected within 75s (UI tap likely missed the cell)')),
        75000,
      ),
    );
    const result = await Promise.race([pickP, timeoutP]);
    const photo = result.photos[0];
    log(`  pickImages resolved: photos.length=${result.photos.length}`);
    if (!photo) throw new Error('picker returned no photo (cancelled / empty selection)');
    log(`  photo.path    = ${photo.path ?? '(undefined)'}`);
    log(`  photo.webPath = ${photo.webPath ?? '(undefined)'}`);
    log(`  photo.format  = ${photo.format ?? '(undefined)'}`);

    // 2. The SHIPPED read-candidate loop, instrumented per-route.
    const mime = photo.format ? `image/${photo.format}` : 'image/jpeg';
    const candidates: Array<{ label: string; path: string }> = [];
    if (photo.path) candidates.push({ label: 'photo.path (rc6 route)', path: photo.path });
    const fromWeb = nativePathFromWebPath(photo.webPath);
    if (fromWeb && fromWeb !== photo.path) {
      candidates.push({ label: 'webPath-derived file:// (rc7 route)', path: fromWeb });
    }
    log(`  read candidates: ${candidates.length}`);

    const { Filesystem } = await import('@capacitor/filesystem');
    let blob: Blob | undefined;
    let winningRoute = 'none';
    for (const c of candidates) {
      try {
        const file = await Filesystem.readFile({ path: c.path });
        const data = typeof file.data === 'string' ? file.data : '';
        log(`    [${c.label}] readFile ok base64Len=${data.length}`);
        if (data && !blob) {
          const bytes = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
          blob = new Blob([bytes], { type: mime });
          winningRoute = c.label;
        }
      } catch (e) {
        log(`    [${c.label}] readFile FAILED: ${String((e as Error)?.message ?? e)}`);
      }
    }
    if (!blob) {
      log('  all Filesystem routes failed; trying fetch(webPath) [expected broken by CapacitorHttp]...');
      try {
        const r = await fetch(photo.webPath);
        blob = await r.blob();
        winningRoute = 'fetch(webPath)';
        log(`    fetch ok size=${blob.size}`);
      } catch (e) {
        log(`    fetch FAILED: ${String((e as Error)?.message ?? e)}`);
      }
    }
    if (!blob) throw new Error('NO BYTES — the real picker produced no blob (this would be the upload bug)');
    pickOk = true;
    log(`  ✅ PICK PROOF: blob via "${winningRoute}", size=${blob.size}`);

    // 3. Prove the rest end-to-end (needs the session for auth).
    const file = new File([blob], 'pick.jpg', { type: mime });
    log('step2: uploadFile...');
    try {
      const up = await uploadFile(file);
      log(`  upload OK url=${(up.url || '').slice(0, 64)} bytes=${up.sizeBytes}`);
      log('step3: segmentImage...');
      const seg = await segmentImage(up.url, true);
      log(`  segment OK subjects=${seg.subjects.length} dims=${seg.imageWidth}x${seg.imageHeight}`);
      pipelineOk = true;
    } catch (e) {
      log(`  upload/segment failed (likely no anon session in CI): ${String((e as Error)?.message ?? e)}`);
    }
  } catch (err) {
    const e = err as { name?: string; message?: string; stack?: string };
    log(`ERROR: ${e?.name || 'Error'}: ${e?.message ?? String(err)}`);
    if (e?.stack) log(`stack: ${e.stack.slice(0, 500)}`);
  } finally {
    log(`RESULT: pick=${pickOk ? 'PASS' : 'FAIL'} pipeline=${pipelineOk ? 'PASS' : 'FAIL/SKIP'}`);
    await writeResult();
    log('DONE');
    await writeResult();
  }
}
