#!/usr/bin/env node
// Render Privacy + Terms + Support pages from LegalScreen content arrays
// to static HTML in apps/web/public/. Run as a prebuild step. The output
// HTML is what App Store reviewers and Play Store reviewers see at
// gethaloframe.com/{privacy,terms,support} — they have to be reachable
// without launching the app.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const SOURCE = resolve(REPO_ROOT, 'apps/web/src/screens/LegalScreen.tsx');
const OUT_DIR = resolve(REPO_ROOT, 'apps/web/public');
mkdirSync(OUT_DIR, { recursive: true });

const src = readFileSync(SOURCE, 'utf8');

// Pull each `export const NAME = {...};` object literal out by greedy match
// up to the first `};` on its own line. The content uses literal strings
// (no template-literal interpolation) so a Function() eval is safe.
function extractObjectExport(name) {
  const re = new RegExp(`export const ${name}\\s*=\\s*({[\\s\\S]*?\\n});`, 'm');
  const m = src.match(re);
  if (!m) throw new Error(`could not find export const ${name}`);
  return new Function(`"use strict"; return (${m[1]});`)();
}

const PRIVACY = extractObjectExport('PRIVACY');
const TERMS = extractObjectExport('TERMS');

const STYLE = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #1f1d18; line-height: 1.6; background: #faf7f0; }
  h1 { font-family: Georgia, serif; font-size: 2rem; margin-bottom: 0.25rem; }
  h2 { font-family: Georgia, serif; font-size: 1.25rem; margin-top: 2rem; }
  a { color: #5a4a2c; }
  p { margin: 1rem 0; }
  .meta { color: #7a6f5a; font-size: 0.9rem; margin-bottom: 2rem; }
  footer { margin-top: 4rem; padding-top: 2rem; border-top: 1px solid #e5e1d6; color: #7a6f5a; font-size: 0.9rem; }
`.trim();

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlShell(title, bodyHtml, lastUpdated) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · haloFrame</title>
<style>${STYLE}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${lastUpdated ? `<p class="meta">Last updated ${escapeHtml(lastUpdated)}</p>` : ''}
${bodyHtml}
<footer>
  <p><a href="/">← Back to haloFrame</a></p>
</footer>
</body>
</html>
`;
}

function sectionsToHtml(sections) {
  return sections
    .map(
      (s) =>
        `<section><h2>${escapeHtml(s.heading)}</h2><p>${escapeHtml(s.body)}</p></section>`,
    )
    .join('\n');
}

const LAST_UPDATED_MATCH = src.match(/const LAST_UPDATED\s*=\s*'([^']+)'/);
const LAST_UPDATED = LAST_UPDATED_MATCH ? LAST_UPDATED_MATCH[1] : '';

writeFileSync(
  resolve(OUT_DIR, 'privacy.html'),
  htmlShell(PRIVACY.title, sectionsToHtml(PRIVACY.sections), LAST_UPDATED),
);
writeFileSync(
  resolve(OUT_DIR, 'terms.html'),
  htmlShell(TERMS.title, sectionsToHtml(TERMS.sections), LAST_UPDATED),
);

const SUPPORT_BODY = `
<section>
  <p>Need help? Email <a href="mailto:support@gethaloframe.com">support@gethaloframe.com</a> — we reply within 24 hours.</p>
</section>
<section>
  <h2>Frequently asked</h2>
  <p><strong>How do I delete my account?</strong> Open Settings → Delete Account in the app. We remove all your photos and data within 30 days.</p>
  <p><strong>How do I cancel my subscription?</strong> iOS: Settings → [your name] → Subscriptions → haloFrame → Cancel. Android: Play Store → Subscriptions → haloFrame → Cancel. Web: contact support.</p>
  <p><strong>How is my photo data used?</strong> See the <a href="/privacy">Privacy Policy</a>. Briefly: photos are sent to fal.ai for AI processing only, never used to train models, never shared.</p>
  <p><strong>How do I report a bug?</strong> Email <a href="mailto:support@gethaloframe.com">support@gethaloframe.com</a> with a screenshot if you have one.</p>
  <p><strong>I want a refund.</strong> Email <a href="mailto:support@gethaloframe.com">support@gethaloframe.com</a> within 14 days of the charge. We honor the platform store's refund policy and do our best to resolve quickly.</p>
</section>
`.trim();

writeFileSync(resolve(OUT_DIR, 'support.html'), htmlShell('Support', SUPPORT_BODY, ''));

console.log('[build-legal] wrote privacy.html, terms.html, support.html');
