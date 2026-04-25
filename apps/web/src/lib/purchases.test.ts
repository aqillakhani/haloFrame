import { describe, it, expect, vi, beforeEach } from 'vitest';

const { isNativeMock, getPlatformMock, purchasesMock } = vi.hoisted(() => ({
  isNativeMock: vi.fn(() => false),
  getPlatformMock: vi.fn(() => 'web'),
  purchasesMock: {
    configure: vi.fn(),
    setLogLevel: vi.fn(),
    getOfferings: vi.fn(),
    purchasePackage: vi.fn(),
    restorePurchases: vi.fn(),
    getCustomerInfo: vi.fn(),
    logIn: vi.fn(),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: isNativeMock,
    getPlatform: getPlatformMock,
  },
}));

vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: purchasesMock,
  LOG_LEVEL: { WARN: 'WARN', ERROR: 'ERROR' },
}));

describe('purchases (web no-op mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isNativeMock.mockReturnValue(false);
    getPlatformMock.mockReturnValue('web');
    vi.resetModules();
  });

  it('initRC is a no-op on web', async () => {
    const { initRC } = await import('./purchases');
    await initRC({ apiKey: 'web_key' });
    expect(purchasesMock.configure).not.toHaveBeenCalled();
  });

  it('getOfferings returns null on web', async () => {
    const { getOfferings } = await import('./purchases');
    const result = await getOfferings();
    expect(result).toBeNull();
  });

  it('getCustomerInfo returns null on web', async () => {
    const { getCustomerInfo } = await import('./purchases');
    const result = await getCustomerInfo();
    expect(result).toBeNull();
  });

  it('purchasePackage throws on web', async () => {
    const { purchasePackage } = await import('./purchases');
    await expect(purchasePackage({} as never)).rejects.toThrow(/native/);
  });

  it('restorePurchases throws on web', async () => {
    const { restorePurchases } = await import('./purchases');
    await expect(restorePurchases()).rejects.toThrow(/native/);
  });
});

describe('purchases (native mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isNativeMock.mockReturnValue(true);
    getPlatformMock.mockReturnValue('ios');
    vi.resetModules();
  });

  it('initRC configures the SDK', async () => {
    const { initRC } = await import('./purchases');
    await initRC({ apiKey: 'ios_key' });
    expect(purchasesMock.configure).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'ios_key' }),
    );
  });

  it('getOfferings returns mocked offerings', async () => {
    purchasesMock.getOfferings.mockResolvedValue({
      offerings: { current: { identifier: 'default' } },
    });
    const { getOfferings } = await import('./purchases');
    const result = await getOfferings();
    expect(result?.current?.identifier).toBe('default');
  });

  it('initRC is idempotent — second call does not re-configure', async () => {
    const { initRC } = await import('./purchases');
    await initRC({ apiKey: 'ios_key' });
    await initRC({ apiKey: 'ios_key' });
    expect(purchasesMock.configure).toHaveBeenCalledTimes(1);
  });
});
