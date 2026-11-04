import type { ConfigContext, ExpoConfig } from 'expo/config';
import { execSync } from 'node:child_process';

// Release identity for every build.
//
// Before this file existed, `version` was "0.2.0" for every binary ever made
// and iOS's CFBundleVersion came from whatever EAS defaulted to. A bug report
// said "0.2.0" and could not be matched to a commit, so the automated triage
// loop could not tell whether a fix had shipped. `buildNumber` is now the git
// commit count (monotonic, unique per build without a human bumping it) and
// `gitSha` identifies the exact source.
//
// CI exports BUKIT_BUILD_NUMBER and BUKIT_GIT_SHA after fetching full history;
// a local `expo start` falls back to git directly.

function git(command: string, fallback: string): string {
  try {
    const out = execSync(`git ${command}`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    return out || fallback;
  } catch {
    return fallback;
  }
}

const gitSha = process.env.BUKIT_GIT_SHA || git('rev-parse --short HEAD', 'unknown');
const buildNumber = process.env.BUKIT_BUILD_NUMBER || git('rev-list --count HEAD', '1');
const buildCode = Number.parseInt(buildNumber, 10);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Bukit Pennies',
  slug: 'bukit-pennies',
  scheme: 'bukitpennies',
  version: config.version ?? '0.2.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    ...config.ios,
    supportsTablet: false,
    bundleIdentifier: 'com.bukitpennies.app',
    buildNumber,
  },
  android: {
    ...config.android,
    package: 'com.bukitpennies.app',
    // Android versionCode must be a positive integer; a git count always is,
    // but keep a floor so a shallow clone without history still builds.
    versionCode: Number.isFinite(buildCode) && buildCode > 0 ? buildCode : 1,
  },
  // Consumed at runtime by src/lib/buildInfo.ts via Constants.expoConfig.extra.
  extra: {
    ...config.extra,
    gitSha,
    buildNumber,
  },
});
