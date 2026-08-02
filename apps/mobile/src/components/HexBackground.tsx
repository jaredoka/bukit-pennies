import { useEffect } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTheme } from '@/lib/theme';

interface CoinDef {
  /** Start position as a 0..1 fraction of the viewport, not a pixel count:
   *  the coins are laid out against whatever size the window is *now*.
   *  Reading `Dimensions.get('window')` once at module load meant they kept
   *  the width the page happened to open at, so they never repositioned on a
   *  resize or a device rotation. */
  startXFrac: number;
  startYFrac: number;
  r: number;
  driftX: number;
  driftY: number;
  period: number;
  phase: number;
}

function randomCoin(): CoinDef {
  const startXFrac = Math.random();
  const startYFrac = Math.random();
  const angle = Math.random() * Math.PI * 2;
  const distance = 60 + Math.random() * 80;
  const driftX = Math.cos(angle) * distance;
  const driftY = Math.sin(angle) * distance;
  const r = 8 + Math.random() * 14;
  const period = 20000 + Math.random() * 20000;
  const phase = Math.random();
  return { startXFrac, startYFrac, r, driftX, driftY, period, phase };
}

const COIN_DEFS: CoinDef[] = Array.from({ length: 14 }, randomCoin);

const PEAK_OPACITY = 0.22;

/**
 * One driver per coin, holding its progress through its own cycle in 0..1.
 *
 * Module-level, like the single clock that preceded them, so a coin's progress
 * survives the component unmounting: whichever screen mounts the field next
 * picks the coins up exactly where they had drifted to, rather than restarting
 * them at their origins.
 */
const COIN_PROGRESS = COIN_DEFS.map((c) => new Animated.Value(c.phase));

let started = false;

/**
 * Starts every coin's loop, once per app run.
 *
 * The first leg is short — it carries a coin from wherever its random phase
 * dropped it to the end of that cycle — and only then does the full-period
 * loop take over. Without that the loops would all start at 0 together and the
 * whole field would pulse in unison.
 */
function ensureAnimating() {
  if (started) return;
  started = true;
  COIN_DEFS.forEach((c, i) => {
    const progress = COIN_PROGRESS[i];
    const cycle = () =>
      Animated.loop(
        Animated.timing(progress, {
          toValue: 1,
          duration: c.period,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    Animated.timing(progress, {
      toValue: 1,
      duration: c.period * (1 - c.phase),
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(() => {
      // `finished` is deliberately ignored. The first leg can be interrupted —
      // this field lives in the auth layout, and a quick sign-in unmounts the
      // whole group while some coins are still on their opening drift, which
      // fires this callback with `finished: false`. Bailing there would leave
      // `started` true and the coin frozen for the rest of the app run. The
      // jump to 0 is invisible either way: it happens after the view is gone
      // (or, completed, while the coin's opacity is already at 0), and the
      // module-level loop keeps driving the same value while unmounted.
      progress.setValue(0);
      cycle();
    });
  });
}

/**
 * The drifting coin field behind the auth screens.
 *
 * Mounted once per auth screen, behind that screen's own card. (It lived behind
 * the whole stack for a while — mounted once by `app/(auth)/_layout.tsx` — but
 * native-stack paints an opaque screen container over anything behind it, so
 * the coins vanished on device and the transparent screens cost compositing
 * every frame. Each screen painting its own `colors.bg` and mounting the field
 * above it keeps both cheap and visible.) The drivers are module-level, so the
 * progress survives each screen unmounting and every mount picks the coins up
 * exactly where they had drifted to.
 *
 * Every coin animates on the **native driver**: a static `left`/`top` for where
 * it starts and an animated `transform` for its drift, because the native
 * driver can move a transform but not a layout property. The version before
 * this one ran a JS clock that called `setState` on every frame and re-rendered
 * fourteen SVG circles each time — which is exactly the work that stutters
 * while the JS thread is busy building the next screen, so the coins hitched
 * during the very transitions this is meant to glide through. Nothing here
 * touches JS per frame now.
 *
 * A coin is a plain rounded `View` rather than an `<Svg><Circle/></Svg>`: the
 * original drew a filled circle stroked in its own colour, which is a disc of
 * radius `r + strokeWidth / 2` and nothing a border radius cannot do.
 */
export function HexBackground() {
  const { colors } = useTheme();
  // Tracks the window rather than snapshotting it, so the field re-lays-out on
  // resize and rotation.
  const { width: W, height: H } = useWindowDimensions();

  useEffect(() => {
    ensureAnimating();
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      {COIN_DEFS.map((c, i) => {
        const progress = COIN_PROGRESS[i];
        const size = (c.r + 1) * 2;
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: c.startXFrac * W - size / 2,
              top: c.startYFrac * H - size / 2,
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: colors.primary,
              // Fades in and back out across the cycle, so the jump from the
              // end of one cycle to the start of the next happens while the
              // coin is invisible. Four segments approximating the sine the JS
              // version computed per frame.
              opacity: progress.interpolate({
                inputRange: [0, 0.25, 0.5, 0.75, 1],
                outputRange: [
                  0,
                  PEAK_OPACITY * Math.SQRT1_2,
                  PEAK_OPACITY,
                  PEAK_OPACITY * Math.SQRT1_2,
                  0,
                ],
              }),
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, c.driftX],
                  }),
                },
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, c.driftY],
                  }),
                },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
