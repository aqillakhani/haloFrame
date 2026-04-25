import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Hoist supabase mock so the consent.ts -> supabase.ts chain doesn't crash.
const { mockUpdate, mockGetUser } = vi.hoisted(() => {
  const mockUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });
  const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });
  return { mockUpdate, mockGetUser };
});
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: mockGetUser },
    from: () => ({ update: mockUpdate }),
  },
}));

import { useConsent } from './useConsent';
import { CONSENT_LOCAL_KEY } from '../lib/consent';

describe('useConsent', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUpdate.mockClear();
    mockGetUser.mockClear();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('returns hasConsented=false initially', () => {
    const { result } = renderHook(() => useConsent());
    expect(result.current.hasConsented).toBe(false);
  });

  it('returns true after grant()', async () => {
    const { result } = renderHook(() => useConsent());
    await act(async () => {
      await result.current.grant();
    });
    expect(result.current.hasConsented).toBe(true);
    expect(localStorage.getItem(CONSENT_LOCAL_KEY)).toBeTruthy();
  });

  it('reads consent on mount when localStorage already has it', async () => {
    localStorage.setItem(CONSENT_LOCAL_KEY, new Date().toISOString());
    const { result } = renderHook(() => useConsent());
    expect(result.current.hasConsented).toBe(true);
  });
});
