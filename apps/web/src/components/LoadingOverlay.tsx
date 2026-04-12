interface LoadingOverlayProps {
  message: string;
  hint?: string;
}

export function LoadingOverlay({ message, hint }: LoadingOverlayProps) {
  return (
    <div className="loading-overlay">
      <div className="spinner" />
      <h3 style={{ margin: 0 }}>{message}</h3>
      {hint && <p className="muted" style={{ margin: 0 }}>{hint}</p>}
    </div>
  );
}
