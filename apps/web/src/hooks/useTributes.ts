// =============================================================================
// HaloFrame web — useTributes hook
//
// Thin React-Query-less cache for the signed-in user's tribute list. Fetches
// on mount + whenever the auth user changes; exposes a manual `refetch` + an
// optimistic `remove(id)` helper so the delete button doesn't wait for the
// round-trip before the UI updates.
//
// Anon users / tribute-bridge disabled → returns `[]` without a network call
// (see `isTributeBridgeEnabled` in lib/api.ts).
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Tribute } from '@haloframe/shared';
import {
  deleteTribute as deleteTributeApi,
  isTributeBridgeEnabled,
  listTributes,
} from '../lib/api';
import { useAuth } from './useAuth';

export interface UseTributesResult {
  tributes: Tribute[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  remove: (id: string) => Promise<boolean>;
}

export function useTributes(): UseTributesResult {
  const { userId, isAnonymous, isReady } = useAuth();
  const [tributes, setTributes] = useState<Tribute[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetch = useCallback(async () => {
    // Skip while auth is bootstrapping or when we know there's nothing to
    // list (anon users + bridge disabled both short-circuit to empty).
    if (!isReady) return;
    if (!isTributeBridgeEnabled() || isAnonymous || !userId) {
      setTributes([]);
      setError(null);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const list = await listTributes(controller.signal);
      if (controller.signal.aborted) return;
      setTributes(list);
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('[useTributes]', err);
      setError(err instanceof Error ? err.message : 'Failed to load tributes');
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [isReady, isAnonymous, userId]);

  useEffect(() => {
    void fetch();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetch]);

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      // Optimistic: drop it from the list immediately so the grid re-flows
      // without a spinner beat. Roll back if the delete fails.
      const snapshot = tributes;
      setTributes((prev) => prev.filter((t) => t.id !== id));
      try {
        const ok = await deleteTributeApi(id);
        if (!ok) setTributes(snapshot);
        return ok;
      } catch (err) {
        console.error('[useTributes:remove]', err);
        setTributes(snapshot);
        return false;
      }
    },
    [tributes],
  );

  return useMemo(
    () => ({
      tributes,
      isLoading,
      error,
      refetch: fetch,
      remove,
    }),
    [tributes, isLoading, error, fetch, remove],
  );
}
