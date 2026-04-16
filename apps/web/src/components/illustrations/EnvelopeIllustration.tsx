// 96×96 line illustration used in the Settings empty state.
// Folded letter — calm, nothing to do here yet.

interface IllustrationProps {
  size?: number;
}

export function EnvelopeIllustration({ size = 96 }: IllustrationProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden>
      <rect x="14" y="28" width="68" height="44" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14 32 L48 56 L82 32" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
