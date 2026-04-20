import { motion } from 'framer-motion';
import {
  SUBSCRIPTION_PLANS_UI,
  type SubscriptionPlanId,
} from '@haloframe/shared';
import { useNavigation } from '../lib/navigation';
import { COPY } from '../lib/copy';
import { useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../hooks/useAuth';
import { heroText, cardReveal } from '../lib/motion';

function providerLabel(providers: string[] | undefined): string {
  if (!providers || providers.length === 0) return 'Email';
  const first = providers[0] ?? 'email';
  if (first === 'email') return 'Email';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function planDisplayName(planId: SubscriptionPlanId): string {
  // SUBSCRIPTION_PLANS_UI collapses heritage_monthly + heritage_annual under
  // the same "Heritage" name. On Settings we differentiate so the user sees
  // what they're actually paying for.
  if (planId === 'heritage_annual') return 'Heritage Annual';
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

function noteCopyFor(planId: SubscriptionPlanId): string {
  if (planId === 'heritage_annual') return COPY.subscription.settingsNote.heritageAnnual;
  if (planId === 'heritage_monthly') return COPY.subscription.settingsNote.heritage;
  if (planId === 'keepsake_monthly') return COPY.subscription.settingsNote.keepsake;
  return COPY.subscription.settingsNote.free;
}

function formatRenewalDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(d);
}

export function SettingsScreen() {
  const { push, reset } = useNavigation();
  const { snapshot } = useSubscription();
  const { session, isAnonymous, signOut } = useAuth();
  const planId: SubscriptionPlanId = snapshot?.planId ?? 'free';
  const creditsRemaining = snapshot?.creditsRemaining ?? 0;
  const renewsOn = formatRenewalDate(snapshot?.renewsOn ?? null);
  const isPaid = planId !== 'free';
  const email = session?.user?.email ?? null;
  // Supabase embeds providers under `app_metadata.providers`. Fall back to
  // `identities[].provider` if the property is absent.
  const appMeta = (session?.user?.app_metadata ?? {}) as {
    providers?: string[];
    provider?: string;
  };
  const providers = appMeta.providers ?? (appMeta.provider ? [appMeta.provider] : []);

  async function handleSignOut() {
    await signOut();
    reset();
  }

  // Restore-purchase wiring lands with the backend entitlement refactor
  // (see memory/project_pricing_strategy.md). For now this is a no-op.
  function handleRestore() {
    // intentionally empty until RevenueCat client wiring is in place
  }

  const eyebrowText = isPaid && renewsOn
    ? COPY.subscription.settingsRenewsOn(renewsOn)
    : COPY.subscription.settingsMembershipEyebrow;

  return (
    <div className="settings">
      <motion.div
        className="settings-nav"
        variants={heroText}
        initial="initial"
        animate="animate"
      >
        <span className="settings-nav-title">{COPY.subscription.settingsNavLabel}</span>
      </motion.div>

      <motion.section
        className="settings-plan-hero"
        aria-labelledby="settings-plan-heading"
        variants={heroText}
        initial="initial"
        animate="animate"
      >
        <span
          className="settings-eyebrow"
          data-live={isPaid ? 'true' : 'false'}
        >
          <span className="settings-eyebrow-dot" aria-hidden />
          <span>{eyebrowText}</span>
        </span>

        <h1 className="settings-plan-line" id="settings-plan-heading">
          <span className="settings-plan-prefix">
            {COPY.subscription.settingsPlanPrefix}
          </span>
          <span className="settings-plan-name-word">
            {planDisplayName(planId)}.
          </span>
        </h1>

        <p className="settings-credit-line">
          {creditsLineFor(planId, creditsRemaining)}
        </p>

        <span className="settings-tributes-badge" aria-hidden>
          <span className="settings-tributes-dot" />
          <span className="settings-tributes-count">{creditsRemaining}</span>
          <span className="settings-tributes-label">
            {COPY.subscription.settingsTributesLabel}
          </span>
        </span>
      </motion.section>

      <motion.aside
        className="settings-note"
        aria-label="About your membership"
        variants={cardReveal}
        initial="initial"
        animate="animate"
        custom={0}
      >
        <span className="settings-eyebrow">
          <span>{COPY.subscription.settingsNoteEyebrow}</span>
        </span>
        <p>{noteCopyFor(planId)}</p>
      </motion.aside>

      <div className="settings-actions" role="group" aria-label="Membership actions">
        <motion.button
          type="button"
          className="btn btn-primary"
          onClick={() => push('PAYWALL')}
          variants={cardReveal}
          initial="initial"
          animate="animate"
          custom={1}
        >
          {extendCtaFor(planId)}
        </motion.button>
        <motion.button
          type="button"
          className="btn btn-ghost"
          onClick={handleRestore}
          aria-live="polite"
          variants={cardReveal}
          initial="initial"
          animate="animate"
          custom={2}
        >
          {COPY.subscription.restoreCta}
        </motion.button>
      </div>

      <motion.section
        className="settings-account"
        aria-labelledby="settings-account-heading"
        variants={cardReveal}
        initial="initial"
        animate="animate"
        custom={3}
      >
        <span className="settings-eyebrow" id="settings-account-heading">
          <span>{COPY.auth.settings.accountEyebrow}</span>
        </span>
        {isAnonymous || !email ? (
          <>
            <p className="settings-account-line">{COPY.auth.settings.anon}</p>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => push('SIGN_IN')}
            >
              {COPY.auth.settings.anonCta}
            </button>
          </>
        ) : (
          <>
            <p className="settings-account-line">
              <span className="settings-account-label">
                {COPY.auth.settings.emailLabel}
              </span>
              <span className="settings-account-value">{email}</span>
            </p>
            {providers.length > 0 && (
              <p className="settings-account-line">
                <span className="settings-account-label">
                  {COPY.auth.settings.providerLabel}
                </span>
                <span className="settings-account-value">
                  {providerLabel(providers)}
                </span>
              </p>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleSignOut}
            >
              {COPY.auth.settings.signOut}
            </button>
          </>
        )}
      </motion.section>

      <motion.p
        className="settings-fine-print"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.32 }}
      >
        {COPY.subscription.fineprint.left}
        <span className="settings-fine-print-sep" aria-hidden>
          {COPY.subscription.fineprint.separator}
        </span>
        {COPY.subscription.fineprint.right}
      </motion.p>
    </div>
  );
}
