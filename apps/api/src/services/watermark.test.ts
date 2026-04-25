import { describe, it, expect, afterEach } from 'vitest';
import sharp from 'sharp';
import { applyWatermark } from './watermark.js';

async function solidPng(width: number, height: number, rgba: number[]): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: {
        r: rgba[0],
        g: rgba[1],
        b: rgba[2],
        alpha: rgba[3] / 255,
      },
    },
  })
    .png()
    .toBuffer();
}

describe('applyWatermark', () => {
  afterEach(() => {
    delete process.env.WATERMARK_DISABLED;
  });

  it('preserves output dimensions', async () => {
    const input = await solidPng(800, 600, [200, 200, 200, 255]);
    const output = await applyWatermark(input);
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
  });

  it('changes pixels in the bottom-right region', async () => {
    const input = await solidPng(800, 600, [200, 200, 200, 255]);
    const output = await applyWatermark(input);
    const inputStrip = await sharp(input)
      .extract({ left: 600, top: 540, width: 200, height: 60 })
      .raw()
      .toBuffer();
    const outputStrip = await sharp(output)
      .extract({ left: 600, top: 540, width: 200, height: 60 })
      .raw()
      .toBuffer();
    expect(Buffer.compare(inputStrip, outputStrip)).not.toBe(0);
  });

  it('does not change pixels in the top-left region', async () => {
    const input = await solidPng(800, 600, [200, 200, 200, 255]);
    const output = await applyWatermark(input);
    const inputStrip = await sharp(input)
      .extract({ left: 0, top: 0, width: 200, height: 60 })
      .raw()
      .toBuffer();
    const outputStrip = await sharp(output)
      .extract({ left: 0, top: 0, width: 200, height: 60 })
      .raw()
      .toBuffer();
    expect(Buffer.compare(inputStrip, outputStrip)).toBe(0);
  });

  it('is a no-op when WATERMARK_DISABLED=true', async () => {
    process.env.WATERMARK_DISABLED = 'true';
    const input = await solidPng(400, 400, [100, 100, 100, 255]);
    const output = await applyWatermark(input);
    expect(Buffer.compare(input, output)).toBe(0);
  });

  it('handles small images without crashing', async () => {
    const input = await solidPng(200, 100, [255, 255, 255, 255]);
    const output = await applyWatermark(input);
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(100);
  });
});
