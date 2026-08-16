import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  Keyboard,
  Platform,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const REST_MARGIN = 16;

type KeyboardEventName = 'keyboardWillShow' | 'keyboardDidShow' | 'keyboardWillHide' | 'keyboardDidHide';

/**
 * Keeps its children vertically centred and glides them up to rest just above
 * the keyboard when one appears — the PayPal/Revolut login pattern — then back
 * down to centre when it dismisses. The move is animated in sync with the
 * keyboard so it reads as the form lifting onto the keyboard, not as the page
 * being pushed up (which is what shrinking a centred container via
 * KeyboardAvoidingView padding does).
 *
 * The group only moves when it would otherwise be covered: the target position
 * leaves a small margin above the keyboard, and on short screens where the
 * group is taller than the space the keyboard leaves it clamps to the top
 * instead of clipping.
 *
 * No-op on web (no overlay keyboard to avoid) and effectively a no-op on
 * Android (the window resizes instead).
 */
export function KeyboardGlide({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const { height: windowH } = useWindowDimensions();
  const windowHRef = useRef(windowH);
  windowHRef.current = windowH;
  const groupH = useRef(0);
  const keyboardH = useRef(0);

  function glide() {
    const K = keyboardH.current;
    const G = groupH.current;
    let target = 0;
    if (K > 0 && G > 0) {
      const restTop = Math.max(0, windowHRef.current - K - G - REST_MARGIN);
      const centerTop = (windowHRef.current - G) / 2;
      target = restTop - centerTop;
    }
    Animated.spring(translateY, { toValue: target, useNativeDriver: true, speed: 16, bounciness: 0 }).start();
  }

  useEffect(() => {
    const showEvent: KeyboardEventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent: KeyboardEventName = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      keyboardH.current = e.endCoordinates.height;
      glide();
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      keyboardH.current = 0;
      glide();
    });
    return () => {
      show.remove();
      hide.remove();
    };
    // Mount once; everything read inside glide() is a ref, so no stale state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-glide if the window size changes while the keyboard is open (rotation).
  useEffect(() => {
    if (keyboardH.current > 0) glide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowH]);

  function measure(e: LayoutChangeEvent) {
    groupH.current = e.nativeEvent.layout.height;
    if (keyboardH.current > 0) glide();
  }

  return (
    <Animated.View style={[style, { transform: [{ translateY }] }]}>
      <View onLayout={measure}>{children}</View>
    </Animated.View>
  );
}