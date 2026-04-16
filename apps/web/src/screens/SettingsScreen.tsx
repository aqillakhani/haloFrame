import { EnvelopeIllustration } from '../components/illustrations/EnvelopeIllustration';

export function SettingsScreen() {
  return (
    <div className="empty">
      <hr className="hairline-short" aria-hidden />
      <div className="empty-illustration"><EnvelopeIllustration /></div>
      <hr className="hairline-short" aria-hidden />
      <h1 className="t-display-lg empty-headline">Quiet for now.</h1>
      <p className="t-body-md t-muted empty-body">
        Account and subscription settings will live here once they land.
      </p>
    </div>
  );
}
