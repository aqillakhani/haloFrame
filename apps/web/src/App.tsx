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
import { SignInScreen } from './screens/SignInScreen';
import { SignUpScreen } from './screens/SignUpScreen';
import { ResetPasswordScreen } from './screens/ResetPasswordScreen';
import { AuthCallbackScreen } from './screens/AuthCallbackScreen';
import { LegalScreen } from './screens/LegalScreen';
import { BottomTabBar } from './components/BottomTabBar';

const HIDE_TABBAR_SCREENS: readonly Screen[] = [
  'PAYWALL',
  'SIGN_IN',
  'SIGN_UP',
  'RESET_PASSWORD',
  'AUTH_CALLBACK',
  'LEGAL_PRIVACY',
  'LEGAL_TERMS',
];

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
      {!HIDE_TABBAR_SCREENS.includes(screen) && <BottomTabBar />}
    </div>
  );
}

function renderScreen(screen: Screen) {
  switch (screen) {
    case 'HOME':           return <HomeScreen />;
    case 'ENHANCE_FLOW':   return <EnhanceFlow />;
    case 'REUNITE_FLOW':   return <ReuniteFlow />;
    case 'MY_TRIBUTES':    return <MyTributesScreen />;
    case 'SETTINGS':       return <SettingsScreen />;
    case 'PRINT_SHOP':     return <PrintShopScreen />;
    case 'PAYWALL':        return <PaywallScreen />;
    case 'SIGN_IN':        return <SignInScreen />;
    case 'SIGN_UP':        return <SignUpScreen />;
    case 'RESET_PASSWORD': return <ResetPasswordScreen />;
    case 'AUTH_CALLBACK':  return <AuthCallbackScreen />;
    case 'LEGAL_PRIVACY':  return <LegalScreen kind="privacy" />;
    case 'LEGAL_TERMS':    return <LegalScreen kind="terms" />;
  }
}
