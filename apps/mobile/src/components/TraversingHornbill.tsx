import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { HornbillMascot } from './HornbillMascot';

// Travel happens only during the hop's airborne frames (idx2–3 of the hop row,
// 150 + 150 ms). Driving the move off the sprite's own frame callback keeps the
// horizontal motion perfectly in step with the animation — the bird advances
// while it hops and holds still on the standing/crouch frames.
const AIR_MS = 300;

interface Props {
  size?: number;
}

// Hops back and forth across the full width of wherever it is placed, turning to
// face its direction of travel at each end.
export function TraversingHornbill({ size = 44 }: Props) {
  const [width, setWidth] = useState(0);

  const x = useRef(new Animated.Value(0)).current;
  const posRef = useRef(0);
  const dirRef = useRef<1 | -1>(1);
  const boundsRef = useRef({ left: 0, right: 0, step: 0 });
  const readyRef = useRef(false);
  const movingRef = useRef(false);
  const [goingRight, setGoingRight] = useState(true);

  useEffect(() => {
    if (!width) return;
    const step = Math.max(12, Math.round(size * 0.55));
    const right = Math.max(0, width - size);
    boundsRef.current = { left: 0, right, step };
    posRef.current = 0;
    x.setValue(0);
    readyRef.current = true;
  }, [width, size, x]);

  // Fires on every frame change; we only act on the takeoff frame of a real hop.
  const handleFrame = ({ frame, blinking }: { frame: number; blinking: boolean }) => {
    if (!readyRef.current || blinking || movingRef.current) return;
    if (frame !== 2) return; // idx2 = launch into the air

    const { left, right, step } = boundsRef.current;
    let next = posRef.current + dirRef.current * step;
    if (next > right) next = right;
    if (next < left) next = left;

    // Already pinned to an edge — turn to face the other way, no travel this hop.
    if (next === posRef.current) {
      dirRef.current = dirRef.current === 1 ? -1 : 1;
      setGoingRight(dirRef.current === 1);
      return;
    }

    movingRef.current = true;
    Animated.timing(x, {
      toValue: next,
      duration: AIR_MS,
      easing: Easing.inOut(Easing.quad), // ease off the ground, decelerate on landing
      useNativeDriver: true,
    }).start(({ finished }) => {
      movingRef.current = false;
      if (!finished) return;
      posRef.current = next;
      if (next >= right && dirRef.current === 1) {
        dirRef.current = -1;
        setGoingRight(false);
      } else if (next <= left && dirRef.current === -1) {
        dirRef.current = 1;
        setGoingRight(true);
      }
    });
  };

  return (
    <View
      style={{ height: size, width: '100%', overflow: 'hidden' }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <Animated.View style={{ position: 'absolute', left: 0, transform: [{ translateX: x }] }}>
          <HornbillMascot
            animation="hop"
            size={size}
            blinkChance={0.3}
            flip={!goingRight}
            onFrame={handleFrame}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
