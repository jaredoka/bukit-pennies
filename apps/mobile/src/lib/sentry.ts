import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';
import { SENTRY_DSN } from './env';

export function initSentry() {
  if (!SENTRY_DSN) return;
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    enabled: !__DEV__,
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
    beforeSend(event) {
      if (Platform.OS === 'web') return null;
      return event;
    },
  });
}

export { Sentry };
