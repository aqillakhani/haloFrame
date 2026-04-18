import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  SUBSCRIPTION_PLANS_UI,
  type SubscriptionPlanId,
  type SubscriptionPlanUI,
} from '@eternalframe/shared';
import { useNavigation } from '../lib/navigation';
import { COPY } from '../lib/copy';
import { Icon } from '../components/icons/Icon';
import { heroText, cardReveal } from '../lib/motion';
import { easing } from '../lib/tokens';
import { MOCK_SUBSCRIPTION } from '../lib/mockSubscription';

// Free is intentionally omitted from the paywall: the user is already on Free
// and has run out, so the "You've used your 2 tributes" subhead does the work
// a disabled "Your current plan" card would do — gentler, less cluttered.
const SUBSCRIPTION_IDS: SubscriptionPlanId[] = [
  'keepsake_monthly',
  'heritage_monthly',
  'heritage_annual',
];

const TOPUP_IDS: SubscriptionPlanId[] = ['topup_4pack', 'topup_single'];

const gentleEase = [...easing.gentle] as [number, number, number, number];

function planById(id: SubscriptionPlanId): SubscriptionPlanUI | undefined {
  return SUBSCRIPTION_PLANS_UI.find((p) => p.id === id);
}

export function PaywallScreen() {
  const { pop } = useNavigation();
  const [selected, setSelected] = useState<SubscriptionPlanId | null>(null);
  const prefersReduced = useReducedMotion() ?? false;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Purchase wiring is deferred (see memory/project_pricing_strategy.md —
  // backend entitlement refactor is a separate session). For now, confirming
  // simply closes the paywall.
  function handlePurchase() {
    if (!selected) return;
    pop();
  }

  // Initial focus on the heading announces the dialog to screen readers
  // ("heading, Continue honoring them"). Heading carries tabindex="-1" so
  // it's programmatically focusable but not in the normal Tab order — first
  // Tab lands on the Close button.
  //
  // On close: AnimatePresence mode="wait" (in App.tsx) unmounts the trigger
  // screen before the paywall mounts, so capturing the opener element on
  // mount is always stale by then. Instead, after the paywall exits and
  // React has re-mounted the returning screen, focus the first interactive
  // element of <main>. Imperfect (doesn't restore the exact trigger) but
  // reliably beats leaving focus on <body>.
  useEffect(() => {
    headingRef.current?.focus();
    return () => {
      setTimeout(() => {
        if (document.querySelector('[role="dialog"]')) return;
        const first = document.querySelector<HTMLElement>(
          'main button:not(:disabled), main a[href]',
        );
        first?.focus();
      }, 60);
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') pop();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pop]);

  const subscriptions = SUBSCRIPTION_IDS.map(planById).filter(
    (p): p is SubscriptionPlanUI => Boolean(p),
  );
  const topups = TOPUP_IDS.map(planById).filter(
    (p): p is SubscriptionPlanUI => Boolean(p),
  );

  return (
    <div
      className="paywall"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-heading"
    >
      <button
        type="button"
        className="paywall-close btn-icon"
        onClick={pop}
        aria-label={COPY.subscription.paywallCloseAria}
      >
        <Icon name="close" size={20} />
      </button>

      <div className="paywall-scroll">
        <motion.header
          className="paywall-hero"
          variants={heroText}
          initial="initial"
          animate="animate"
        >
          <h1
            id="paywall-heading"
            className="t-display-lg"
            ref={headingRef}
            tabIndex={-1}
          >
            {COPY.subscription.paywallHeading}
          </h1>
          {MOCK_SUBSCRIPTION.creditsRemaining === 0 && (
            <p className="t-body-md t-muted paywall-subhead">
              {COPY.subscription.paywallSubheadPlural(
                planById(MOCK_SUBSCRIPTION.planId)?.credits ?? 0,
              )}
            </p>
          )}
        </motion.header>

        {/* Announces plan selection + available action to screen readers.
            Polite so it queues rather than interrupts whatever was being
            read. Visually hidden — the rose arrival provides the visual
            equivalent. */}
        <div className="sr-only" role="status" aria-live="polite">
          {selected
            ? `${planById(selected)?.name ?? ''} selected. ${
                COPY.subscription.planCta[selected] ?? ''
              }`
            : ''}
        </div>

        <section className="paywall-plans" aria-label="Subscription plans">
          {subscriptions.map((plan, i) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              index={i}
              selected={selected === plan.id}
              onSelect={() => setSelected(plan.id)}
              onConfirm={handlePurchase}
              reduced={prefersReduced}
            />
          ))}
        </section>

        <hr className="paywall-divider" aria-hidden />

        <section
          className="paywall-plans paywall-plans--topup"
          aria-label="One-time purchases"
        >
          <motion.h2
            className="t-label-sm t-muted paywall-topup-heading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: prefersReduced ? 0 : 0.9, duration: 0.32 }}
          >
            One tribute at a time
          </motion.h2>
          {topups.map((plan, i) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              index={subscriptions.length + i}
              topup
              selected={selected === plan.id}
              onSelect={() => setSelected(plan.id)}
              onConfirm={handlePurchase}
              reduced={prefersReduced}
            />
          ))}
        </section>

        <motion.footer
          className="paywall-footer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: prefersReduced ? 0 : 1.2, duration: 0.32 }}
        >
          <p className="t-label-sm t-faint">{COPY.subscription.paywallFooterLine1}</p>
          <p className="t-label-sm t-faint">{COPY.subscription.paywallFooterLine2}</p>
        </motion.footer>
      </div>
    </div>
  );
}

interface PlanCardProps {
  plan: SubscriptionPlanUI;
  index: number;
  topup?: boolean;
  selected: boolean;
  onSelect: () => void;
  onConfirm: () => void;
  reduced: boolean;
}

function PlanCard({
  plan,
  index,
  topup,
  selected,
  onSelect,
  onConfirm,
  reduced,
}: PlanCardProps) {
  const ctaLabel = COPY.subscription.planCta[plan.id] ?? COPY.subscription.continueCta;
  const isSubscription = plan.cadence === 'monthly' || plan.cadence === 'annual';
  const classes = [
    'paywall-card',
    topup ? 'paywall-card--topup' : '',
    selected ? 'paywall-card--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <motion.div
      className={classes}
      variants={cardReveal}
      initial="initial"
      animate="animate"
      custom={index}
    >
      <button
        type="button"
        className="paywall-card-button"
        onClick={onSelect}
        aria-pressed={selected}
      >
        <div className="paywall-card-head">
          <div className="paywall-card-name">
            <h3 className="t-display-md">{plan.name}</h3>
            {plan.tag && (
              <span className="paywall-card-tag t-label-sm">{plan.tag}</span>
            )}
          </div>
          <div className="paywall-card-price">
            <span className="t-display-md">{plan.displayPrice}</span>
            {plan.period && <span className="t-body-sm t-muted">{plan.period}</span>}
          </div>
        </div>
        {plan.subtitle && (
          <p className="t-body-sm t-muted paywall-card-subtitle">{plan.subtitle}</p>
        )}
        {isSubscription && (
          <p className="t-body-sm paywall-card-credits">
            {COPY.subscription.creditsPerCycle(plan.credits, plan.period)}
            {plan.rolloverMonths > 0 && (
              <span className="t-muted"> · {plan.rolloverMonths}mo rollover</span>
            )}
          </p>
        )}
      </button>

      {selected && (
        <motion.div
          layoutId="paywall-arrival"
          className="paywall-arrival"
          transition={{ duration: reduced ? 0.12 : 0.4, ease: gentleEase }}
        >
          <motion.hr
            className="paywall-rose-hairline"
            aria-hidden
            initial={reduced ? { opacity: 0 } : { scaleX: 0, opacity: 1 }}
            animate={reduced ? { opacity: 1 } : { scaleX: 1, opacity: 1 }}
            transition={{
              duration: reduced ? 0.12 : 0.56,
              ease: gentleEase,
              delay: reduced ? 0 : 0.12,
            }}
          />
          <motion.button
            type="button"
            className="btn btn-primary paywall-cta"
            onClick={onConfirm}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{
              duration: reduced ? 0.12 : 0.32,
              ease: gentleEase,
              delay: reduced ? 0 : 0.36,
            }}
          >
            {ctaLabel}
          </motion.button>
        </motion.div>
      )}
    </motion.div>
  );
}
