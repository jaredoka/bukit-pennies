// App entry point.
//
// React Native 0.88 forbids setting its JS-only feature flags after any of them
// has been read, and the renderer reads several while `expo-router/entry`
// initialises. The flags therefore have to be set here, before that import —
// importing them from the root layout is already too late.
import './src/lib/perfFlags';
import 'expo-router/entry';
