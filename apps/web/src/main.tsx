import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { LAUNCH_TEMPLATES } from '@haloframe/shared';
import { NavigationProvider } from './lib/navigation';
import { injectRootVars } from './lib/cssVars';
import { preloadSampleImages } from './lib/api';
import { initRC } from './lib/purchases';
import { App } from './App.tsx';
import './styles.css';

injectRootVars();
// Kick off thumbnail fetches the moment the JS bundle executes — before
// React mounts, long before the user enters any flow. By the time the
// Editor gallery renders, the browser cache is warm and tiles paint
// instantly instead of racing the upload/segmentation request pool.
preloadSampleImages(LAUNCH_TEMPLATES);

// On native, initialise RevenueCat as early as possible so the first
// PaywallScreen render already has offerings cached. The web bundle's
// no-op (purchases.ts gates on Capacitor.isNativePlatform()) means this
// is free on the web surface.
if (Capacitor.isNativePlatform()) {
  const platform = Capacitor.getPlatform();
  const apiKey =
    platform === 'ios'
      ? import.meta.env.VITE_RC_IOS_KEY
      : platform === 'android'
        ? import.meta.env.VITE_RC_ANDROID_KEY
        : undefined;
  if (apiKey) {
    void initRC({ apiKey });
  } else {
    console.warn('[main] No RC API key for platform', platform);
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('No #root element');
createRoot(root).render(
  <StrictMode>
    <NavigationProvider>
      <App />
    </NavigationProvider>
  </StrictMode>,
);

// CI-only: the Codemagic `ios-sim-diagnostic` workflow sets VITE_E2E_DIAG to
// exercise the native flow on a simulator and report exactly where it breaks.
// Dynamic import → tree-shaken out of normal builds entirely.
//   '1' = synthetic post-pick pipeline (Filesystem→upload→segment)
//   '2' = REAL system photo picker (Camera.pickImages→read→upload→segment)
if (import.meta.env.VITE_E2E_DIAG === '1') {
  void import('./lib/e2eDiag').then((m) => m.runE2EDiag());
} else if (import.meta.env.VITE_E2E_DIAG === '2') {
  void import('./lib/e2eDiag').then((m) => m.runE2EPickDiag());
}
