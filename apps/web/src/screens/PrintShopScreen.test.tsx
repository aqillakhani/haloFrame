import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mutable holders the mocked hooks read on every render. Mutate them in a
// test BEFORE rendering to drive the scenario.
const { navState, tributesState } = vi.hoisted(() => ({
  navState: {
    params: {} as { imageUrl?: string; tributeId?: string },
    setTab: vi.fn(),
  },
  tributesState: {
    tributes: [] as Array<{ id: string; signedImageUrl?: string | null; createdAt: string }>,
  },
}));

vi.mock('../lib/navigation', () => ({
  useNavigation: () => ({
    screen: 'PRINT_SHOP',
    params: navState.params,
    activeTab: 'PRINT_SHOP',
    canGoBack: true,
    push: vi.fn(),
    pop: vi.fn(),
    reset: vi.fn(),
    setTab: navState.setTab,
  }),
}));

vi.mock('../hooks/useTributes', () => ({
  useTributes: () => ({
    tributes: tributesState.tributes,
    isLoading: false,
    error: null,
    refetch: async () => {},
    remove: async () => true,
  }),
}));

import { PrintShopScreen } from './PrintShopScreen';

const SIZE_COUNT = 9; // CANVAS_OPTIONS length (default 'all' filter shows them all)

describe('PrintShopScreen — tribute preview', () => {
  beforeEach(() => {
    navState.params = {};
    navState.setTab.mockClear();
    tributesState.tributes = [];
  });

  it('renders the nav-param image on the hero canvas and every swatch', () => {
    navState.params = { imageUrl: 'https://img/test.png' };
    const { container } = render(<PrintShopScreen />);

    const hero = container.querySelector<HTMLImageElement>('.print-shop-canvas-photo');
    expect(hero).not.toBeNull();
    expect(hero?.src).toBe('https://img/test.png');

    // No silhouette placeholder when a real image is shown.
    expect(container.querySelector('.print-shop-canvas-silhouette')).toBeNull();

    const swatches = container.querySelectorAll<HTMLImageElement>('.print-shop-swatch-photo');
    expect(swatches.length).toBe(SIZE_COUNT);
    swatches.forEach((img) => expect(img.src).toBe('https://img/test.png'));
  });

  it('falls back to the most-recent saved tribute when no param is passed', () => {
    tributesState.tributes = [
      { id: 'old', signedImageUrl: 'https://img/old.png', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'new', signedImageUrl: 'https://img/new.png', createdAt: '2026-06-01T00:00:00Z' },
    ];
    const { container } = render(<PrintShopScreen />);

    const hero = container.querySelector<HTMLImageElement>('.print-shop-canvas-photo');
    expect(hero?.src).toBe('https://img/new.png');
  });

  it('ignores tributes without a signed image url', () => {
    tributesState.tributes = [
      { id: 'mid', signedImageUrl: null, createdAt: '2026-06-10T00:00:00Z' },
      { id: 'has', signedImageUrl: 'https://img/has.png', createdAt: '2026-05-01T00:00:00Z' },
    ];
    const { container } = render(<PrintShopScreen />);
    expect(
      container.querySelector<HTMLImageElement>('.print-shop-canvas-photo')?.src,
    ).toBe('https://img/has.png');
  });

  it('shows the placeholder + create-a-tribute CTA when there is nothing to preview', () => {
    const { container } = render(<PrintShopScreen />);

    expect(container.querySelector('.print-shop-canvas-photo')).toBeNull();
    expect(container.querySelector('.print-shop-canvas-silhouette')).not.toBeNull();
    expect(container.querySelectorAll('.print-shop-swatch-photo').length).toBe(0);

    const cta = screen.getByRole('button', { name: /create a tribute/i });
    fireEvent.click(cta);
    expect(navState.setTab).toHaveBeenCalledWith('HOME');
  });
});
