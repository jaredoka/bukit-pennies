import { useEffect, useRef, useState } from 'react';
import { Image, Platform, View } from 'react-native';

const SHEET_COLS = 6;
const SHEET_ROWS = 9;
// Transparent gutter between sprite-sheet cells, as a fraction of the cell.
// Must match GUTTER / (G*SCALE) in art/scripts/hornbill_animate.py (16 / 256).
const GUTTER_FRAC = 16 / 256;

const ANIMATIONS = {
  idle:        { row: 0, frames: 4, durations: [120, 120, 120, 120] },
  blink:       { row: 1, frames: 6, durations: [80, 80, 80, 80, 80, 80] },
  head:        { row: 2, frames: 6, durations: [120, 120, 120, 120, 120, 120] },
  tail:        { row: 3, frames: 6, durations: [100, 100, 100, 100, 100, 100] },
  preen:       { row: 5, frames: 6, durations: [400, 150, 120, 300, 150, 500] },
  hop:         { row: 6, frames: 6, durations: [400, 80, 150, 150, 80, 400] },
  bob:         { row: 7, frames: 6, durations: [90, 90, 90, 90, 90, 90] },
  look_around: { row: 8, frames: 6, durations: [500, 150, 600, 400, 600, 150] },
} as const;

type AnimationName = keyof typeof ANIMATIONS;

interface Props {
  animation: AnimationName;
  size?: number;
  flip?: boolean;
  blinkChance?: number;
  /** When true, a triggered blink plays twice (a quick double-blink). */
  doubleBlink?: boolean;
  /** Called whenever the displayed frame changes (frame index + whether a blink
      is currently playing). Lets a parent sync motion to the sprite's frames. */
  onFrame?: (info: { frame: number; blinking: boolean }) => void;
}

export function HornbillMascot({ animation, size = 96, flip = false, blinkChance = 0, doubleBlink = false, onFrame }: Props) {
  const [frame, setFrame] = useState(0);
  const [activeRow, setActiveRow] = useState(ANIMATIONS[animation].row);

  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    const mainDef = ANIMATIONS[animation];
    const blinkDef = ANIMATIONS.blink;
    setFrame(0);
    setActiveRow(mainDef.row);
    onFrameRef.current?.({ frame: 0, blinking: false });

    let current = 0;
    let blinking = false;
    let blinkRepeatsLeft = 0; // extra blink cycles queued after the current one
    let id: ReturnType<typeof setTimeout>;

    const tick = () => {
      const def = blinking ? blinkDef : mainDef;
      const next = (current + 1) % def.frames;

      if (next === 0 && !blinking && blinkChance > 0 && Math.random() < blinkChance) {
        blinking = true;
        blinkRepeatsLeft = doubleBlink ? 1 : 0;
        current = 0;
        setFrame(0);
        setActiveRow(blinkDef.row);
        onFrameRef.current?.({ frame: 0, blinking: true });
        id = setTimeout(tick, blinkDef.durations[0]);
      } else if (next === 0 && blinking && blinkRepeatsLeft > 0) {
        blinkRepeatsLeft -= 1;
        current = 0;
        setFrame(0);
        setActiveRow(blinkDef.row);
        onFrameRef.current?.({ frame: 0, blinking: true });
        id = setTimeout(tick, blinkDef.durations[0]);
      } else if (next === 0 && blinking) {
        blinking = false;
        current = 0;
        setFrame(0);
        setActiveRow(mainDef.row);
        onFrameRef.current?.({ frame: 0, blinking: false });
        id = setTimeout(tick, mainDef.durations[0]);
      } else {
        current = next;
        setFrame(next);
        onFrameRef.current?.({ frame: next, blinking });
        id = setTimeout(tick, def.durations[next]);
      }
    };

    id = setTimeout(tick, mainDef.durations[0]);
    return () => clearTimeout(id);
  }, [animation, blinkChance, doubleBlink]);

  // Web: pixelated rendering prevents bilinear filtering from creating grey fringing
  // around transparent sprite sheet edges.
  const webImageStyle = Platform.OS === 'web'
    ? ({ imageRendering: 'pixelated' } as object)
    : {};

  // Cell stride including the transparent gutter baked into the sheet.
  const pitch = size * (1 + GUTTER_FRAC);

  return (
    <View style={{
      width: size,
      height: size,
      overflow: 'hidden',
      backgroundColor: 'transparent',
      ...(flip ? { transform: [{ scaleX: -1 as const }] } : {}),
    }}>
      <Image
        source={require('@/assets/hornbill_sheet.png')}
        style={{
          width: SHEET_COLS * pitch,
          height: SHEET_ROWS * pitch,
          position: 'absolute',
          left: -frame * pitch,
          top: -activeRow * pitch,
          backgroundColor: 'transparent',
          ...webImageStyle,
        }}
        resizeMode="stretch"
      />
    </View>
  );
}
