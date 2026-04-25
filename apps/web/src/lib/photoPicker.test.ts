import { describe, it, expect, vi, beforeEach } from 'vitest';

const { isNativeMock, pickImagesMock } = vi.hoisted(() => ({
  isNativeMock: vi.fn(() => false),
  pickImagesMock: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: isNativeMock },
}));
vi.mock('@capacitor/camera', () => ({
  Camera: { pickImages: pickImagesMock },
}));

describe('pickPhoto', () => {
  beforeEach(() => {
    isNativeMock.mockReset().mockReturnValue(false);
    pickImagesMock.mockReset();
    vi.resetModules();
    // Stub fetch globally so the native branch can resolve photo.webPath -> blob.
    globalThis.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['x'], { type: 'image/jpeg' })),
    } as unknown as Response);
  });

  it('uses Capacitor Camera on native', async () => {
    isNativeMock.mockReturnValue(true);
    pickImagesMock.mockResolvedValue({
      photos: [
        { webPath: 'capacitor://localhost/blob/1234.jpg', format: 'jpeg' },
      ],
    });
    const { pickPhoto } = await import('./photoPicker');
    const result = await pickPhoto();
    expect(pickImagesMock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 1 }),
    );
    expect(result?.url).toBe('capacitor://localhost/blob/1234.jpg');
    expect(result?.format).toBe('jpeg');
    expect(result?.blob).toBeDefined();
  });

  it('returns null on native when user cancels', async () => {
    isNativeMock.mockReturnValue(true);
    pickImagesMock.mockResolvedValue({ photos: [] });
    const { pickPhoto } = await import('./photoPicker');
    const result = await pickPhoto();
    expect(result).toBeNull();
  });

  it('does not call native picker on web', async () => {
    const { pickPhoto } = await import('./photoPicker');
    // Kick off the web picker — it will create + click an <input>. We never
    // resolve it (jsdom doesn't open a real file dialog) but the assertion
    // we care about is that the native API was not invoked.
    void pickPhoto();
    // Microtask flush so any synchronous setup completes
    await Promise.resolve();
    expect(pickImagesMock).not.toHaveBeenCalled();
  });

  it('creates an <input type=file> on web', async () => {
    const createElementSpy = vi.spyOn(document, 'createElement');
    const { pickPhoto } = await import('./photoPicker');
    void pickPhoto();
    await Promise.resolve();
    const inputCall = createElementSpy.mock.calls.find(([tag]) => tag === 'input');
    expect(inputCall).toBeDefined();
    createElementSpy.mockRestore();
  });
});
