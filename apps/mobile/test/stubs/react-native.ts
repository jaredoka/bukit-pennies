/**
 * Minimal stand-in for `react-native` under vitest (see vitest.config.ts).
 *
 * Reporting `OS: 'web'` puts kvStore on its localStorage branch, which is the
 * one Node can actually run — expo-secure-store is a native module. The
 * SecureStore key rules are asserted directly in the tests instead, since that
 * branch cannot be executed here and it is the one that broke.
 */
export const Platform = { OS: 'web' as const };
