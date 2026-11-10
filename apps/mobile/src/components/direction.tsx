import { Pressable, Text, View } from 'react-native';
import { DIRECTION_CHOICES } from '@/lib/direction';
import { themedStyles, useTheme } from '@/lib/theme';
import type { TxDirection } from '@/lib/types';

/**
 * The one direction picker used by manual entry, the transaction detail screen
 * and the review inbox, so the five choices and their wording cannot drift
 * apart between screens.
 *
 * `null` is a real choice ("Not set"), not the absence of one: an untagged row
 * counts as money out everywhere, so there is no forced decision here.
 */
export function DirectionChips({
  value,
  onChange,
  includeRefund = true,
}: {
  value: TxDirection | null;
  onChange: (value: TxDirection | null) => void;
  /** Review hides refunds: it has no category, and a refund must name one. */
  includeRefund?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const choices = includeRefund
    ? DIRECTION_CHOICES
    : DIRECTION_CHOICES.filter((c) => c.value !== 'refund');

  return (
    <View style={styles.chips}>
      {choices.map((choice) => {
        const active = value === choice.value;
        return (
          <Pressable
            key={choice.value ?? 'unset'}
            onPress={() => onChange(choice.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={choice.label}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={active ? styles.chipActiveText : styles.chipText}>{choice.label}</Text>
            {active ? <Text style={styles.check}>✓</Text> : null}
          </Pressable>
        );
      })}
      {!includeRefund ? (
        <Text style={[styles.note, { color: colors.muted }]}>
          Refunds are set from the transaction after choosing the category they reduce.
        </Text>
      ) : null}
    </View>
  );
}

/** The list's badge: only the two directions the sign cannot convey. */
export function directionBadge(direction: TxDirection | null): string | null {
  if (direction === 'refund') return 'Refund';
  if (direction === 'transfer') return 'Transfer';
  return null;
}

const useStyles = themedStyles((colors) => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  // Both states share the font weight: a heavier selected label measures wider
  // and re-wraps the row, so the pill you just tapped jumps to another line.
  chipText: { color: colors.text, fontSize: 13 },
  chipActiveText: { color: colors.onPrimary, fontSize: 13 },
  check: { color: colors.onPrimary, fontSize: 12, fontWeight: '700' },
  note: { fontSize: 12, lineHeight: 17, width: '100%' },
}));
