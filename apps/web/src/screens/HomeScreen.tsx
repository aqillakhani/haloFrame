import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useNavigation, type Screen } from '../lib/navigation';
import { heroText, cardReveal } from '../lib/motion';
import { useSubscription } from '../hooks/useSubscription';
import { COPY } from '../lib/copy';

interface Path {
  id: string;
  screen: Screen;
  accent: 'terracotta' | 'plum';
  kicker: string;
  titleLead: string;
  titleItalic: string;
  desc: string;
  cta: string;
  illustration: 'halo' | 'reunite';
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

function phaseFor(hour: number): keyof typeof COPY.home.phase {
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

function formatGreetingDate(now: Date): string {
  const weekday = WEEKDAYS[now.getDay()];
  const phase = COPY.home.phase[phaseFor(now.getHours())];
  return `${weekday}, ${phase}`;
}

const FREE_LIFETIME_TOTAL = 2;

export function HomeScreen() {
  const nav = useNavigation();
  const { snapshot } = useSubscription();

  const greetingDate = useMemo(() => formatGreetingDate(new Date()), []);

  const paths: Path[] = [
    {
      id: 'enhance',
      screen: 'ENHANCE_FLOW',
      accent: 'terracotta',
      kicker: COPY.home.enhance.kicker,
      titleLead: COPY.home.enhance.title,
      titleItalic: COPY.home.enhance.titleItalic,
      desc: COPY.home.enhance.subtitle,
      cta: COPY.home.enhance.cta,
      illustration: 'halo',
    },
    {
      id: 'reunite',
      screen: 'REUNITE_FLOW',
      accent: 'plum',
      kicker: COPY.home.reunite.kicker,
      titleLead: COPY.home.reunite.title,
      titleItalic: COPY.home.reunite.titleItalic,
      desc: COPY.home.reunite.subtitle,
      cta: COPY.home.reunite.cta,
      illustration: 'reunite',
    },
  ];

  const badge = buildBadge(snapshot);

  return (
    <div className="home">
      <motion.header
        className="home-header"
        variants={heroText}
        initial="initial"
        animate="animate"
      >
        <span className="home-wordmark" aria-label="haloFrame">
          <span className="home-wordmark-orb" aria-hidden />
          <span>
            halo<em>Frame</em>
          </span>
        </span>
        {badge && (
          <span
            className="home-badge"
            role="status"
            aria-label={badge.ariaLabel}
          >
            <span className="home-badge-dot" aria-hidden />
            <span className="home-badge-count">{badge.count}</span>
            <span className="home-badge-label">{badge.label}</span>
          </span>
        )}
      </motion.header>

      <motion.section
        className="home-greeting"
        variants={heroText}
        initial="initial"
        animate="animate"
      >
        <p className="home-greeting-date">{greetingDate}</p>
        <h1 className="home-greeting-headline">
          {COPY.home.headlineBefore}
          <em>{COPY.home.headlineItalic}</em>
          {COPY.home.headlineAfter}
        </h1>
        <p className="home-greeting-sub">{COPY.home.subcopy}</p>
      </motion.section>

      <div className="home-section">
        <span className="home-section-label">{COPY.home.sectionLabel}</span>
        <span className="home-section-idx">{COPY.home.sectionIndex}</span>
      </div>

      <div className="home-paths">
        {paths.map((p, i) => (
          <motion.button
            key={p.id}
            type="button"
            className="home-path"
            data-accent={p.accent}
            variants={cardReveal}
            initial="initial"
            animate="animate"
            custom={i}
            onClick={() => nav.push(p.screen)}
            aria-labelledby={`${p.id}-title`}
            aria-describedby={`${p.id}-desc`}
          >
            <div className="home-path-media" aria-hidden>
              {p.illustration === 'halo' ? <HaloPortrait /> : <ReunitePortrait />}
            </div>
            <div className="home-path-body">
              <span className="home-path-kicker">{p.kicker}</span>
              <h2 className="home-path-title" id={`${p.id}-title`}>
                {p.titleLead} <em>{p.titleItalic}</em>
              </h2>
              <p className="home-path-desc" id={`${p.id}-desc`}>
                {p.desc}
              </p>
              <div className="home-path-meta">
                <span>{p.cta}</span>
                <span className="home-path-meta-arrow" aria-hidden>
                  &rarr;
                </span>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      <p className="home-fine">{COPY.home.fine}</p>
    </div>
  );
}

interface Badge {
  count: number;
  label: string;
  ariaLabel: string;
}

function buildBadge(
  snapshot: ReturnType<typeof useSubscription>['snapshot'],
): Badge | null {
  if (!snapshot) return null;
  const n = snapshot.creditsRemaining;
  if (snapshot.planId === 'free') {
    const label = COPY.home.badgeOfFree(n, FREE_LIFETIME_TOTAL);
    return {
      count: n,
      label,
      ariaLabel: `${n} ${label}`,
    };
  }
  return {
    count: n,
    label: COPY.home.badgeRemaining,
    ariaLabel: `${n} ${COPY.home.badgeRemaining}`,
  };
}

/* Decorative halo-portrait illustration for the Enhance path.
   Deliberately SVG (not a raster photo): faster to load, scales cleanly,
   and avoids any specific face for a memorial context. */
function HaloPortrait() {
  return (
    <svg viewBox="0 0 120 160" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Portrait with halo">
      <defs>
        <radialGradient id="halo-portrait-bg" cx="50%" cy="55%" r="70%">
          <stop offset="0%" stopColor="oklch(0.38 0.055 300)" />
          <stop offset="100%" stopColor="oklch(0.20 0.045 295)" />
        </radialGradient>
        <radialGradient id="halo-portrait-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="oklch(0.95 0.08 85 / 0.95)" />
          <stop offset="40%" stopColor="oklch(0.92 0.07 85 / 0.45)" />
          <stop offset="75%" stopColor="oklch(0.92 0.06 85 / 0.08)" />
          <stop offset="100%" stopColor="oklch(1 0 0 / 0)" />
        </radialGradient>
      </defs>
      <rect width="120" height="160" fill="url(#halo-portrait-bg)" />
      <circle cx="60" cy="58" r="38" fill="url(#halo-portrait-glow)" />
      <circle cx="60" cy="58" r="28" fill="none" stroke="oklch(0.95 0.08 85 / 0.7)" strokeWidth="0.8" />
      <path d="M10 160 Q10 118 36 108 Q60 100 84 108 Q110 118 110 160 Z" fill="oklch(0.14 0.03 295)" />
      <ellipse cx="60" cy="72" rx="18" ry="22" fill="oklch(0.14 0.03 295)" />
      <rect x="52" y="90" width="16" height="14" fill="oklch(0.14 0.03 295)" />
    </svg>
  );
}

/* Family-photo illustration for the Reunite path: a slightly tilted
   framed photo with three silhouettes and one luminous "reunited" figure. */
function ReunitePortrait() {
  return (
    <svg viewBox="0 0 120 160" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Family photograph with a halo figure">
      <defs>
        <linearGradient id="reunite-paper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.96 0.008 82)" />
          <stop offset="100%" stopColor="oklch(0.92 0.01 82)" />
        </linearGradient>
        <linearGradient id="reunite-photo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.70 0.020 60)" />
          <stop offset="100%" stopColor="oklch(0.48 0.022 60)" />
        </linearGradient>
        <radialGradient id="reunite-glow" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="oklch(1 0 0 / 0.9)" />
          <stop offset="45%" stopColor="oklch(1 0 0 / 0.35)" />
          <stop offset="100%" stopColor="oklch(1 0 0 / 0)" />
        </radialGradient>
      </defs>
      <rect width="120" height="160" fill="url(#reunite-paper)" />
      <g transform="translate(60 82) rotate(-3) translate(-44 -54)">
        <rect width="88" height="108" fill="#fff" stroke="oklch(0.75 0.01 70)" strokeWidth="0.6" />
        <rect x="6" y="6" width="76" height="80" fill="url(#reunite-photo)" />
        <g fill="oklch(0.28 0.015 60)">
          <ellipse cx="24" cy="58" rx="8" ry="10" />
          <path d="M12 86 Q12 70 24 66 Q36 70 36 86 Z" />
          <ellipse cx="44" cy="54" rx="9" ry="11" />
          <path d="M30 86 Q30 66 44 62 Q58 66 58 86 Z" />
          <ellipse cx="64" cy="58" rx="7" ry="9" />
          <path d="M54 86 Q54 70 64 66 Q74 70 74 86 Z" />
        </g>
        <circle cx="44" cy="42" r="18" fill="url(#reunite-glow)" />
        <circle cx="44" cy="42" r="12" fill="none" stroke="oklch(1 0 0 / 0.6)" strokeWidth="0.5" />
        <rect x="6" y="90" width="76" height="12" fill="oklch(0.98 0.005 82)" />
      </g>
    </svg>
  );
}
