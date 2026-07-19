import React, { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

  // Initial scroll — delay exceeds the Modal slide animation (~300ms).
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: selectedIndex * WHEEL_ITEM_H, animated: false });
      lastIdx.current = selectedIndex;
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        contentContainerStyle={{ paddingTop: pad, paddingBottom: pad }}
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
export function PickerSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <>
      {/* Overlay appears instantly */}
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        <Pressable style={styles.sheetOverlay} onPress={onClose} />
      </Modal>
      {/* Sheet panel slides up */}
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.sheetSlide}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            {title ? <Text style={styles.sheetTitle}>{title}</Text> : null}
            {children}
            <Button label="Done" onPress={onClose} />
          </Pressable>
        </View>
      </Modal>
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
  muted: { color: colors.muted, fontSize: 13 },
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
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
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
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13 },
  chipActiveText: { color: colors.onPrimary, fontWeight: '600' as const, fontSize: 13 },
  // PickerSheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheetSlide: {
    flex: 1,
    justifyContent: 'flex-end' as const,
  },
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
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
    textAlign: 'center' as const,
    marginBottom: 4,
  },
}));
