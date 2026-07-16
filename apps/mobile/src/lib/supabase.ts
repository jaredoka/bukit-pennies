import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env';

// expo-secure-store has no web implementation; on web supabase-js falls back
// to its default localStorage adapter.
const nativeStorage =
  Platform.OS === 'web'
    ? undefined
    : (() => {
        const SecureStore = require('expo-secure-store') as typeof import('expo-secure-store');
        return {
          getItem: (key: string) => SecureStore.getItemAsync(key),
          setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
          removeItem: (key: string) => SecureStore.deleteItemAsync(key),
        };
      })();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: nativeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
