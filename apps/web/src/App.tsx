import { useNavigation } from './lib/navigation';
import { HomeScreen } from './screens/HomeScreen';
import { EnhanceFlow } from './screens/EnhanceFlow';
import { ReuniteFlow } from './screens/ReuniteFlow';
import { MyTributesScreen } from './screens/MyTributesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { PrintShopScreen } from './screens/PrintShopScreen';
import { BottomTabBar } from './components/BottomTabBar';

export function App() {
  const { screen } = useNavigation();

  return (
    <div className="app-shell">
      {screen === 'HOME' && <HomeScreen />}
      {screen === 'ENHANCE_FLOW' && <EnhanceFlow />}
      {screen === 'REUNITE_FLOW' && <ReuniteFlow />}
      {screen === 'MY_TRIBUTES' && <MyTributesScreen />}
      {screen === 'SETTINGS' && <SettingsScreen />}
      {screen === 'PRINT_SHOP' && <PrintShopScreen />}
      <BottomTabBar />
    </div>
  );
}
