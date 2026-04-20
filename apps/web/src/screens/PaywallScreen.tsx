import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  SUBSCRIPTION_PLANS_UI,
  type SubscriptionPlanId,
  type SubscriptionPlanUI,
} from '@haloframe/shared';
import { useNavigation } from '../lib/navigation';
import { COPY } from '../lib/copy';
import { heroText, cardReveal } from '../lib/motion';
import { useSubscription } from '../hooks/useSubscription';
import { startPurchase, ApiRequestError } from '../lib/api';

// Free is intentionally omitted from the paywall: the user is already on
// Free and has run out, so the "You've used your 2 tributes" subhead does
// the work a disabled "Your current plan" card would do — gentler, less
// cluttered.
const SUBSCRIPTION_IDS: SubscriptionPlanId[] = [
  'keepsake_monthly',
  'heritage_monthly',
  'heritage_annual',
];

const TOPUP_IDS: SubscriptionPlanId[] = ['topup_4pack', 'topup_single'];

function planById(id: SubscriptionPlanId): SubscriptionPlanUI | undefined {
  return SUBSCRIPTION_PLANS_UI.find((p) => p.id === id);
}

/** Composite credits line used on a plan card. Annual plans show the
 * "N per month · M per year" form so the yearly total is legible; others
 * fall back to the simple per-cycle copy. */
function creditsLineFor(plan: SubscriptionPlanUI): string {
  if (plan.cadence === 'annual') {
    const annual = plan.credits * 12;
    return `${plan.credits} tributes a month \u00b7 ${annual} a year`;
  }
  return COPY.subscription.creditsPerCycle(plan.credits, plan.period);
}

/** Rollover line below the credits line. Absent = don't render. */
function rolloverLineFor(plan: SubscriptionPlanUI): string | null {
  if (plan.cadence === 'one-time' || plan.cadence === 'lifetime') return null;
  return plan.rolloverMonths > 0
    ? COPY.subscription.rollover2Months
    : COPY.subscription.rolloverNone;
}

export function PaywallScreen() {
  const { pop } = useNavigation();
  const [selected, setSelected] = useState<SubscriptionPlanId | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const prefersReduced = useReducedMotion() ?? false;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { snapshot, refetch: refetchSubscription } = useSubscription();

  // Web checkout is currently stubbed server-side (returns 501 with a
  // structured payload). Handle both the stubbed path and the eventual
  // redirect-to-Stripe path here so the screen is future-proof.
  async function handlePurchase() {
    if (!selected) return;
    if (selected === 'free') {
      pop();
      return;
    }
    setPurchaseError(null);
    try {
      const result = await startPurchase({
        planId: selected,
        successUrl: window.location.origin,
        cancelUrl: window.location.origin,
      });
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      await refetchSubscription();
      pop();
    } catch (err) {
      if (
        err instanceof ApiRequestError &&
        (err.details as { code?: string })?.code === 'web_checkout_not_configured'
      ) {
        setPurchaseError(
          'Web checkout is coming soon. Use the iOS or Android app to subscribe.',
        );
      } else {
        const message = err instanceof Error ? err.message : 'Purchase failed';
        setPurchaseError(message);
      }
    }
  }

  // Initial focus on the heading announces the dialog to screen readers.
  // Heading carries tabindex="-1" so it's programmatically focusable but
  // not in the normal Tab order — first Tab lands on the Close button.
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

  const selectedPlan = selected ? planById(selected) : null;
  const ctaLabel = selectedPlan
    ? (COPY.subscription.planCta[selectedPlan.id] ?? COPY.subscription.continueCta)
    : COPY.subscription.paywallNoSelectionCta;

  // Credits used for the subhead. Paywall only opens when the balance hit
  // zero, so plan.credits == credits used (they've spent everything the
  // plan granted).
  const creditsUsed = snapshot
    ? (planById(snapshot.planId)?.credits ?? 0)
    : 0;

  return (
    <div
      className="paywall"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-heading"
    >
      <div className="paywall-scroll">
        <header className="paywall-header">
          <button
            type="button"
            className="paywall-close"
            onClick={pop}
            aria-label={COPY.subscription.paywallCloseAria}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none">
              <path
                d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <motion.section
          className="paywall-hero"
          variants={heroText}
          initial="initial"
          animate="animate"
        >
          <HaloOrnament />
          <span className="paywall-eyebrow">
            {COPY.subscription.paywallEyebrow}
          </span>
          <h1
            id="paywall-heading"
            className="paywall-heading"
            ref={headingRef}
            tabIndex={-1}
          >
            {COPY.subscription.paywallHeadingBefore}
            <em>{COPY.subscription.paywallHeadingItalic}</em>
            {COPY.subscription.paywallHeadingAfter}
          </h1>
          <p className="paywall-subhead">
            {COPY.subscription.paywallSubheadPlural(creditsUsed)}
          </p>
        </motion.section>

        {/* Announces plan selection to screen readers. Polite so it queues
            rather than interrupts. Visually hidden. */}
        <div className="sr-only" role="status" aria-live="polite">
          {selectedPlan
            ? `${selectedPlan.name} selected, ${selectedPlan.displayPrice}${selectedPlan.period}`
            : ''}
        </div>

        <section
          className="paywall-plans"
          role="radiogroup"
          aria-label="Membership plans"
        >
          {subscriptions.map((plan, i) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              index={i}
              selected={selected === plan.id}
              onSelect={() => setSelected(plan.id)}
              reduced={prefersReduced}
            />
          ))}
        </section>

        <div className="paywall-cta-block">
          <motion.button
            type="button"
            className="paywall-cta"
            onClick={handlePurchase}
            disabled={!selectedPlan}
            variants={cardReveal}
            initial="initial"
            animate="animate"
            custom={3}
          >
            {ctaLabel}
          </motion.button>
          {purchaseError && (
            <div className="paywall-error" role="alert" aria-live="assertive">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <path d="M8 4.5v4.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="8" cy="11" r="0.9" fill="currentColor" />
              </svg>
              <span>{purchaseError}</span>
            </div>
          )}
        </div>

        <section className="paywall-topups" aria-label="One-time purchases">
          <hr className="paywall-divider" aria-hidden />
          <div className="paywall-topups-heading">
            <h2>{COPY.subscription.topupHeading}</h2>
            <p>{COPY.subscription.topupSubtitle}</p>
          </div>
          <div className="paywall-topups-grid">
            {topups.map((t, i) => (
              <TopupChip key={t.id} plan={t} index={i} />
            ))}
          </div>
        </section>

        <motion.footer
          className="paywall-footer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: prefersReduced ? 0 : 1.0, duration: 0.32 }}
        >
          <span>{COPY.subscription.paywallFooterLine1}</span>
          <span>{COPY.subscription.paywallFooterLine2}</span>
        </motion.footer>
      </div>
    </div>
  );
}

interface PlanCardProps {
  plan: SubscriptionPlanUI;
  index: number;
  selected: boolean;
  onSelect: () => void;
  reduced: boolean;
}

function PlanCard({ plan, index, selected, onSelect }: PlanCardProps) {
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  }
  return (
    <motion.div
      className={selected ? 'paywall-plan paywall-plan--selected' : 'paywall-plan'}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      variants={cardReveal}
      initial="initial"
      animate="animate"
      custom={index}
    >
      {plan.tag && (
        <div className="paywall-plan-kicker">
          <span className="paywall-plan-kicker-dot" aria-hidden />
          <span>{plan.tag}</span>
        </div>
      )}
      <div className="paywall-plan-head">
        <h3 className="paywall-plan-name">{plan.name}</h3>
        <div className="paywall-plan-price">
          <span className="paywall-plan-price-value">{plan.displayPrice}</span>
          {plan.period && (
            <span className="paywall-plan-price-period">{plan.period}</span>
          )}
        </div>
      </div>
      {plan.subtitle && (
        <p className="paywall-plan-subtitle">{plan.subtitle}</p>
      )}
      <hr className="paywall-plan-hairline" aria-hidden />
      <div className="paywall-plan-credits">{creditsLineFor(plan)}</div>
      {rolloverLineFor(plan) && (
        <span className="paywall-plan-rollover">{rolloverLineFor(plan)}</span>
      )}
      {selected && <div className="paywall-plan-glow" aria-hidden />}
    </motion.div>
  );
}

interface TopupChipProps {
  plan: SubscriptionPlanUI;
  index: number;
}

function TopupChip({ plan, index }: TopupChipProps) {
  const creditsLabel = plan.credits === 1 ? '1 tribute' : `${plan.credits} tributes`;
  return (
    <motion.button
      type="button"
      className="paywall-topup"
      variants={cardReveal}
      initial="initial"
      animate="animate"
      custom={4 + index}
    >
      <div className="paywall-topup-head">
        <span className="paywall-topup-name">{plan.name}</span>
        <span className="paywall-topup-price">{plan.displayPrice}</span>
      </div>
      <div className="paywall-topup-credits">{creditsLabel}</div>
      {plan.subtitle && (
        <span className="paywall-topup-note">{plan.subtitle}</span>
      )}
    </motion.button>
  );
}

function HaloOrnament() {
  // Decorative ring + beam above the heading. Only visible on desktop via
  // CSS — on mobile the calmer single-column layout doesn't need it.
  return (
    <svg
      className="paywall-halo-ornament"
      aria-hidden
      width="64"
      height="20"
      viewBox="0 0 64 20"
    >
      <defs>
        <linearGradient id="paywall-halo-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--c-gold-soft)" stopOpacity="0" />
          <stop offset="0.5" stopColor="var(--c-gold-base)" />
          <stop offset="1" stopColor="var(--c-gold-soft)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1="10" x2="64" y2="10" stroke="url(#paywall-halo-gradient)" strokeWidth="0.8" />
      <circle cx="32" cy="10" r="2.2" fill="var(--c-gold-base)" />
      <circle cx="32" cy="10" r="5" fill="none" stroke="var(--c-gold-base)" strokeOpacity="0.35" strokeWidth="0.6" />
    </svg>
  );
}
