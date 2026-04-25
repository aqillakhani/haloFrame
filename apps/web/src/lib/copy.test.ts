import { describe, expect, it } from 'vitest';

import { COPY } from './copy';

describe('COPY helpers', () => {
  describe('home.badgeOfFree', () => {
    it('renders the denominator, not the numerator', () => {
      expect(COPY.home.badgeOfFree(0, 2)).toBe('of 2 free');
      expect(COPY.home.badgeOfFree(1, 2)).toBe('of 2 free');
    });
  });

  describe('enhance.stepLabel', () => {
    it('zero-pads single-digit steps', () => {
      expect(COPY.enhance.stepLabel(1, 3)).toBe('Step 01 / 03');
      expect(COPY.enhance.stepLabel(2, 12)).toBe('Step 02 / 12');
    });
  });

  describe('home headline fragments', () => {
    it('concatenates into the full tribute line', () => {
      const full =
        COPY.home.headlineBefore + COPY.home.headlineItalic + COPY.home.headlineAfter;
      expect(full).toBe('For the ones we carry with us.');
    });
  });

  // App-store-safe vocabulary regression. The Apple/Google review research
  // (APPSTORE_PLAYSTORE_RESEARCH §4.2) flagged these terms as triggering
  // memorial-AI rejection risk. Any future copy pass that reintroduces
  // them should fail the build here.
  describe('store-safe vocabulary', () => {
    const FORBIDDEN = [
      'deepfake',
      'resurrect',
      'alive again',
      'bring back',
      'bring them back',
    ];
    const json = JSON.stringify(COPY).toLowerCase();

    for (const word of FORBIDDEN) {
      it(`does not contain "${word}"`, () => {
        expect(json).not.toContain(word.toLowerCase());
      });
    }
  });
});
