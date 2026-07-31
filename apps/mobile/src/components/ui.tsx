import React, { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type TextInputProps,
} from 'react-native';
// Deep import, like every other call site: the '@expo/vector-icons' barrel
// drags in the glyph map of every family (FontAwesome, MaterialCommunity, …),
// which is ~1 MB of names nothing here renders.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, type Href } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { DAY_KEY_RE, TIME_RE, dayKeyOf, monthGrid, stepMonth } from '@/lib/calendar';
import { bruneiDayKey, bruneiParts, formatDayDate } from '@/lib/format';
import { themedStyles, useTheme } from '@/lib/theme';

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const WHEEL_ITEM_H = 44;

// Compatibility export removed: colors are themed now — use useTheme() or
// themedStyles() from '@/lib/theme'.

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  const styles = useStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.title}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.muted}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  style?: import('react-native').ViewStyle;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        (pressed || disabled || busy) && { opacity: 0.6 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.primary : colors.onPrimary} />
      ) : (
        <Text style={[styles.buttonLabel, variant === 'secondary' && { color: colors.primary }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const styles = useStyles();
  const { colors, resolved } = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        keyboardAppearance={resolved}
        style={[styles.input, style]}
        {...rest}
      />
    </View>
  );
}

export function Badge({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'success' | 'warning' | 'danger' }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const toneColor =
    tone === 'success' ? colors.primary : tone === 'warning' ? colors.warning : tone === 'danger' ? colors.danger : colors.muted;
  return (
    <View style={[styles.badge, { borderColor: toneColor }]}>
      <Text style={{ color: toneColor, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.centered}>{children}</View>;
}

/**
 * A settings row that navigates: icon, label, sub-label, chevron.
 *
 * Three byte-identical copies of this lived in `settings/index.tsx`,
 * `settings/spending.tsx` and `settings/capture.tsx`, each with its own
 * identical `row` and `rowLabel` style block — so a change to how a settings
 * row looks had to be made in three files, and was twice made in fewer. The
 * only real difference was the `danger` variant on the index screen, which is
 * a prop here.
 */
export function NavRow({
  href,
  icon,
  label,
  note,
  danger,
  inset,
}: {
  href: Href;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  note: string;
  danger?: boolean;
  /** For a row in a bare grouped container (the Settings index) rather than
   *  inside a `Card`. A Card already pads its contents by 16, so the default
   *  adds no horizontal padding of its own — setting it in both places is what
   *  double-indents the row. */
  inset?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const accent = danger ? colors.danger : colors.primary;
  return (
    <Link href={href} asChild>
      {/* One resolved style object, never an array. This Pressable is the direct
          child of `Link asChild`, which expo-router renders through a `Slot`,
          and a Slot refuses an array of styles on its child — it throws
          "[expo-router]: You are passing an array of styles to a child of
          <Slot>" and takes the whole screen down. The two variants are
          therefore complete styles that are chosen between, not merged. */}
      <Pressable style={inset ? styles.navRowInset : styles.navRow}>
        <Ionicons name={icon} size={22} color={accent} style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.navRowLabel, danger && { color: colors.danger }]}>{label}</Text>
          <Muted>{note}</Muted>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    </Link>
  );
}

/** Selectable pill used for filters and option pickers. */
export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={active ? styles.chipActiveText : styles.chipText}>{label}</Text>
    </Pressable>
  );
}

function snapScroll(
  ref: RefObject<ScrollView | null>,
  y: number,
  count: number,
  lastIdx: React.MutableRefObject<number>,
  onSelect: (i: number) => void,
) {
  const idx = Math.max(0, Math.min(Math.round(y / WHEEL_ITEM_H), count - 1));
  ref.current?.scrollTo({ y: idx * WHEEL_ITEM_H, animated: true });
  lastIdx.current = idx;
  onSelect(idx);
}

/**
 * Scroll-snap wheel picker. `visibleCount` rows are shown (default 5, must be
 * odd); the middle row is the selected item.
 *
 * Snapping is handled entirely in JS (no snapToInterval) so it works reliably
 * inside Modals on both iOS and Android.
 */
export function WheelPicker({
  items,
  selectedIndex,
  onSelect,
  visibleCount = 5,
}: {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  visibleCount?: number;
}) {
  const { colors } = useTheme();
  const ref = useRef<ScrollView>(null);
  const lastIdx = useRef(selectedIndex);
  // Debounce timer — fires 120ms after the last scroll event on any platform.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pad = WHEEL_ITEM_H * Math.floor(visibleCount / 2);

  // Where the wheel starts. Positioned declaratively via `contentOffset` and
  // again from `onContentSizeChange` below, rather than by a timer sized to
  // outlast the sheet animation — the wheel used to sit on the wrong row for
  // 350ms after the sheet had already arrived, which is exactly the moment you
  // are looking at it. `initialOffset` is captured once, on purpose: later
  // changes to selectedIndex belong to the sync effect.
  const initialOffset = useRef(selectedIndex * WHEEL_ITEM_H).current;
  const positioned = useRef(false);

  // Sync when selectedIndex changes externally (e.g. reset).
  useEffect(() => {
    if (lastIdx.current !== selectedIndex) {
      ref.current?.scrollTo({ y: selectedIndex * WHEEL_ITEM_H, animated: true });
      lastIdx.current = selectedIndex;
    }
  }, [selectedIndex]);

  const opaque = hexToRgba(colors.card, 1);
  const clear = hexToRgba(colors.card, 0);

  return (
    <View style={{ height: WHEEL_ITEM_H * visibleCount, overflow: 'hidden' }}>
      {/* Selection band */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: pad,
          left: 0,
          right: 0,
          height: WHEEL_ITEM_H,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          zIndex: 2,
        }}
      />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        contentOffset={{ x: 0, y: initialOffset }}
        contentContainerStyle={{ paddingTop: pad, paddingBottom: pad }}
        // Belt and braces for `contentOffset`, which platforms honour
        // inconsistently. Fires as soon as the rows have been measured, which
        // is what the old timer was really waiting for. Guarded so a later
        // change to `items` — the Insights year list grows once its query
        // lands — does not yank the wheel back to where it started.
        onContentSizeChange={(_w, h) => {
          if (positioned.current || h <= 0) return;
          positioned.current = true;
          ref.current?.scrollTo({ y: initialOffset, animated: false });
        }}
        // Universal: debounce every scroll event. Works on web (no
        // onMomentumScrollEnd) and on native iOS/Android alike.
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          if (debounce.current) clearTimeout(debounce.current);
          debounce.current = setTimeout(
            () => snapScroll(ref, y, items.length, lastIdx, onSelect),
            120,
          );
        }}
      >
        {items.map((label, i) => (
          <Pressable
            key={i}
            onPress={() => snapScroll(ref, i * WHEEL_ITEM_H, items.length, lastIdx, onSelect)}
            style={{ height: WHEEL_ITEM_H, justifyContent: 'center', alignItems: 'center' }}
          >
            <Text
              style={{
                fontSize: 16,
                color: i === selectedIndex ? colors.text : colors.muted,
                fontWeight: (i === selectedIndex ? '600' : '400') as '600' | '400',
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {/* Fade overlays */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: pad, zIndex: 1 }}>
        <LinearGradient colors={[opaque, clear]} style={StyleSheet.absoluteFill} />
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: pad, zIndex: 1 }}>
        <LinearGradient colors={[clear, opaque]} style={StyleSheet.absoluteFill} />
      </View>
    </View>
  );
}

/** Bottom-sheet modal wrapper for wheel pickers and other compact dialogs. */
/**
 * How long a Modal's slide takes. React Native does not expose the duration,
 * so anything that has to outlast an exit animation is timed against this.
 */
export const SHEET_ANIM_MS = 300;

/**
 * Keeps the last non-null value alive for `SHEET_ANIM_MS` after it clears, so
 * a conditionally-rendered sheet stays mounted long enough to animate out.
 *
 * Deferring the unmount rather than removing it is deliberate: unmounting is
 * what resets a sheet's internal state — pasted text, capture results, which
 * sub-view it was showing — and callers rely on reopening a clean sheet.
 */
export function useSheetPresence<T>(value: T | null): T | null {
  const [rendered, setRendered] = useState<T | null>(value);
  useEffect(() => {
    if (value !== null) {
      setRendered(value);
      return;
    }
    const timer = setTimeout(() => setRendered(null), SHEET_ANIM_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return rendered;
}

/**
 * Bottom-sheet chrome: an instant dim plus a panel that slides up under it.
 *
 * Exactly **one** Modal. The previous version stacked two — a fading one for
 * the dim and a sliding one for the panel — so that the dim could appear at
 * once while only the panel moved. iOS cannot do that: a view controller
 * presents one modal at a time, so the second present() is dropped on the
 * floor. What shipped was a grey screen with no panel, no dismiss area and no
 * reachable `onRequestClose` — every filter and the Add button froze the app
 * until it was force-quit.
 *
 * So the panel is animated here instead of by the platform. The hand-rolled
 * version that predated the two-Modal split was slow because it started its
 * slide from a `useEffect` after mounting offscreen at full screen height:
 * tap, dead pause, long travel. This one measures the panel on layout and
 * slides it exactly its own height, on the native driver — no dead distance,
 * and the dim is at full strength on the first frame.
 *
 * `visible` going false animates out and *then* unmounts the Modal, so callers
 * get the exit animation whether or not they gate rendering with
 * `useSheetPresence` (which exists to reset sheet state, not to animate).
 */
export function SheetShell({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const styles = useStyles();
  const screenH = Dimensions.get('window').height;
  // Held open across the exit animation, then released.
  const [mounted, setMounted] = useState(visible);
  // Starts a full screen down: wherever the panel turns out to sit, it is
  // offscreen until the first layout tells us its real height.
  const y = useRef(new Animated.Value(screenH)).current;
  const dim = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const panelH = useRef(screenH);
  const entered = useRef(false);
  // Read by the exit callback, which can land after a reopen.
  const visibleRef = useRef(visible);

  useEffect(() => {
    visibleRef.current = visible;
    y.stopAnimation();
    dim.stopAnimation();
    if (visible) {
      entered.current = false;
      y.setValue(screenH);
      dim.setValue(1);
      setMounted(true);
      return;
    }
    Animated.parallel([
      Animated.timing(y, {
        toValue: panelH.current,
        duration: SHEET_ANIM_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(dim, {
        toValue: 0,
        duration: SHEET_ANIM_MS,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      // Reopening within the 300ms exit interrupts this; unmounting then would
      // tear down the sheet the user just asked for.
      if (finished && !visibleRef.current) setMounted(false);
    });
  }, [visible, screenH, y, dim]);

  // Every layout updates the exit distance (a sheet can grow — the capture
  // sheet sprouts results); only the first one starts the entrance.
  function onPanelLayout(e: LayoutChangeEvent) {
    const h = e.nativeEvent.layout.height;
    if (h <= 0) return;
    panelH.current = h;
    if (entered.current) return;
    entered.current = true;
    y.setValue(h);
    Animated.timing(y, {
      toValue: 0,
      duration: SHEET_ANIM_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  if (!mounted && !visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.sheetSlide}>
        <Animated.View
          pointerEvents="none"
          style={[styles.sheetOverlay, StyleSheet.absoluteFill, { opacity: dim }]}
        />
        <Pressable style={styles.sheetDismissArea} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View onLayout={onPanelLayout} style={{ transform: [{ translateY: y }] }}>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Standard sheet: handle, optional title and Clear, content, Done. */
export function Sheet({
  visible,
  onClose,
  title,
  onClear,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  onClear?: () => void;
  children: ReactNode;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <SheetShell visible={visible} onClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        {title || onClear ? (
          <View style={[styles.sheetHeader, !onClear && { justifyContent: 'center' }]}>
            {title ? <Text style={styles.sheetTitle}>{title}</Text> : null}
            {onClear ? (
              <Pressable onPress={onClear} hitSlop={8}>
                <Text style={{ color: colors.danger, fontWeight: '600' }}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {children}
        <Button label="Done" onPress={onClose} />
      </View>
    </SheetShell>
  );
}

// ---- Date and time pickers --------------------------------------------------

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * Single-date calendar sheet. The range-picking sibling on the transactions
 * screen stays separate — this one exists for the several places that need one
 * date and used to make people type `YYYY-MM-DD` by hand.
 *
 * Tapping a day commits and closes: with one date to choose there is nothing
 * left to do, and a Done tap you cannot skip is friction. Clear is on the
 * header (and on the trigger below) because an optional date the user cannot
 * un-set is a trap.
 */
export function DateSheet({
  visible,
  value,
  onChange,
  onClose,
  title = 'Pick a date',
}: {
  visible: boolean;
  /** 'YYYY-MM-DD', or '' for unset. */
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
  title?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const todayKey = bruneiDayKey(Date.now());

  // Opens on the selected month, else on today's.
  const initial = DAY_KEY_RE.test(value) ? value : todayKey;
  const [viewYear, setViewYear] = useState(Number(initial.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(Number(initial.slice(5, 7)) - 1);

  const weeks = useMemo(() => monthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  function step(months: number) {
    const next = stepMonth(viewYear, viewMonth, months);
    setViewYear(next.year);
    setViewMonth(next.month);
  }

  function pick(day: number) {
    onChange(dayKeyOf(viewYear, viewMonth, day));
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      onClear={value ? () => { onChange(''); onClose(); } : undefined}
    >
      <View style={styles.calNav}>
        <Pressable onPress={() => setViewYear((y) => y - 1)} hitSlop={12} style={styles.calNavYearBtn}>
          <Ionicons name="chevron-back" size={14} color={colors.muted} />
          <Ionicons name="chevron-back" size={14} color={colors.muted} style={{ marginLeft: -8 }} />
        </Pressable>
        <View style={styles.calNavCenter}>
          <Pressable onPress={() => step(-1)} hitSlop={12} style={styles.calNavBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <Text style={styles.calNavTitle}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </Text>
          <Pressable onPress={() => step(1)} hitSlop={12} style={styles.calNavBtn}>
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </Pressable>
        </View>
        <Pressable onPress={() => setViewYear((y) => y + 1)} hitSlop={12} style={styles.calNavYearBtn}>
          <Ionicons name="chevron-forward" size={14} color={colors.muted} />
          <Ionicons name="chevron-forward" size={14} color={colors.muted} style={{ marginLeft: -8 }} />
        </Pressable>
      </View>

      <View style={styles.calRow}>
        {DAY_NAMES.map((d) => (
          <Text key={d} style={styles.calDayName}>{d}</Text>
        ))}
      </View>

      <View style={styles.calGrid}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.calRow}>
            {week.map((day, di) => {
              if (!day) return <View key={di} style={styles.calCell} />;
              const key = dayKeyOf(viewYear, viewMonth, day);
              const selected = key === value;
              const isToday = key === todayKey;
              return (
                <Pressable key={di} onPress={() => pick(day)} style={styles.calCell}>
                  <View style={[styles.calDayCircle, selected && { backgroundColor: colors.primary }]}>
                    <Text
                      style={[
                        styles.calDayText,
                        selected && { color: colors.onPrimary, fontWeight: '700' },
                        isToday && !selected && { color: colors.primary, fontWeight: '600' },
                      ]}
                    >
                      {day}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <Pressable
        onPress={() => { onChange(todayKey); onClose(); }}
        hitSlop={8}
        style={{ alignSelf: 'center', paddingVertical: 10 }}
      >
        <Text style={{ color: colors.primary, fontWeight: '600' }}>Today</Text>
      </Pressable>
    </Sheet>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

/** 24-hour time sheet: two wheels, so a time can never be half-typed. */
export function TimeSheet({
  visible,
  value,
  onChange,
  onClose,
  title = 'Pick a time',
}: {
  visible: boolean;
  /** 'HH:MM' (24-hour), or '' for unset. */
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
  title?: string;
}) {
  const styles = useStyles();
  const match = TIME_RE.exec(value.trim());
  const nowParts = bruneiParts(Date.now());
  const hour = match ? Math.min(23, Number(match[1])) : nowParts.hour;
  const minute = match ? Math.min(59, Number(match[2])) : nowParts.minute;

  const set = (h: number, m: number) =>
    onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);

  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <View style={styles.timeWheels}>
        <View style={{ flex: 1 }}>
          <WheelPicker items={HOURS} selectedIndex={hour} onSelect={(i) => set(i, minute)} />
        </View>
        <Text style={styles.timeColon}>:</Text>
        <View style={{ flex: 1 }}>
          <WheelPicker items={MINUTES} selectedIndex={minute} onSelect={(i) => set(hour, i)} />
        </View>
      </View>
    </Sheet>
  );
}

/** Shared chrome for the two trigger fields below. */
function PickerTrigger({
  label,
  display,
  placeholder,
  icon,
  onPress,
  onClear,
}: {
  label?: string;
  display: string;
  placeholder: string;
  icon: 'calendar-outline' | 'time-outline';
  onPress: () => void;
  onClear?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.pickerRow}>
        <Pressable style={styles.pickerTrigger} onPress={onPress}>
          <Ionicons name={icon} size={18} color={colors.muted} />
          <Text style={[styles.pickerValue, !display && { color: colors.muted }]}>
            {display || placeholder}
          </Text>
        </Pressable>
        {/* A sibling, not a nested Pressable: nesting swallows the outer press
            target on Android. */}
        {onClear && display ? (
          <Pressable onPress={onClear} hitSlop={10} style={styles.pickerClear} accessibilityLabel={`Clear ${label ?? 'date'}`}>
            <Ionicons name="close-circle" size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Labelled date trigger that owns its own sheet — the call site keeps a
 * 'YYYY-MM-DD' string and never sees the calendar.
 *
 * Safe on any pushed screen. Do not place one inside another Modal: two
 * simultaneous Modals is the iOS freeze in HANDOFF §28.
 */
export function DateField({
  label,
  value,
  onChange,
  placeholder = 'Not set',
  sheetTitle,
  clearable = true,
}: {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  sheetTitle?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PickerTrigger
        label={label}
        display={DAY_KEY_RE.test(value) ? formatDayDate(value) : ''}
        placeholder={placeholder}
        icon="calendar-outline"
        onPress={() => setOpen(true)}
        onClear={clearable ? () => onChange('') : undefined}
      />
      <DateSheet
        visible={open}
        value={value}
        onChange={onChange}
        onClose={() => setOpen(false)}
        title={sheetTitle ?? label ?? 'Pick a date'}
      />
    </>
  );
}

/** Labelled time trigger, same contract as `DateField` but 'HH:MM'. */
export function TimeField({
  label,
  value,
  onChange,
  placeholder = 'Not set',
  sheetTitle,
  clearable = false,
}: {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  sheetTitle?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PickerTrigger
        label={label}
        display={TIME_RE.test(value.trim()) ? value.trim() : ''}
        placeholder={placeholder}
        icon="time-outline"
        onPress={() => setOpen(true)}
        onClear={clearable ? () => onChange('') : undefined}
      />
      <TimeSheet
        visible={open}
        value={value}
        onChange={onChange}
        onClose={() => setOpen(false)}
        title={sheetTitle ?? label ?? 'Pick a time'}
      />
    </>
  );
}

const useStyles = themedStyles((colors) => ({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: '700' as const, color: colors.text, marginBottom: 8 },
  // lineHeight is load-bearing, not cosmetic: React Native Web gives every
  // View `overflow: hidden`, so a line box tight to the glyph height crops
  // descenders — a "g" or "y" sitting just above a border looks sliced by it.
  muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center' as const,
    marginVertical: 4,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  buttonDanger: { backgroundColor: colors.danger },
  buttonLabel: { color: colors.onPrimary, fontWeight: '600' as const },
  fieldLabel: { color: colors.muted, fontSize: 13, marginBottom: 4 },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start' as const,
  },
  centered: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24 },
  navRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  // Complete rather than a delta on navRow — see the Slot note above.
  navRowInset: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  navRowLabel: { fontWeight: '600' as const, color: colors.text },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  // Both states share the font weight and size: a heavier selected label
  // measures wider and re-wraps the row, so the chip you just tapped jumps to
  // another line. Selection reads from the filled background.
  chipText: { color: colors.text, fontSize: 13 },
  chipActiveText: { color: colors.onPrimary, fontSize: 13 },
  // Date / time pickers. The calendar metrics match the range picker on the
  // transactions screen so the two read as one control.
  pickerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  pickerTrigger: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  pickerValue: { flex: 1, color: colors.text, fontSize: 15 },
  pickerClear: { padding: 2 },
  calNav: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 4 },
  calNavYearBtn: { padding: 4, flexDirection: 'row' as const, alignItems: 'center' as const, width: 36 },
  calNavCenter: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  calNavBtn: { padding: 4, flexDirection: 'row' as const, alignItems: 'center' as const },
  calNavTitle: { fontSize: 15, fontWeight: '700' as const, color: colors.text, textAlign: 'center' as const },
  calGrid: { height: 240 },
  calRow: { flexDirection: 'row' as const, marginBottom: 2 },
  calDayName: {
    flex: 1,
    textAlign: 'center' as const,
    fontSize: 11,
    fontWeight: '600' as const,
    color: colors.muted,
    paddingVertical: 4,
  },
  calCell: { flex: 1, alignItems: 'center' as const, paddingVertical: 2 },
  calDayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  calDayText: { fontSize: 14, color: colors.text },
  timeWheels: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  timeColon: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  // Sheet
  // Absolutely filled by SheetShell; it must not take part in the column
  // layout, or it would push the panel off the bottom.
  sheetOverlay: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetSlide: {
    flex: 1,
    justifyContent: 'flex-end' as const,
  },
  // Everything above the panel: tapping it closes the sheet.
  sheetDismissArea: { flex: 1 },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center' as const,
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
  },
}));
