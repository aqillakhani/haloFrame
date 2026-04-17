import { COPY } from '../lib/copy';
import { FrameIllustration } from '../components/illustrations/FrameIllustration';

interface CanvasOption {
  id: string;
  name: string;
  description: string;
  priceCents: number;
}

// Mock pricing per user request — real pricing wires in once the print
// provider integration lands. Keeping the data inline (not in shared
// constants) makes that swap easy later.
const CANVAS_OPTIONS: CanvasOption[] = [
  { id: 'canvas_8x10',  name: 'Canvas 8\u201D \u00D7 10\u201D',  description: 'Compact gallery-wrapped canvas',   priceCents: 4999 },
  { id: 'canvas_12x16', name: 'Canvas 12\u201D \u00D7 16\u201D', description: 'Medium gallery-wrapped canvas',    priceCents: 6999 },
  { id: 'canvas_16x20', name: 'Canvas 16\u201D \u00D7 20\u201D', description: 'Large gallery-wrapped canvas',     priceCents: 8999 },
  { id: 'canvas_20x30', name: 'Canvas 20\u201D \u00D7 30\u201D', description: 'Statement gallery-wrapped canvas', priceCents: 11999 },
];

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function PrintShopScreen() {
  return (
    <section className="flow-pane print-shop">
      <header className="print-shop-header">
        <h1 className="t-display-lg">{COPY.printShop.heading}</h1>
        <hr className="hairline-short" aria-hidden />
        <p className="t-body-md t-muted">{COPY.printShop.subheading}</p>
      </header>

      <div className="canvas-grid" role="list">
        {CANVAS_OPTIONS.map((option) => (
          <article className="canvas-card" role="listitem" key={option.id}>
            <div className="canvas-card-photo" aria-hidden>
              <FrameIllustration />
            </div>
            <div className="canvas-card-body">
              <h2 className="t-display-md canvas-card-name">{option.name}</h2>
              <p className="t-body-sm t-muted canvas-card-desc">{option.description}</p>
              <div className="canvas-card-footer">
                <span className="canvas-card-price">{formatPrice(option.priceCents)}</span>
                <button
                  type="button"
                  className="btn btn-primary canvas-card-cta"
                  onClick={() => {
                    // Placeholder checkout — real provider integration comes later.
                    window.alert(COPY.printShop.comingSoon);
                  }}
                >
                  {COPY.printShop.cta}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
