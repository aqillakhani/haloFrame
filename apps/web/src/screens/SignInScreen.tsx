import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../lib/navigation';
import { COPY } from '../lib/copy';
import { heroText, cardReveal } from '../lib/motion';

type Method = 'email' | 'magic' | 'google' | 'apple';

const METHODS: Array<{ id: Method; label: string }> = [
  { id: 'email', label: COPY.auth.signIn.tabEmail },
  { id: 'magic', label: COPY.auth.signIn.tabMagic },
  { id: 'google', label: COPY.auth.signIn.tabGoogle },
  { id: 'apple', label: COPY.auth.signIn.tabApple },
];

function oauthRedirect(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/?auth=callback`;
}

export function SignInScreen() {
  const { push } = useNavigation();
  const { signInWithPassword, signInWithOtp, signInWithOAuth } = useAuth();
  const [method, setMethod] = useState<Method>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState<string | null>(null);

  async function handleEmail(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? COPY.auth.signIn.generalError);
      return;
    }
    push('HOME');
  }

  async function handleMagic(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await signInWithOtp({
      email: email.trim(),
      emailRedirectTo: oauthRedirect(),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? COPY.auth.signIn.generalError);
      return;
    }
    setMagicSent(email.trim());
  }

  async function handleOAuth(provider: 'google' | 'apple') {
    setError(null);
    setSubmitting(true);
    const res = await signInWithOAuth({ provider, redirectTo: oauthRedirect() });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? COPY.auth.signIn.generalError);
    }
    // On success Supabase redirects; no further state change here.
  }

  return (
    <div className="auth-screen">
      <motion.header
        className="auth-header"
        variants={heroText}
        initial="initial"
        animate="animate"
      >
        <span className="auth-eyebrow">{COPY.auth.signIn.eyebrow}</span>
        <h1 className="auth-headline">
          {COPY.auth.signIn.headlineBefore}
          <em>{COPY.auth.signIn.headlineItalic}</em>
          {COPY.auth.signIn.headlineAfter}
        </h1>
        <p className="auth-sub">{COPY.auth.signIn.subcopy}</p>
      </motion.header>

      <motion.nav
        className="auth-tabs"
        role="tablist"
        aria-label="Sign-in method"
        variants={cardReveal}
        initial="initial"
        animate="animate"
        custom={0}
      >
        {METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={method === m.id}
            className="auth-tab"
            data-active={method === m.id}
            onClick={() => {
              setMethod(m.id);
              setError(null);
              setMagicSent(null);
            }}
          >
            {m.label}
          </button>
        ))}
      </motion.nav>

      <motion.section
        className="auth-panel"
        variants={cardReveal}
        initial="initial"
        animate="animate"
        custom={1}
      >
        {method === 'email' && (
          <form onSubmit={handleEmail} noValidate>
            <label className="auth-field">
              <span>{COPY.auth.signIn.emailLabel}</span>
              <input
                type="email"
                autoComplete="email"
                placeholder={COPY.auth.signIn.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="auth-field">
              <span>{COPY.auth.signIn.passwordLabel}</span>
              <input
                type="password"
                autoComplete="current-password"
                placeholder={COPY.auth.signIn.passwordPlaceholder}
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
              {submitting ? '\u2026' : COPY.auth.signIn.submit}
            </button>
            <button
              type="button"
              className="auth-link auth-link-right"
              onClick={() => push('RESET_PASSWORD')}
            >
              {COPY.auth.signIn.forgotLink}
            </button>
          </form>
        )}

        {method === 'magic' && (
          <form onSubmit={handleMagic} noValidate>
            {magicSent ? (
              <div className="auth-sent">
                <h2>{COPY.auth.signIn.magicSentHeading}</h2>
                <p>
                  {COPY.auth.signIn.magicSentSub}
                  <strong>{magicSent}</strong>.
                </p>
              </div>
            ) : (
              <>
                <label className="auth-field">
                  <span>{COPY.auth.signIn.emailLabel}</span>
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder={COPY.auth.signIn.emailPlaceholder}
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
                  {submitting ? '\u2026' : COPY.auth.signIn.magicSubmit}
                </button>
              </>
            )}
          </form>
        )}

        {method === 'google' && (
          <div className="auth-oauth">
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button
              type="button"
              className="btn btn-primary auth-submit"
              disabled={submitting}
              onClick={() => handleOAuth('google')}
            >
              {COPY.auth.signIn.googleSubmit}
            </button>
          </div>
        )}

        {method === 'apple' && (
          <div className="auth-oauth">
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button
              type="button"
              className="btn btn-primary auth-submit"
              disabled={submitting}
              onClick={() => handleOAuth('apple')}
            >
              {COPY.auth.signIn.appleSubmit}
            </button>
          </div>
        )}
      </motion.section>

      <motion.p
        className="auth-foot"
        variants={cardReveal}
        initial="initial"
        animate="animate"
        custom={2}
      >
        {COPY.auth.signIn.noAccountBefore}
        <button
          type="button"
          className="auth-link"
          onClick={() => push('SIGN_UP')}
        >
          {COPY.auth.signIn.noAccountLink}
        </button>
      </motion.p>
    </div>
  );
}
