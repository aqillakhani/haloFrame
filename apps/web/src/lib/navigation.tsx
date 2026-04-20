import { createContext, useContext, useReducer, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Screen types
// ---------------------------------------------------------------------------
export type Screen =
  | 'HOME'
  | 'ENHANCE_FLOW'
  | 'REUNITE_FLOW'
  | 'MY_TRIBUTES'
  | 'SETTINGS'
  | 'PRINT_SHOP'
  | 'PAYWALL'
  | 'SIGN_IN'
  | 'SIGN_UP'
  | 'RESET_PASSWORD'
  | 'AUTH_CALLBACK'
  | 'LEGAL_PRIVACY'
  | 'LEGAL_TERMS';

export type Tab = 'HOME' | 'MY_TRIBUTES' | 'SETTINGS' | 'PRINT_SHOP';

const TAB_SCREENS: Record<Tab, Screen> = {
  HOME: 'HOME',
  MY_TRIBUTES: 'MY_TRIBUTES',
  SETTINGS: 'SETTINGS',
  PRINT_SHOP: 'PRINT_SHOP',
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
interface NavState {
  stack: Screen[];
  activeTab: Tab;
}

const initialState: NavState = {
  stack: ['HOME'],
  activeTab: 'HOME',
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
type NavAction =
  | { type: 'PUSH'; screen: Screen }
  | { type: 'POP' }
  | { type: 'RESET' }
  | { type: 'SET_TAB'; tab: Tab };

function reducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'PUSH':
      return { ...state, stack: [...state.stack, action.screen] };
    case 'POP':
      if (state.stack.length <= 1) return state;
      return { ...state, stack: state.stack.slice(0, -1) };
    case 'RESET':
      return { ...state, stack: ['HOME'], activeTab: 'HOME' };
    case 'SET_TAB': {
      const screen = TAB_SCREENS[action.tab];
      return { stack: [screen], activeTab: action.tab };
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
interface NavContextValue {
  screen: Screen;
  activeTab: Tab;
  canGoBack: boolean;
  push: (screen: Screen) => void;
  pop: () => void;
  reset: () => void;
  setTab: (tab: Tab) => void;
}

const NavContext = createContext<NavContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const value: NavContextValue = {
    screen: state.stack[state.stack.length - 1] ?? 'HOME',
    activeTab: state.activeTab,
    canGoBack: state.stack.length > 1,
    push: (screen) => dispatch({ type: 'PUSH', screen }),
    pop: () => dispatch({ type: 'POP' }),
    reset: () => dispatch({ type: 'RESET' }),
    setTab: (tab) => dispatch({ type: 'SET_TAB', tab }),
  };

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNavigation(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
  return ctx;
}
