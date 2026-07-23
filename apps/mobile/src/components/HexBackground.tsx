import { useEffect, useState } from 'react';
import { Animated, Dimensions, Easing, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/lib/theme';

const { width: W, height: H } = Dimensions.get('window');

interface CoinDef {
  startX: number;
  startY: number;
  r: number;
  driftX: number;
  driftY: number;
  period: number;
  phase: number;
}

function randomCoin(): CoinDef {
  const startX = Math.random() * W;
  const startY = Math.random() * H;
  const angle = Math.random() * Math.PI * 2;
  const distance = 60 + Math.random() * 80;
  const driftX = Math.cos(angle) * distance;
  const driftY = Math.sin(angle) * distance;
  const r = 8 + Math.random() * 14;
  const period = 20000 + Math.random() * 20000;
  const phase = Math.random();
  return { startX, startY, r, driftX, driftY, period, phase };
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

function computeState(t: number): { cx: number; cy: number; r: number; alpha: string }[] {
  return COIN_DEFS.map((c) => {
    const progress = ((t + c.phase * c.period) % c.period) / c.period;
    const cx = c.startX + c.driftX * progress;
    const cy = c.startY + c.driftY * progress;
    const opacity = 0.22 * Math.sin(Math.PI * progress);
    const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
    return { cx, cy, r: c.r, alpha };
  });
}

export function HexBackground() {
  const { colors } = useTheme();
  const fill = colors.primary;

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
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      <Svg width={W} height={H}>
        {coins.map((c, i) => (
          <Circle
            key={i}
            cx={c.cx}
            cy={c.cy}
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
