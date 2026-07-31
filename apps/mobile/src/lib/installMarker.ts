import { Platform } from 'react-native';

// SecureStore values live in the iOS Keychain, which survives app deletion —
// so preferences stored there alone cannot tell a fresh install from an
// update. This marker file lives in the app's document directory, which iOS
// wipes on uninstall: marker absent → fresh install (and we create it so
// every later launch, including post-update ones, sees it).
//
// Offloading an app is deliberately *not* a fresh install: iOS keeps the data
// container, so the marker is still there when the binary comes back.
async function detectFreshInstall(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    const marker = new File(Paths.document, '.bukit-installed');
    if (marker.exists) return false;
    marker.create();
    return true;
  } catch {
    return false;
  }
}

/**
 * Wraps the detector so that every caller in this process gets the same answer.
 *
 * Detection has a side effect — it creates the marker — so calling it directly
 * from more than one place is first-caller-wins: whoever asks first gets `true`
 * and everybody else gets `false`, silently. That is not hypothetical ordering
 * trivia. `ThemeProvider` asks, and it is a *child* of `SessionProvider`, so
 * React's bottom-up effect order would have handed the theme the only `true`
 * and left the session check believing every launch was an update.
 *
 * Exported separately from `isFreshInstall` so the memoisation can be tested
 * without a device — the detector itself needs expo-file-system.
 */
export function createFreshInstallGate(
  detect: () => Promise<boolean>,
): () => Promise<boolean> {
  let pending: Promise<boolean> | null = null;
  // The promise is cached, not the resolved value, so concurrent callers share
  // one detection rather than racing to create the marker.
  return () => (pending ??= detect());
}

export const isFreshInstall = createFreshInstallGate(detectFreshInstall);
