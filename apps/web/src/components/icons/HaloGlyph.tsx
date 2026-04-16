// Proprietary brand mark — closed bronze ring with a soft overhead arc.
// Reserved for the app header on Home and the MyTributes empty state.

interface HaloGlyphProps {
  size?: number;
  className?: string;
}

export function HaloGlyph({ size = 28, className }: HaloGlyphProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle cx="16" cy="16" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 12 a 11 5 0 0 1 22 0" stroke="currentColor" strokeWidth="1" opacity="0.55" />
    </svg>
  );
}
