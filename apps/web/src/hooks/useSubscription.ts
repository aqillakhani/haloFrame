// =============================================================================
// HaloFrame web — useSubscription hook
//
// Replaces the pre-Phase-3 MOCK_SUBSCRIPTION with a live fetch from
// /api/subscription/status. The snapshot re-fetches on demand after any
// credit-changing action (save, purchase) so the "tributes remaining" UI
// stays in sync without a hard refresh.
// =============================================================================
import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  ACTION_CREDIT_COSTS,
  type SubscriptionSnapshot,
} from '@haloframe/shared';
import { fetchSubscriptionStatus } from '../lib/api';
import { getCustomerInfo } from '../lib/purchases';
import { useAuth } from './useAuth';

export type CreditedAction = keyof typeof ACTION_CREDIT_COSTS;

export interface UseSubscriptionResult {
  snapshot: SubscriptionSnapshot | null;
  isLoading: boolean;
  error: string | null;
  /** Refetch after a credit-changing action so the UI reflects reality. */
  refetch: () => Promise<void>;
  /**
   * Cheap client-side gate. Server re-checks on every save so this is
   * advisory — the paywall still opens on a 402 round-trip when the
   * optimistic check passed but the actual balance had changed.
   */
  canAfford: (action: CreditedAction) => boolean;
}

export function useSubscription(): UseSubscriptionResult {
  const { userId, isReady } = useAuth();
  const [snapshot, setSnapshot] = useState<SubscriptionSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!userId) {
      setSnapshot(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const next = await fetchSubscriptionStatus();
      setSnapshot(next);

      // On native, sanity-check against RC. The backend remains source of
      // truth for credit balance — RC's webhook hits /api/subscription/webhook
      // and the next refetch picks it up. We just log a discrepancy so the
      // edge case (purchase flowed through Apple but webhook is delayed) is
      // visible in dev logs without overriding the snapshot.
      if (Capacitor.isNativePlatform()) {
        try {
          const info = await getCustomerInfo();
          const rcActive = !!info?.entitlements?.active?.['tributes'];
          if (rcActive && next.planId === 'free') {
            console.warn(
              '[useSubscription] RC reports active entitlement but backend says free; webhook may be delayed',
            );
          }
        } catch (rcErr) {
          // RC not yet initialized or offline — non-fatal, backend is canonical.
          console.warn('[useSubscription] RC customerInfo fetch failed', rcErr);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load subscription';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!isReady) return;
    void refetch();
  }, [isReady, refetch]);

  const canAfford = useCallback(
    (action: CreditedAction): boolean => {
      if (!snapshot) return false;
      return snapshot.creditsRemaining >= ACTION_CREDIT_COSTS[action];
    },
    [snapshot],
  );

  return { snapshot, isLoading, error, refetch, canAfford };
}
