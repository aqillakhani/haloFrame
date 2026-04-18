// Temporary stand-in for the real subscription state. The web app currently
// runs against the unauthenticated /api/spike harness; there is no session,
// no profiles table query, no credits ledger. This mock lets the Settings
// screen render and exercise its button wiring before the server-side
// entitlement refactor lands (see memory/project_pricing_strategy.md —
// deferred work item #1).
//
// When the real hook arrives, replace imports of MOCK_SUBSCRIPTION with
// `useSubscription()` and delete this file.

import { ACTION_CREDIT_COSTS, type SubscriptionPlanId } from '@eternalframe/shared';

export interface SubscriptionSnapshot {
  planId: SubscriptionPlanId;
  creditsRemaining: number;
  /** ISO date of next credit refresh. null when on Free (lifetime grant). */
  renewsOn: string | null;
}

export const MOCK_SUBSCRIPTION: SubscriptionSnapshot = {
  planId: 'free',
  creditsRemaining: 2,
  renewsOn: null,
};

export type CreditedAction = keyof typeof ACTION_CREDIT_COSTS;

/** Whether the current (mocked) balance covers the given action. */
export function canAfford(action: CreditedAction): boolean {
  return MOCK_SUBSCRIPTION.creditsRemaining >= ACTION_CREDIT_COSTS[action];
}
