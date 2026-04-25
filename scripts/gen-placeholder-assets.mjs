#!/usr/bin/env node
// One-shot generator for icon.png + splash.png placeholders. Aqil swaps
// these for the V1 hero artwork later; @capacitor/assets then derives all
// the per-density iOS + Android variants from them.
//
// Why these dimensions: @capacitor/assets requires icon.png ≥ 1024×1024
// and splash.png at 2732×2732 (the largest splash size for iPad Pro 12.9).
// Anything smaller throws and refuses to generate.

import sharp from 'sharp';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'apps/web/resources');
mkdirSync(OUT, { recursive: true });

const BG = '#FAF3E2';
const RING = '#C9A971';
const RING_SHADOW = '#9F7E48';

function svgIcon(size) {
  const c = size / 2;
  const ringR = size * 0.38;
  const innerR = size * 0.27;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="100%" height="100%" fill="${BG}" />
    <circle cx="${c}" cy="${c}" r="${ringR}" fill="${RING}" />
    <circle cx="${c}" cy="${c}" r="${innerR}" fill="${BG}" />
    <text x="${c}" y="${c + size * 0.06}" font-family="Georgia, serif"
          font-size="${size * 0.22}" fill="${RING_SHADOW}"
          text-anchor="middle" font-weight="600">h</text>
  </svg>`;
}

function svgSplash(size) {
  const c = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="100%" height="100%" fill="${BG}" />
    <circle cx="${c}" cy="${c}" r="${size * 0.15}" fill="none"
            stroke="${RING}" stroke-width="${size * 0.012}" />
    <circle cx="${c}" cy="${c}" r="${size * 0.18}" fill="none"
            stroke="${RING}" stroke-width="${size * 0.004}" opacity="0.5" />
  </svg>`;
}

await sharp(Buffer.from(svgIcon(1024)))
  .png()
  .toFile(resolve(OUT, 'icon.png'));

await sharp(Buffer.from(svgSplash(2732)))
  .png()
  .toFile(resolve(OUT, 'splash.png'));

console.log('[gen-placeholder-assets] wrote icon.png (1024) + splash.png (2732)');
