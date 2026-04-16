import { useEffect, useState } from 'react';

interface LoadingOverlayProps {
  message: string;
  hint?: string;
}

export function LoadingOverlay({ message, hint }: LoadingOverlayProps) {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowHint(true), 12000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <p className="loading-message t-display-md t-italic">{message}</p>
      <div className="loading-dots" aria-hidden>
        <span /><span /><span />
      </div>
      {(hint || showHint) && (
        <p className="loading-hint t-body-sm t-muted">{hint ?? 'Almost there\u2026'}</p>
      )}
    </div>
  );
}
