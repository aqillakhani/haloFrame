import { motion } from 'framer-motion';
import {
  SUBSCRIPTION_PLANS_UI,
  type SubscriptionPlanId,
} from '@eternalframe/shared';
import { useNavigation } from '../lib/navigation';
import { COPY } from '../lib/copy';
import { MOCK_SUBSCRIPTION } from '../lib/mockSubscription';
import { heroText, cardReveal } from '../lib/motion';

function planName(planId: SubscriptionPlanId): string {
  const plan = SUBSCRIPTION_PLANS_UI.find((p) => p.id === planId);
  return plan?.name ?? 'Free';
}

function extendCtaFor(planId: SubscriptionPlanId): string {
  if (planId === 'free') return COPY.subscription.extendCtaFree;
  if (planId === 'keepsake_monthly') return COPY.subscription.extendCtaKeepsake;
  return COPY.subscription.extendCta;
}

function creditsLineFor(planId: SubscriptionPlanId, credits: number): string {
  return planId === 'free'
    ? COPY.subscription.creditsLifetime(credits)
    : COPY.subscription.creditsRemaining(credits);
}

export function SettingsScreen() {
  const { push } = useNavigation();
  const { planId, creditsRemaining } = MOCK_SUBSCRIPTION;

  // Restore-purchase wiring lands with the backend entitlement refactor
  // (see memory/project_pricing_strategy.md). For now this is a no-op.
  function handleRestore() {
    // intentionally empty until RevenueCat client wiring is in place
  }

  return (
    <div className="settings">
      <motion.header
        className="settings-hero"
        variants={heroText}
        initial="initial"
        animate="animate"
      >
        <h1 className="t-display-lg">{COPY.subscription.settingsHeading}</h1>
        <hr className="settings-hairline" aria-hidden />
      </motion.header>

      <motion.section
        className="settings-plan"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.28, duration: 0.4 }}
        aria-label="Current plan"
      >
        <p className="t-display-md settings-plan-name">
          {COPY.subscription.currentPlanOnLabel(planName(planId))}
        </p>
        <p className="t-body-md t-muted">
          {creditsLineFor(planId, creditsRemaining)}
        </p>
      </motion.section>

      <div className="settings-actions" role="group" aria-label="Membership actions">
        <motion.button
          type="button"
          className="btn btn-primary settings-action"
          onClick={() => push('PAYWALL')}
          variants={cardReveal}
          initial="initial"
          animate="animate"
          custom={0}
        >
          {extendCtaFor(planId)}
        </motion.button>
        <motion.button
          type="button"
          className="btn btn-ghost settings-action"
          onClick={handleRestore}
          variants={cardReveal}
          initial="initial"
          animate="animate"
          custom={1}
        >
          {COPY.subscription.restoreCta}
        </motion.button>
      </div>

      <motion.p
        className="t-label-sm t-faint settings-fineprint"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.32 }}
      >
        {COPY.subscription.fineprint}
      </motion.p>
    </div>
  );
}
