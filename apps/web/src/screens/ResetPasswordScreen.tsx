import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../lib/navigation';
import { COPY } from '../lib/copy';
import { heroText, cardReveal } from '../lib/motion';

function resetRedirect(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/?auth=recover`;
}

export function ResetPasswordScreen() {
  const { push, pop, canGoBack } = useNavigation();
  const { resetPasswordForEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await resetPasswordForEmail({
      email: email.trim(),
      redirectTo: resetRedirect(),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? COPY.auth.reset.generalError);
      return;
    }
    setSentTo(email.trim());
  }

  return (
    <div className="auth-screen">
      <motion.header
        className="auth-header"
        variants={heroText}
        initial="initial"
        animate="animate"
      >
        <span className="auth-eyebrow">{COPY.auth.reset.eyebrow}</span>
        {sentTo ? (
          <>
            <h1 className="auth-headline">{COPY.auth.reset.sentHeading}</h1>
            <p className="auth-sub">
              {COPY.auth.reset.sentSub}
              <strong>{sentTo}</strong>
              {COPY.auth.reset.sentSubSuffix}
            </p>
          </>
        ) : (
          <>
            <h1 className="auth-headline">
              {COPY.auth.reset.headlineBefore}
              <em>{COPY.auth.reset.headlineItalic}</em>
              {COPY.auth.reset.headlineAfter}
            </h1>
            <p className="auth-sub">{COPY.auth.reset.subcopy}</p>
          </>
        )}
      </motion.header>

      {!sentTo && (
        <motion.section
          className="auth-panel"
          variants={cardReveal}
          initial="initial"
          animate="animate"
          custom={0}
        >
          <form onSubmit={handleSubmit} noValidate>
            <label className="auth-field">
              <span>{COPY.auth.reset.emailLabel}</span>
              <input
                type="email"
                autoComplete="email"
                placeholder={COPY.auth.reset.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button
              type="submit"
              className="btn btn-primary auth-submit"
              disabled={submitting || !email}
            >
              {submitting ? '\u2026' : COPY.auth.reset.submit}
            </button>
          </form>
        </motion.section>
      )}

      <motion.p
        className="auth-foot"
        variants={cardReveal}
        initial="initial"
        animate="animate"
        custom={1}
      >
        <button
          type="button"
          className="auth-link"
          onClick={() => (canGoBack ? pop() : push('SIGN_IN'))}
        >
          {COPY.auth.reset.back}
        </button>
      </motion.p>
    </div>
  );
}
