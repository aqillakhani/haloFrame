// 96×96 line illustration used in the PrintShop empty state.
// A framed picture — the physical artifact we'll one day ship.

interface IllustrationProps {
  size?: number;
}

export function FrameIllustration({ size = 96 }: IllustrationProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden>
      <rect x="18" y="14" width="60" height="68" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="26" y="22" width="44" height="52" rx="1" stroke="currentColor" strokeWidth="1" />
      <circle cx="48" cy="40" r="6" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
