/**
 * Performance flags pinned for React Native 0.88.
 *
 * 0.88 replaced the renderer's plugin-based event system with W3C EventTarget
 * dispatching. It is the largest runtime change in the release, and every
 * touch, scroll and key event now takes that path. On this app it costs frame
 * time on interactions that were smooth on 0.86. The legacy path still ships in
 * 0.88 behind a JS-only flag, so pin it and re-evaluate when the follow-up
 * release removes the choice.
 *
 * The flag is read lazily, on the first event the renderer dispatches, so
 * setting it here at startup (before any user interaction) is early enough.
 */
const { override } = require('rn-internal-feature-flags') as {
  override: (flags: Record<string, () => unknown>) => void;
};

override({
  enableNativeEventTargetEventDispatching: () => false,
});
