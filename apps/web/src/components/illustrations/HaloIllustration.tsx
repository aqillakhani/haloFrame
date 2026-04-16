// 96×96 line illustration used in the MyTributes empty state.
// Bronze halo floating above a framed figure. Rendered with
// currentColor; parent controls color + opacity.

interface IllustrationProps {
  size?: number;
}

export function HaloIllustration({ size = 96 }: IllustrationProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden>
      <ellipse cx="48" cy="40" rx="28" ry="6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="48" cy="56" r="14" stroke="currentColor" strokeWidth="1.5" />
      <path d="M28 80 q20 -16 40 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
