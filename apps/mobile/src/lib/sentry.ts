import * as Sentry from '@sentry/react-native';
import { SENTRY_DSN } from './env';
import { getDiagnosticsConsent } from './diagnostics';

// Sentry is initialised whenever a DSN exists, but it is *inert until consent*:
// `beforeSend` drops every event while Settings > Privacy & diagnostics is off.
// Gating sends rather than `init` is deliberate — initialising twice at runtime
// is not supported, and consent is read synchronously so the gate is already
// correct for a crash during the first frame.
//
// Scrubbing happens here, not at the call sites. Sentry's automatic
// integrations are the risk: PostgREST URLs carry search terms (merchant
// names), console breadcrumbs can carry anything the app logged, and native
// breadcrumbs record UI text. Only navigation breadcrumbs survive, reduced to
// a path, and the request/extra/user payloads are removed entirely.

function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (breadcrumb.category !== 'navigation') return null;
  const to = typeof breadcrumb.data?.to === 'string' ? breadcrumb.data.to : breadcrumb.message;
  const route = typeof to === 'string' ? to.split('?')[0].slice(0, 200) : '';
  if (!route) return null;
  return {
    category: 'navigation',
    level: breadcrumb.level,
    timestamp: breadcrumb.timestamp,
    message: route,
  };
}

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  // Nothing here is needed to fix a bug, and any of it can carry user content.
  delete event.user;
  delete event.request;
  delete event.extra;

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((crumb): crumb is Sentry.Breadcrumb => crumb !== null);
  }

  if (event.contexts) {
    const allowed = ['app', 'device', 'os', 'runtime', 'trace'];
    event.contexts = Object.fromEntries(
      Object.entries(event.contexts).filter(([key]) => allowed.includes(key)),
    );
  }

  // expo-router puts route params in the transaction name; strip the query.
  if (typeof event.transaction === 'string') {
    event.transaction = event.transaction.split('?')[0];
  }

  return event;
}

export function initSentry() {
  if (!SENTRY_DSN) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    enabled: !__DEV__,
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
    beforeSend(event) {
      if (!getDiagnosticsConsent()) return null;
      return scrubEvent(event);
    },
    beforeBreadcrumb(breadcrumb) {
      if (!getDiagnosticsConsent()) return null;
      return scrubBreadcrumb(breadcrumb);
    },
  });
}

export { Sentry };
