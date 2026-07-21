import { useEffect, useState } from 'react';
import { Animated, Dimensions, Easing, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { useTheme } from '@/lib/theme';

const { width: W, height: H } = Dimensions.get('window');

interface HexDef {
  startX: number;
  startY: number;
  r: number;
  driftX: number;
  driftY: number;
  period: number;
  phase: number;
}

function randomHex(): HexDef {
  // Random spawn anywhere on screen
  const startX = Math.random() * W;
  const startY = Math.random() * H;
  // Random direction: pick a random angle, travel 80–160px in that direction
  const angle = Math.random() * Math.PI * 2;
  const distance = 80 + Math.random() * 80;
  const driftX = Math.cos(angle) * distance;
  const driftY = Math.sin(angle) * distance;
  const r = 24 + Math.random() * 32;       // radius 24–56px
  const period = 22000 + Math.random() * 18000; // 22–40s per cycle
  const phase = Math.random();              // staggered start
  return { startX, startY, r, driftX, driftY, period, phase };
}

// Generated once at module load — stable across navigations, random each launch
const HEX_DEFS: HexDef[] = Array.from({ length: 10 }, randomHex);

function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = Math.PI / 6 + (i * Math.PI) / 3;
    return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
}

const CLOCK_PERIOD = 360_000;
const clock = new Animated.Value(0);
let currentT = 0; // always holds the latest clock value so new mounts skip t=0

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

function computeHexState(t: number): { points: string; alpha: string }[] {
  return HEX_DEFS.map((h) => {
    const progress = ((t + h.phase * h.period) % h.period) / h.period;
    const cx = h.startX + h.driftX * progress;
    const cy = h.startY + h.driftY * progress;
    // Fade: 0 → peak → 0 over the cycle
    const opacity = 0.28 * Math.sin(Math.PI * progress);
    const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
    return { points: hexPoints(cx, cy, h.r), alpha };
  });
}

export function HexBackground() {
  const { colors } = useTheme();
  const fill = colors.primary;

  const [hexes, setHexes] = useState(() => computeHexState(currentT));

  useEffect(() => {
    ensureAnimating();
    const id = clock.addListener(({ value }) => {
      currentT = value;
      setHexes(computeHexState(value));
    });
    return () => clock.removeListener(id);
  }, []);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      <Svg width={W} height={H}>
        {hexes.map((h, i) => (
          <Polygon
            key={i}
            points={h.points}
            fill={`${fill}${h.alpha}`}
            stroke="none"
          />
        ))}
      </Svg>
    </View>
  );
}
