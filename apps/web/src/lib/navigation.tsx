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
// Per-frame params
// ---------------------------------------------------------------------------
/**
 * Optional payload carried by a pushed screen. The stack is otherwise just
 * screen strings; this lets a caller hand the next screen context without a
 * separate global. Currently used by the "Order canvas" buttons to tell the
 * Print Shop which generated image to preview on the canvas.
 */
export interface ScreenParams {
  /** Directly-loadable image URL to render on the canvas previews. */
  imageUrl?: string;
  /** Saved tribute id, when available. */
  tributeId?: string;
}

interface StackFrame {
  screen: Screen;
  params?: ScreenParams;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
interface NavState {
  stack: StackFrame[];
  activeTab: Tab;
}

const initialState: NavState = {
  stack: [{ screen: 'HOME' }],
  activeTab: 'HOME',
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
type NavAction =
  | { type: 'PUSH'; screen: Screen; params?: ScreenParams }
  | { type: 'POP' }
  | { type: 'RESET' }
  | { type: 'SET_TAB'; tab: Tab };

function reducer(state: NavState, action: NavAction): NavState {
  switch (action.type) {
    case 'PUSH':
      return {
        ...state,
        stack: [...state.stack, { screen: action.screen, params: action.params }],
      };
    case 'POP':
      if (state.stack.length <= 1) return state;
      return { ...state, stack: state.stack.slice(0, -1) };
    case 'RESET':
      return { ...state, stack: [{ screen: 'HOME' }], activeTab: 'HOME' };
    case 'SET_TAB': {
      const screen = TAB_SCREENS[action.tab];
      return { stack: [{ screen }], activeTab: action.tab };
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
  /** Params attached to the current (top-of-stack) screen. `{}` when none. */
  params: ScreenParams;
  activeTab: Tab;
  canGoBack: boolean;
  push: (screen: Screen, params?: ScreenParams) => void;
  pop: () => void;
  reset: () => void;
  setTab: (tab: Tab) => void;
}

const NavContext = createContext<NavContextValue | null>(null);

const EMPTY_PARAMS: ScreenParams = {};

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const top = state.stack[state.stack.length - 1];

  const value: NavContextValue = {
    screen: top?.screen ?? 'HOME',
    params: top?.params ?? EMPTY_PARAMS,
    activeTab: state.activeTab,
    canGoBack: state.stack.length > 1,
    push: (screen, params) => dispatch({ type: 'PUSH', screen, params }),
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
