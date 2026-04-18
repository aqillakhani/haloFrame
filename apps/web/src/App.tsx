import { AnimatePresence, motion } from 'framer-motion';
import { useNavigation, type Screen } from './lib/navigation';
import { screenFade } from './lib/motion';
import { HomeScreen } from './screens/HomeScreen';
import { EnhanceFlow } from './screens/EnhanceFlow';
import { ReuniteFlow } from './screens/ReuniteFlow';
import { MyTributesScreen } from './screens/MyTributesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { PrintShopScreen } from './screens/PrintShopScreen';
import { PaywallScreen } from './screens/PaywallScreen';
import { BottomTabBar } from './components/BottomTabBar';

export function App() {
  const { screen } = useNavigation();

  return (
    <div className="app-shell">
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={screen}
          variants={screenFade}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {renderScreen(screen)}
        </motion.main>
      </AnimatePresence>
      {screen !== 'PAYWALL' && <BottomTabBar />}
    </div>
  );
}

function renderScreen(screen: Screen) {
  switch (screen) {
    case 'HOME':         return <HomeScreen />;
    case 'ENHANCE_FLOW': return <EnhanceFlow />;
    case 'REUNITE_FLOW': return <ReuniteFlow />;
    case 'MY_TRIBUTES':  return <MyTributesScreen />;
    case 'SETTINGS':     return <SettingsScreen />;
    case 'PRINT_SHOP':   return <PrintShopScreen />;
    case 'PAYWALL':      return <PaywallScreen />;
  }
}
