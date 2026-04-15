import { useNavigation } from '../lib/navigation';
import { COPY } from '../lib/copy';

export function MyTributesScreen() {
  const nav = useNavigation();

  return (
    <div className="screen-content">
      <div className="screen-header">
        <h2>{COPY.tabs.myTributes}</h2>
      </div>
      <div className="empty-state">
        <span className="empty-icon" aria-hidden>&#x1F54A;</span>
        <h2>{COPY.myTributes.emptyHeading}</h2>
        <p>{COPY.myTributes.emptySubtext}</p>
        <button
          type="button"
          className="primary"
          onClick={() => nav.setTab('HOME')}
        >
          {COPY.myTributes.emptyCta}
        </button>
      </div>
    </div>
  );
}
