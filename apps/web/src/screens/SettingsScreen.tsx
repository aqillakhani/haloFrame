import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import {
  SUBSCRIPTION_PLANS_UI,
  type SubscriptionPlanId,
} from '@haloframe/shared';
import { useNavigation } from '../lib/navigation';
import { COPY } from '../lib/copy';
import { useSubscription } from '../hooks/useSubscription';
import { useAuth } from '../hooks/useAuth';
import { heroText, cardReveal } from '../lib/motion';
import { deleteMyAccount, exportMyData } from '../lib/api';
import { restorePurchases } from '../lib/purchases';

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

  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  async function handleRestore() {
    setRestoring(true);
    setRestoreMsg(null);
    try {
      const result = await restorePurchases();
      const isActive = !!result?.customerInfo?.entitlements?.active?.['tributes'];
      setRestoreMsg(
        isActive
          ? 'Subscription restored.'
          : 'No active subscription found on this Apple ID / Google account.',
      );
    } catch (err) {
      setRestoreMsg(err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setRestoring(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    reset();
  }

  async function handleExport() {
    setExporting(true);
    try {
      const payload = await exportMyData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'haloframe-data-export.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      console.error('[settings:export]', err);
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteMyAccount();
      // Auth user is gone; sign out clears the local session and lands on home.
      await signOut();
      reset();
    } catch (err) {
      console.error('[settings:delete]', err);
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleteBusy(false);
      setDeleteOpen(false);
    }
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

      {!isAnonymous && email && (
        <motion.section
          className="settings-account settings-data"
          variants={cardReveal}
          initial="initial"
          animate="animate"
          custom={4}
        >
          <span className="settings-eyebrow">
            <span>Your data</span>
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={exporting}
            onClick={handleExport}
          >
            {exporting ? 'Preparing\u2026' : 'Export my data'}
          </button>
          <button
            type="button"
            className="btn btn-ghost settings-delete"
            onClick={() => setDeleteOpen(true)}
          >
            Delete my account
          </button>
          {deleteError && <p className="auth-error" role="alert">{deleteError}</p>}
        </motion.section>
      )}

      {Capacitor.isNativePlatform() && (
        <motion.section
          className="settings-account settings-iap"
          variants={cardReveal}
          initial="initial"
          animate="animate"
          custom={5}
        >
          <span className="settings-eyebrow">
            <span>Subscription</span>
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={restoring}
            onClick={() => void handleRestore()}
          >
            {restoring ? 'Restoring…' : 'Restore Purchases'}
          </button>
          {restoreMsg && (
            <p
              className="settings-iap-msg"
              role="status"
              aria-live="polite"
            >
              {restoreMsg}
            </p>
          )}
          <a
            className="auth-link settings-iap-manage"
            href={
              Capacitor.getPlatform() === 'ios'
                ? 'https://apps.apple.com/account/subscriptions'
                : 'https://play.google.com/store/account/subscriptions'
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            Manage subscription
          </a>
        </motion.section>
      )}

      <motion.nav className="settings-legal-links" {...{
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { delay: 0.8, duration: 0.32 },
      }}>
        <button type="button" className="auth-link" onClick={() => push('LEGAL_PRIVACY')}>
          Privacy
        </button>
        <span aria-hidden>·</span>
        <button type="button" className="auth-link" onClick={() => push('LEGAL_TERMS')}>
          Terms
        </button>
      </motion.nav>

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

      <AnimatePresence>
        {deleteOpen && (
          <motion.div
            className="my-tributes-confirm-scrim"
            role="alertdialog"
            aria-modal="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="my-tributes-confirm-sheet"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            >
              <h3>Delete your account?</h3>
              <p>
                This permanently deletes your profile, every tribute you\u2019ve saved, and
                your subscription history. It can\u2019t be undone. We\u2019ll sign you out
                after.
              </p>
              <div className="my-tributes-confirm-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleteBusy}
                >
                  Keep my account
                </button>
                <button
                  type="button"
                  className="btn btn-primary my-tributes-confirm-danger"
                  onClick={handleDeleteAccount}
                  disabled={deleteBusy}
                >
                  {deleteBusy ? 'Deleting\u2026' : 'Delete forever'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
