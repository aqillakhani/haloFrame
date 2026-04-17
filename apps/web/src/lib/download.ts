// =============================================================================
// Save an image URL to the user's device. Extracted from Editor so the
// Reunite review screen can trigger the same download path before opening
// the "Saved to Photos" modal. Behavior is identical to what the Editor has
// been using since v1.0 — fetch the bytes same-origin, synthesize a blob
// URL, click a hidden <a download>. The `download` attribute is ignored
// on cross-origin URLs (fal.media), so we can't just set href directly.
// =============================================================================

export async function triggerDownload(
  url: string,
  filename = 'eternalframe-tribute.png',
): Promise<void> {
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
