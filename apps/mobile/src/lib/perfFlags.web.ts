/**
 * Web shim for `perfFlags`.
 *
 * The native file pins a React Native 0.88 feature flag, but importing that
 * module evaluates native flag getters at load time. Each getter goes through
 * TurboModuleRegistry, which needs a bridge: on web the getter throws
 * `__fbBatchedBridgeConfig is not set` before React ever mounts.
 *
 * React Native Web has no renderer to pin, so the override is simply skipped
 * here. Metro resolves `.web.ts` ahead of `.ts`, so iOS and Android keep the
 * pinned event path from `perfFlags.ts`.
 */
export {};
