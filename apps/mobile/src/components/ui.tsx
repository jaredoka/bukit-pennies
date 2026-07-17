import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { themedStyles, useTheme } from '@/lib/theme';

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
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
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
}));
