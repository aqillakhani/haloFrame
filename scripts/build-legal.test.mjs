import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';

const OUT = 'apps/web/public';

test('build-legal generates privacy + terms + support HTML', () => {
  rmSync(`${OUT}/privacy.html`, { force: true });
  rmSync(`${OUT}/terms.html`, { force: true });
  rmSync(`${OUT}/support.html`, { force: true });

  const result = spawnSync('node', ['scripts/build-legal.mjs'], { stdio: 'pipe' });
  assert.strictEqual(result.status, 0, result.stderr.toString());

  for (const f of ['privacy.html', 'terms.html', 'support.html']) {
    assert.ok(existsSync(`${OUT}/${f}`), `${f} missing`);
    const html = readFileSync(`${OUT}/${f}`, 'utf8');
    assert.match(html, /<html/);
    assert.match(html, /<title>/);
  }
});

test('privacy mentions fal.ai', () => {
  const html = readFileSync(`${OUT}/privacy.html`, 'utf8');
  assert.match(html, /fal\.ai/i);
});

test('support links back to privacy and lists subscription cancellation', () => {
  const html = readFileSync(`${OUT}/support.html`, 'utf8');
  assert.match(html, /privacy/i);
  assert.match(html, /subscription/i);
});
