import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoist mocks alongside vi.mock (which itself is hoisted above all imports).
// Without this, the createClient() call at the top of ./supabase blows up
// the test loader when VITE_SUPABASE_* env vars aren't set.
const { mockUpdate, mockGetUser } = vi.hoisted(() => {
  const mockUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });
  const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } });
  return { mockUpdate, mockGetUser };
});

vi.mock('./supabase', () => ({
  supabase: {
    auth: { getUser: mockGetUser },
    from: () => ({ update: mockUpdate }),
  },
}));

import { hasConsented, recordConsent, CONSENT_LOCAL_KEY } from './consent';

describe('consent', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUpdate.mockClear();
    mockGetUser.mockClear();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  describe('hasConsented', () => {
    it('returns false when no consent recorded', () => {
      expect(hasConsented()).toBe(false);
    });

    it('returns true when consent timestamp is in localStorage', () => {
      localStorage.setItem(CONSENT_LOCAL_KEY, new Date().toISOString());
      expect(hasConsented()).toBe(true);
    });

    it('returns false when localStorage value is invalid', () => {
      localStorage.setItem(CONSENT_LOCAL_KEY, 'not-a-date');
      expect(hasConsented()).toBe(false);
    });
  });

  describe('recordConsent', () => {
    it('writes ISO timestamp to localStorage', async () => {
      await recordConsent({ syncToServer: false });
      const stored = localStorage.getItem(CONSENT_LOCAL_KEY);
      expect(stored).toBeTruthy();
      expect(() => new Date(stored!).toISOString()).not.toThrow();
    });

    it('calls supabase update when syncToServer=true', async () => {
      await recordConsent({ syncToServer: true });
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ ai_consent_at: expect.any(String) }),
      );
    });

    it('skips supabase update when no auth user', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null } });
      await recordConsent({ syncToServer: true });
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(localStorage.getItem(CONSENT_LOCAL_KEY)).toBeTruthy();
    });
  });
});
