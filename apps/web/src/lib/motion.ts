// framer-motion Variants + transition presets shared across screens.

import type { Variants, Transition } from 'framer-motion';
import { duration, easing } from './tokens';

const ms = (n: number) => n / 1000;

// Framer-motion accepts cubic-bezier as a 4-tuple. Spread the readonly tuples.
const ease = {
  standard: [...easing.standard] as [number, number, number, number],
  gentle:   [...easing.gentle]   as [number, number, number, number],
  exit:     [...easing.exit]     as [number, number, number, number],
};

export const transition: Record<'fast' | 'base' | 'slow' | 'reverent', Transition> = {
  fast:     { duration: ms(duration.fast),     ease: ease.exit },
  base:     { duration: ms(duration.base),     ease: ease.standard },
  slow:     { duration: ms(duration.slow),     ease: ease.gentle },
  reverent: { duration: ms(duration.reverent), ease: ease.gentle },
};

export const screenFade: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: transition.base },
  exit:    { opacity: 0,        transition: transition.fast },
};

export const tabFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.24, ease: ease.standard } },
  exit:    { opacity: 0, transition: { duration: 0.18, ease: ease.exit } },
};

export const heroText: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: transition.reverent },
};

export const cardReveal: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: ease.gentle, delay: 0.2 + i * 0.08 },
  }),
};

export const photoFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: transition.slow },
};

export const sheetSlide: Variants = {
  initial: { y: '100%' },
  animate: { y: 0, transition: transition.base },
  exit:    { y: '100%', transition: transition.fast },
};

export const toastEnter: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: transition.base },
  exit:    { opacity: 0, y: 16, transition: transition.fast },
};
