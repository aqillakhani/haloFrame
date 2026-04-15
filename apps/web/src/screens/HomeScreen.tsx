import { useNavigation } from '../lib/navigation';
import { COPY } from '../lib/copy';

export function HomeScreen() {
  const nav = useNavigation();

  return (
    <>
      <header className="app-header">
        <h1>{COPY.appName}</h1>
        <p className="tagline">{COPY.tagline}</p>
      </header>

      <div className="home-screen">
        <button
          type="button"
          className="home-card"
          onClick={() => nav.push('ENHANCE_FLOW')}
        >
          <span className="card-icon" aria-hidden>&#x2728;</span>
          <h2>{COPY.home.enhance.title}</h2>
          <p>{COPY.home.enhance.subtitle}</p>
        </button>

        <button
          type="button"
          className="home-card"
          onClick={() => nav.push('REUNITE_FLOW')}
        >
          {/* Family silhouette with halo — SVG icon */}
          <svg className="card-icon-svg" width="48" height="40" viewBox="0 0 48 40" aria-hidden="true">
            {/* Halo */}
            <ellipse cx="32" cy="6" rx="5" ry="3" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
            {/* Person 1 (left) */}
            <circle cx="12" cy="18" r="4" fill="var(--text-primary)" />
            <path d="M6 38 Q6 26 12 26 Q18 26 18 38" fill="var(--text-primary)" />
            {/* Person 2 (center, taller) */}
            <circle cx="24" cy="16" r="4.5" fill="var(--text-primary)" />
            <path d="M17 38 Q17 24 24 24 Q31 24 31 38" fill="var(--text-primary)" />
            {/* Person 3 (right, with halo) */}
            <circle cx="32" cy="14" r="4" fill="var(--gold)" opacity="0.7" />
            <path d="M26 38 Q26 22 32 22 Q38 22 38 38" fill="var(--gold)" opacity="0.7" />
          </svg>
          <h2>{COPY.home.reunite.title}</h2>
          <p>{COPY.home.reunite.subtitle}</p>
        </button>
      </div>
    </>
  );
}
