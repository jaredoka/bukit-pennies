import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { themedStyles, useTheme } from '@/lib/theme';

/**
 * The one switch row used across Settings.
 *
 * The track uses `switchOff` rather than `border`: in Light mode `border` is a
 * pale yellow line on a pale yellow card, so an off switch disappeared. The
 * thumb is the thing that shows the state; the track just has to be visible.
 */
export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  accessibilityLabel,
  disabled = false,
  style,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.row, disabled && styles.disabled, style]}
    >
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <View style={[styles.pill, { backgroundColor: value ? colors.primary : colors.switchOff }]}>
        <View style={[styles.thumb, value && styles.thumbOn]} />
      </View>
    </Pressable>
  );
}

const useStyles = themedStyles((colors) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 14,
  },
  disabled: { opacity: 0.5 },
  text: { flex: 1 },
  label: { fontWeight: '600', color: colors.text, fontSize: 15 },
  description: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 2 },
  pill: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    paddingHorizontal: 3,
    flexShrink: 0,
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  thumbOn: { alignSelf: 'flex-end' },
}));
