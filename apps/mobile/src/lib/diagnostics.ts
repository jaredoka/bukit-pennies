import { AppState, Dimensions } from 'react-native';
import { BUILD_NUMBER, DEVICE_MODEL, GIT_SHA, OS_VERSION, PLATFORM } from './buildInfo';
import { kvGetSync, kvSetSync } from './kvStore';

// Consent-gated diagnostics attached to bug reports.
//
// Two rules, and they are the whole design:
//
// 1. Opt-in, default off. Nothing is sent until the switch on
//    Settings > Privacy & diagnostics is on. The value is read synchronously
//    at module load because Sentry's `beforeSend` can fire during startup,
//    before React has rendered a single frame.
// 2. Strict allowlist. This file is the only place a diagnostics payload is
//    built, and it builds exactly the keys the server accepts. Amounts,
//    merchant names, notes, raw SMS text and card digits are not in the list,
//    so they cannot be collected by accident — there is no generic "attach the
//    last screen state" escape hatch.
//
// Breadcrumbs are route names only. They live in memory, are capped, and are
// cleared when consent is switched off.

const CONSENT_KEY = 'bukit.diagnostics_consent';

let consented = kvGetSync(CONSENT_KEY) === 'on';
let breadcrumbs: string[] = [];

const MAX_BREADCRUMBS = 20;
const MAX_BREADCRUMB_LENGTH = 120;

export function getDiagnosticsConsent(): boolean {
  return consented;
}

export function setDiagnosticsConsent(on: boolean): void {
  consented = on;
  kvSetSync(CONSENT_KEY, on ? 'on' : 'off');
  if (!on) breadcrumbs = [];
}

/** Called on every route change from the root layout. */
export function recordScreen(pathname: string | null | undefined): void {
  if (!consented || !pathname) return;
  const route = pathname.split('?')[0].slice(0, MAX_BREADCRUMB_LENGTH);
  if (!route || breadcrumbs[breadcrumbs.length - 1] === route) return;
  breadcrumbs = [...breadcrumbs, route].slice(-MAX_BREADCRUMBS);
}

export interface DiagnosticsExtra {
  locale?: string;
  app_state?: string;
  network?: string;
  screen?: string;
  breadcrumbs?: string[];
}

/**
 * Wire shape. Snake_case because it is posted straight to the `feedback`
 * function, which accepts these keys and drops any it does not know.
 */
export interface DiagnosticsPayload {
  build_number: string | null;
  git_sha: string | null;
  platform: string | null;
  os_version: string | null;
  device_model: string | null;
  route: string | null;
  sentry_event_id: string | null;
  extra: DiagnosticsExtra;
}

function locale(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Null when consent is off. `route` is the screen the user was on when they
 * opened the report form; `sentryEventId` is only set when the report follows
 * an error the app already sent.
 */
export function buildDiagnostics(
  route: string | null | undefined,
  sentryEventId: string | null = null,
): DiagnosticsPayload | null {
  if (!consented) return null;

  const { width, height } = Dimensions.get('window');
  const extra: DiagnosticsExtra = {};
  const loc = locale();
  if (loc) extra.locale = loc;
  if (AppState.currentState) extra.app_state = AppState.currentState;
  extra.screen = `${Math.round(width)}x${Math.round(height)}`;
  if (breadcrumbs.length > 0) extra.breadcrumbs = [...breadcrumbs];

  return {
    build_number: BUILD_NUMBER === 'unknown' ? null : BUILD_NUMBER,
    git_sha: GIT_SHA === 'unknown' ? null : GIT_SHA,
    platform: PLATFORM,
    os_version: OS_VERSION || null,
    device_model: DEVICE_MODEL || null,
    route: route ? route.split('?')[0].slice(0, 200) : null,
    sentry_event_id: sentryEventId,
    extra,
  };
}
