import { useNavigation, type Tab } from '../lib/navigation';
import { COPY } from '../lib/copy';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'HOME', icon: '\u2302', label: COPY.tabs.home },
  { id: 'MY_TRIBUTES', icon: '\u2661', label: COPY.tabs.myTributes },
  { id: 'SETTINGS', icon: '\u2699', label: COPY.tabs.settings },
  { id: 'PRINT_SHOP', icon: '\u2399', label: COPY.tabs.print },
];

export function BottomTabBar() {
  const { activeTab, setTab } = useNavigation();

  return (
    <nav className="bottom-tab-bar" aria-label="Main navigation">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`bottom-tab${activeTab === t.id ? ' active' : ''}`}
          onClick={() => setTab(t.id)}
          aria-current={activeTab === t.id ? 'page' : undefined}
        >
          <span className="tab-icon" aria-hidden>{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
