import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Node-only unit tests over the app's *pure* logic — filter translation, key
// derivation, formatting. There is no React Native runtime here and no attempt
// to render components; anything that needs a device belongs in a manual pass,
// not in `pnpm -r test`.
//
// `react-native` is stubbed rather than installed as a test dependency: the
// modules under test touch it only for `Platform.OS`, and the real package
// cannot be imported outside Metro.
export default defineConfig({
  // Metro injects this; outside it, `if (__DEV__)` is a ReferenceError.
  define: { __DEV__: 'false' },
  resolve: {
    alias: {
      '@': dir('./src'),
      'react-native': dir('./test/stubs/react-native.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
