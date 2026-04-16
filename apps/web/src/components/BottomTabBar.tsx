import { useNavigation, type Tab } from '../lib/navigation';
import { Icon, type IconName } from './icons/Icon';

const TABS: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'HOME',        label: 'Home',     icon: 'home' },
  { id: 'MY_TRIBUTES', label: 'Tributes', icon: 'images' },
  { id: 'PRINT_SHOP',  label: 'Prints',   icon: 'printer' },
  { id: 'SETTINGS',    label: 'Settings', icon: 'settings' },
];

export function BottomTabBar() {
  const { activeTab, setTab } = useNavigation();

  return (
    <nav className="tab-bar" aria-label="Primary">
      {TABS.map(t => {
        const active = activeTab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            className={`tab-item${active ? ' tab-item--active' : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-label={t.label}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={22} />
            <span className="tab-item-label">{t.label}</span>
            <span className="tab-item-underline" aria-hidden />
          </button>
        );
      })}
    </nav>
  );
}
