import { Platform } from 'react-native';

// SecureStore values live in the iOS Keychain, which survives app deletion —
// so preferences stored there alone cannot tell a fresh install from an
// update. This marker file lives in the app's document directory, which iOS
// wipes on uninstall: marker absent → fresh install (and we create it so
// every later launch, including post-update ones, sees it).
export async function isFreshInstall(): Promise<boolean> {
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
