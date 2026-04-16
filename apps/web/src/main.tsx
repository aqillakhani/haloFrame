import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NavigationProvider } from './lib/navigation';
import { injectRootVars } from './lib/cssVars';
import { App } from './App.tsx';
import './styles.css';

injectRootVars();

const root = document.getElementById('root');
if (!root) throw new Error('No #root element');
createRoot(root).render(
  <StrictMode>
    <NavigationProvider>
      <App />
    </NavigationProvider>
  </StrictMode>,
);
