import { describe, it, expect, vi, beforeEach } from 'vitest';

const { isNativeMock, pickImagesMock, readFileMock } = vi.hoisted(() => ({
  isNativeMock: vi.fn(() => false),
  pickImagesMock: vi.fn(),
  readFileMock: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: isNativeMock },
}));
vi.mock('@capacitor/camera', () => ({
  Camera: { pickImages: pickImagesMock },
}));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { readFile: readFileMock },
}));

describe('pickPhoto', () => {
  beforeEach(() => {
    isNativeMock.mockReset().mockReturnValue(false);
    pickImagesMock.mockReset();
    readFileMock.mockReset();
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

  it('reads bytes via Filesystem when fetch fails on native (TestFlight gallery bug)', async () => {
    // Regression test for the TestFlight gallery-upload bug. With
    // `CapacitorHttp.enabled: true`, the global fetch() is patched to route
    // through the native HTTP bridge, which does not handle the capacitor://
    // scheme returned by PHPicker's webPath. The original code only tried
    // fetch(photo.webPath); when that failed, blob was undefined, and every
    // caller silently bailed at `if (!photo?.blob) return;` — the user saw
    // their tap do nothing. The fix reads the bytes from photo.path via
    // @capacitor/filesystem (no fetch involved). On web the path is absent,
    // so this branch is a no-op there.
    isNativeMock.mockReturnValue(true);
    pickImagesMock.mockResolvedValue({
      photos: [
        {
          webPath: 'capacitor://localhost/_capacitor_file_/var/mobile/Containers/Data/Application/abc/tmp/img.jpg',
          path: 'file:///var/mobile/Containers/Data/Application/abc/tmp/img.jpg',
          format: 'jpeg',
        },
      ],
    });
    readFileMock.mockResolvedValue({ data: 'eA==' }); // base64 of 'x'
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('TypeError: Load failed'));
    const { pickPhoto } = await import('./photoPicker');
    const result = await pickPhoto();
    expect(readFileMock).toHaveBeenCalledWith({
      path: 'file:///var/mobile/Containers/Data/Application/abc/tmp/img.jpg',
    });
    expect(result).not.toBeNull();
    expect(result?.blob).toBeDefined();
    expect(result?.blob?.size).toBeGreaterThan(0);
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
