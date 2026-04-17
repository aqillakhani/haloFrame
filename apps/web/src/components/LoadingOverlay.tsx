import { useEffect, useState } from 'react';

interface LoadingOverlayProps {
  /** Static headline, OR a list that rotates every ~4s so a long-running
   *  task keeps the user informed about what's happening under the hood. */
  message: string | readonly string[];
  hint?: string;
  /** ms between messages when `message` is a list. Default 4000. */
  rotateMs?: number;
}

export function LoadingOverlay({ message, hint, rotateMs = 4000 }: LoadingOverlayProps) {
  const [showHint, setShowHint] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);

  const isRotating = Array.isArray(message) && message.length > 1;
  const currentMessage = Array.isArray(message) ? message[messageIndex % message.length]! : message;

  useEffect(() => {
    const t = setTimeout(() => setShowHint(true), 12000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!isRotating) return;
    const id = setInterval(() => {
      setMessageIndex((i) => i + 1);
    }, rotateMs);
    return () => clearInterval(id);
  }, [isRotating, rotateMs]);

  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <p
        key={currentMessage /* triggers fade between messages when rotating */}
        className="loading-message t-display-md t-italic loading-message--animate"
      >
        {currentMessage}
      </p>
      <div className="loading-dots" aria-hidden>
        <span /><span /><span />
      </div>
      {(hint || showHint) && (
        <p className="loading-hint t-body-sm t-muted">{hint ?? 'Almost there\u2026'}</p>
      )}
    </div>
  );
}
