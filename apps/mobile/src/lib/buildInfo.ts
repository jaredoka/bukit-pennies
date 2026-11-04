import Constants from 'expo-constants';
import { Platform } from 'react-native';

// The identity of the binary that is running, not of the JS bundle.
//
// Until this existed, `app_version` was `Constants.expoConfig.version`, which
// was the literal string "0.2.0" for every build ever produced. A report could
// not be tied to a commit, so the automated triage loop had nothing to read a
// stack trace against and no way to tell a fixed build from an unfixed one.
//
// `buildNumber` is CFBundleVersion, set from the commit count by
// `app.config.ts`; `gitSha` rides in `extra` because Expo has no first-class
// slot for it. Both fall back to the env var CI sets, then to "unknown", so a
// local JS-only run still produces a valid report.

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;

function fromExtra(key: string): string | null {
  const value = extra[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export const APP_VERSION = Constants.expoConfig?.version ?? 'unknown';

export const BUILD_NUMBER =
  Constants.expoConfig?.ios?.buildNumber ?? fromExtra('buildNumber') ?? 'unknown';

export const GIT_SHA = fromExtra('gitSha') ?? 'unknown';

export const PLATFORM = Platform.OS;

export const OS_VERSION =
  Platform.OS === 'ios'
    ? (Constants.platform?.ios?.systemVersion ?? '')
    : Platform.OS === 'android'
      ? (Constants.platform?.android?.version ?? '')
      : '';

export const DEVICE_MODEL =
  Platform.OS === 'ios'
    ? (Constants.platform?.ios?.model ?? '')
    : Platform.OS === 'android'
      ? (Constants.platform?.android?.model ?? '')
      : '';

/** "0.2.0 (42)" — for the report screen and the About row. */
export const VERSION_LABEL = BUILD_NUMBER === 'unknown'
  ? APP_VERSION
  : `${APP_VERSION} (${BUILD_NUMBER})`;
