import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform, StyleSheet, useColorScheme } from 'react-native';

// Two tone sets sharing the same brand hue (penny-teal). Light is the
// original palette; dark lifts chroma slightly so primary/danger stay
// legible on dark surfaces.
export interface Palette {
  bg: string;
  card: string;
  text: string;
  muted: string;
  primary: string;
  onPrimary: string;
  danger: string;
  warning: string;
  border: string;
  chartCategories: string[];
  chartOther: string;
}

export const palettes: Record<'light' | 'dark', Palette> = {
  light: {
    bg: '#F4F6F8',
    card: '#FFFFFF',
    text: '#1A2430',
    muted: '#6B7A8C',
    primary: '#0E7C66',
    onPrimary: '#FFFFFF',
    danger: '#C0392B',
    warning: '#B7791F',
    border: '#E1E7ED',
    // Categorical chart palette validated for light surfaces.
    chartCategories: ['#0A8F72', '#D9730D', '#4C6EF5', '#C2255C', '#9C36B5'],
    chartOther: '#6B7A8C',
  },
  dark: {
    bg: '#0C1219',
    card: '#161F2A',
    text: '#E6EBF1',
    muted: '#8B9AAB',
    primary: '#27A98B',
    onPrimary: '#08110D',
    danger: '#E2604F',
    warning: '#D99C42',
    border: '#263240',
    chartCategories: ['#2FB392', '#E8913D', '#7B94F7', '#DB5C8C', '#B566CE'],
    chartOther: '#8B9AAB',
  },
};

export type SchemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'bukit.theme';

async function loadPreference(): Promise<SchemePreference | null> {
  try {
    if (Platform.OS === 'web') {
      return (globalThis.localStorage?.getItem(STORAGE_KEY) as SchemePreference) ?? null;
    }
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    return (await SecureStore.getItemAsync(STORAGE_KEY)) as SchemePreference | null;
  } catch {
    return null;
  }
}

async function savePreference(pref: SchemePreference): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(STORAGE_KEY, pref);
      return;
    }
    const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
    await SecureStore.setItemAsync(STORAGE_KEY, pref);
  } catch {
    // Preference persistence is best-effort; the in-memory value still applies.
  }
}

interface ThemeValue {
  colors: Palette;
  /** What the user picked (may be 'system'). */
  preference: SchemePreference;
  /** What is actually rendered. */
  resolved: 'light' | 'dark';
  setPreference: (pref: SchemePreference) => void;
}

const ThemeContext = createContext<ThemeValue>({
  colors: palettes.light,
  preference: 'system',
  resolved: 'light',
  setPreference: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<SchemePreference>('system');

  useEffect(() => {
    loadPreference().then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
      }
    });
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const resolved: 'light' | 'dark' =
      preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
    return {
      colors: palettes[resolved],
      preference,
      resolved,
      setPreference: (pref) => {
        setPreferenceState(pref);
        void savePreference(pref);
      },
    };
  }, [preference, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/** Shared header/scene theming for nested expo-router Stacks. */
export function useStackTheme() {
  const { colors } = useTheme();
  return {
    headerStyle: { backgroundColor: colors.card },
    headerTintColor: colors.primary,
    headerTitleStyle: { color: colors.text },
    contentStyle: { backgroundColor: colors.bg },
  };
}

/**
 * Themed replacement for module-level `StyleSheet.create`:
 *   const useStyles = themedStyles((colors) => ({ ... }));
 *   ...inside the component: const styles = useStyles();
 */
export function themedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (colors: Palette) => T,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
