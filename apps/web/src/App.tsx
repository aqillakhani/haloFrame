import { useState } from 'react';
import { EnhanceFlow } from './screens/EnhanceFlow';
import { ReuniteFlow } from './screens/ReuniteFlow';

type Flow = 'enhance' | 'reunite';

const FLOW_INFO: Record<Flow, { title: string; subtitle: string }> = {
  enhance: {
    title: 'Enhance a photo',
    subtitle: 'Add a gentle memorial touch to a photo you already cherish',
  },
  reunite: {
    title: 'Reunite in a photo',
    subtitle: 'Bring a loved one into a scene you wish they could have shared',
  },
};

export function App() {
  const [flow, setFlow] = useState<Flow>('enhance');

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>EternalFrame</h1>
        <p className="tagline">A gentle place to honor those we love</p>
      </header>

      <nav className="flow-tabs" role="tablist" aria-label="Choose a path">
        <button
          type="button"
          role="tab"
          aria-selected={flow === 'enhance'}
          className={`flow-tab${flow === 'enhance' ? ' active' : ''}`}
          onClick={() => setFlow('enhance')}
        >
          Enhance a Photo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={flow === 'reunite'}
          className={`flow-tab${flow === 'reunite' ? ' active' : ''}`}
          onClick={() => setFlow('reunite')}
        >
          Reunite in a Photo
        </button>
      </nav>

      <p
        className="muted"
        style={{
          textAlign: 'center',
          margin: '-0.5rem auto 1.25rem',
          maxWidth: '480px',
        }}
      >
        {FLOW_INFO[flow].subtitle}
      </p>

      {flow === 'enhance' ? <EnhanceFlow key="enhance" /> : <ReuniteFlow key="reunite" />}

      <footer style={{ marginTop: '2.5rem', textAlign: 'center' }}>
        <p className="muted" style={{ fontSize: '0.75rem' }}>
          Made with care · tap to pinch, drag, and compare
        </p>
      </footer>
    </div>
  );
}
