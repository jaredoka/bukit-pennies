import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform, StyleSheet, useColorScheme } from 'react-native';

// Default category colours per theme. User-chosen colours stored in the DB
// override these entirely and are never affected by theme switching.
export const CATEGORY_COLORS: Record<'light' | 'dark', string[]> = {
  // Rich, saturated hues that pop on white backgrounds — hues spread far apart
  light: [
    '#D6336C', // Pink
    '#1971C2', // Blue
    '#2F9E44', // Green
    '#F76707', // Orange
    '#7048E8', // Violet
    '#0C8599', // Teal
    '#E8B004', // Golden yellow
    '#A61E4D', // Wine
    '#5C940D', // Olive
    '#3B5BDB', // Indigo
  ],
  // Bright, luminous hues that glow on dark backgrounds — hues spread far apart
  dark: [
    '#FF6B6B', // Coral red
    '#4DABF7', // Sky blue
    '#69DB7C', // Mint green
    '#FFD43B', // Yellow
    '#DA77F2', // Orchid
    '#3BC9DB', // Cyan
    '#FFA94D', // Peach
    '#B197FC', // Periwinkle
    '#A9E34B', // Chartreuse
    '#F783AC', // Rose
  ],
};
export const CATEGORY_COLOR_OTHER: Record<'light' | 'dark', string> = {
  light: '#868E96',
  dark: '#ADB5BD',
};

// Two tone sets. Light: white + bright yellow. Dark: navy + neon blue.
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
    bg: '#FFFFFF',
    card: '#FAFAFA',
    text: '#1A2430',
    muted: '#6B7A8C',
    primary: '#E6AC00',       // bright yellow
    onPrimary: '#1A1200',     // near-black for legibility on yellow
    danger: '#C0392B',
    warning: '#B7791F',
    border: '#E8E8E8',
    chartCategories: CATEGORY_COLORS.light,
    chartOther: CATEGORY_COLOR_OTHER.light,
  },
  dark: {
    bg: '#0C1219',
    card: '#161F2A',
    text: '#E6EBF1',
    muted: '#8B9AAB',
    primary: '#00B4FF',
    onPrimary: '#001A2E',
    danger: '#E2604F',
    warning: '#D99C42',
    border: '#263240',
    chartCategories: CATEGORY_COLORS.dark,
    chartOther: CATEGORY_COLOR_OTHER.dark,
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
