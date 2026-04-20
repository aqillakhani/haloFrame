import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../lib/navigation';
import { COPY } from '../lib/copy';
import { heroText, cardReveal } from '../lib/motion';

function emailRedirect(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/?auth=callback`;
}

export function SignUpScreen() {
  const { push } = useNavigation();
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSentTo, setConfirmSentTo] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await signUp({
      email: email.trim(),
      password,
      displayName: displayName.trim() || undefined,
      emailRedirectTo: emailRedirect(),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? COPY.auth.signUp.generalError);
      return;
    }
    // If Supabase returns a session immediately (email confirmation disabled),
    // we're done. Otherwise show the "check your inbox" state.
    if (res.session) {
      push('HOME');
      return;
    }
    setConfirmSentTo(email.trim());
  }

  if (confirmSentTo) {
    return (
      <div className="auth-screen">
        <motion.header
          className="auth-header"
          variants={heroText}
          initial="initial"
          animate="animate"
        >
          <span className="auth-eyebrow">{COPY.auth.signUp.eyebrow}</span>
          <h1 className="auth-headline">{COPY.auth.signUp.confirmSentHeading}</h1>
          <p className="auth-sub">
            {COPY.auth.signUp.confirmSentSub}
            <strong>{confirmSentTo}</strong>.
            <br />
            {COPY.auth.signUp.confirmSentFooter}
          </p>
        </motion.header>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <motion.header
        className="auth-header"
        variants={heroText}
        initial="initial"
        animate="animate"
      >
        <span className="auth-eyebrow">{COPY.auth.signUp.eyebrow}</span>
        <h1 className="auth-headline">
          {COPY.auth.signUp.headlineBefore}
          <em>{COPY.auth.signUp.headlineItalic}</em>
          {COPY.auth.signUp.headlineAfter}
        </h1>
        <p className="auth-sub">{COPY.auth.signUp.subcopy}</p>
      </motion.header>

      <motion.section
        className="auth-panel"
        variants={cardReveal}
        initial="initial"
        animate="animate"
        custom={0}
      >
        <form onSubmit={handleSubmit} noValidate>
          <label className="auth-field">
            <span>{COPY.auth.signUp.nameLabel}</span>
            <input
              type="text"
              autoComplete="name"
              placeholder={COPY.auth.signUp.namePlaceholder}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <label className="auth-field">
            <span>{COPY.auth.signUp.emailLabel}</span>
            <input
              type="email"
              autoComplete="email"
              placeholder={COPY.auth.signUp.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="auth-field">
            <span>{COPY.auth.signUp.passwordLabel}</span>
            <input
              type="password"
              autoComplete="new-password"
              placeholder={COPY.auth.signUp.passwordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={submitting || !email || !password}
          >
            {submitting ? '\u2026' : COPY.auth.signUp.submit}
          </button>
        </form>
      </motion.section>

      <motion.p
        className="auth-foot"
        variants={cardReveal}
        initial="initial"
        animate="animate"
        custom={1}
      >
        {COPY.auth.signUp.haveAccountBefore}
        <button
          type="button"
          className="auth-link"
          onClick={() => push('SIGN_IN')}
        >
          {COPY.auth.signUp.haveAccountLink}
        </button>
      </motion.p>
    </div>
  );
}
