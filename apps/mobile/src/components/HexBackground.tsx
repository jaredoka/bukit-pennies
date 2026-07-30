import { useEffect, useState } from 'react';
import { Animated, Easing, useWindowDimensions, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
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

const CLOCK_PERIOD = 360_000;
const clock = new Animated.Value(0);
let currentT = 0;

let clockStarted = false;
function ensureAnimating() {
  if (clockStarted) return;
  clockStarted = true;
  Animated.loop(
    Animated.timing(clock, {
      toValue: CLOCK_PERIOD,
      duration: CLOCK_PERIOD,
      easing: Easing.linear,
      useNativeDriver: false,
    }),
  ).start();
}

/** Progress of each coin at time `t`, still in 0..1 space — the caller scales
 *  to the current viewport so a resize costs no recomputation of the defs. */
function computeState(t: number): { xFrac: number; yFrac: number; drift: [number, number]; r: number; alpha: string }[] {
  return COIN_DEFS.map((c) => {
    const progress = ((t + c.phase * c.period) % c.period) / c.period;
    const opacity = 0.22 * Math.sin(Math.PI * progress);
    const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
    return {
      xFrac: c.startXFrac,
      yFrac: c.startYFrac,
      drift: [c.driftX * progress, c.driftY * progress],
      r: c.r,
      alpha,
    };
  });
}

export function HexBackground() {
  const { colors } = useTheme();
  const fill = colors.primary;
  // Tracks the window rather than snapshotting it, so the field re-lays-out on
  // resize and rotation.
  const { width: W, height: H } = useWindowDimensions();

  const [coins, setCoins] = useState(() => computeState(currentT));

  useEffect(() => {
    ensureAnimating();
    const id = clock.addListener(({ value }) => {
      currentT = value;
      setCoins(computeState(value));
    });
    return () => clock.removeListener(id);
  }, []);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }} pointerEvents="none">
      <Svg width={W} height={H}>
        {coins.map((c, i) => (
          <Circle
            key={i}
            cx={c.xFrac * W + c.drift[0]}
            cy={c.yFrac * H + c.drift[1]}
            r={c.r}
            fill={`${fill}${c.alpha}`}
            stroke={`${fill}${c.alpha}`}
            strokeWidth={2}
          />
        ))}
      </Svg>
    </View>
  );
}
