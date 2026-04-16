// Single import surface for lucide icons. Forces consistent stroke + size.

import {
  ArrowLeft,
  House,
  Images,
  Printer,
  Settings,
  Upload,
  Check,
  X,
  Download,
  LoaderCircle,
  Circle,
  Plus,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const ICONS = {
  back: ArrowLeft,
  home: House,
  images: Images,
  printer: Printer,
  settings: Settings,
  upload: Upload,
  check: Check,
  close: X,
  download: Download,
  spinner: LoaderCircle,
  dot: Circle,
  plus: Plus,
  chevronRight: ChevronRight,
} as const;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  'aria-label'?: string;
}

export function Icon({ name, size = 24, strokeWidth = 1.5, className, 'aria-label': ariaLabel }: IconProps) {
  const Cmp: LucideIcon = ICONS[name];
  return (
    <Cmp
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden={!ariaLabel}
      aria-label={ariaLabel}
    />
  );
}
