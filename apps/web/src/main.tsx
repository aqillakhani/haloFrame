import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LAUNCH_TEMPLATES } from '@haloframe/shared';
import { NavigationProvider } from './lib/navigation';
import { injectRootVars } from './lib/cssVars';
import { preloadSampleImages } from './lib/api';
import { App } from './App.tsx';
import './styles.css';

injectRootVars();
// Kick off thumbnail fetches the moment the JS bundle executes — before
// React mounts, long before the user enters any flow. By the time the
// Editor gallery renders, the browser cache is warm and tiles paint
// instantly instead of racing the upload/segmentation request pool.
preloadSampleImages(LAUNCH_TEMPLATES);

const root = document.getElementById('root');
if (!root) throw new Error('No #root element');
createRoot(root).render(
  <StrictMode>
    <NavigationProvider>
      <App />
    </NavigationProvider>
  </StrictMode>,
);
