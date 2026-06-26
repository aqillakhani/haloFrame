import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { NavigationProvider, useNavigation } from './navigation';

function wrapper({ children }: { children: ReactNode }) {
  return <NavigationProvider>{children}</NavigationProvider>;
}

describe('navigation params', () => {
  it('starts at HOME with empty params', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });
    expect(result.current.screen).toBe('HOME');
    expect(result.current.params).toEqual({});
  });

  it('push with params exposes them on the current screen', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });
    act(() => result.current.push('PRINT_SHOP', { imageUrl: 'https://x/y.png' }));
    expect(result.current.screen).toBe('PRINT_SHOP');
    expect(result.current.params.imageUrl).toBe('https://x/y.png');
  });

  it('push without params yields empty params (backward compatible)', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });
    act(() => result.current.push('PAYWALL'));
    expect(result.current.screen).toBe('PAYWALL');
    expect(result.current.params).toEqual({});
  });

  it('pop restores the previous frame and its params', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });
    act(() => result.current.push('PRINT_SHOP', { imageUrl: 'a' }));
    act(() => result.current.push('PAYWALL'));
    expect(result.current.params).toEqual({});
    act(() => result.current.pop());
    expect(result.current.screen).toBe('PRINT_SHOP');
    expect(result.current.params.imageUrl).toBe('a');
  });

  it('setTab clears params', () => {
    const { result } = renderHook(() => useNavigation(), { wrapper });
    act(() => result.current.push('PRINT_SHOP', { imageUrl: 'a' }));
    act(() => result.current.setTab('PRINT_SHOP'));
    expect(result.current.screen).toBe('PRINT_SHOP');
    expect(result.current.params).toEqual({});
  });
});
