import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Centered, Muted, PickerSheet, Title, WheelPicker } from '@/components/ui';
import {
  ensureNotificationPermission,
  getDigestPrefs,
  setDigestPrefs,
  type DigestPrefs,
} from '@/lib/notifications';
import { themedStyles, useTheme } from '@/lib/theme';

const DAY_ITEMS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const HOUR_ITEMS = Array.from({ length: 24 }, (_, h) => {
  const suffix = h < 12 ? 'am' : 'pm';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${suffix}`;
});

export default function WeeklySummary() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [prefs, setPrefs] = useState<DigestPrefs | null>(null);
  const [dayOpen, setDayOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);

  useEffect(() => {
    getDigestPrefs().then(setPrefs);
  }, []);

  async function update(patch: Partial<DigestPrefs>) {
    const next = await setDigestPrefs(patch);
    setPrefs(next);
    if (next.on) await ensureNotificationPermission();
  }

  if (!prefs) {
    return (
      <Centered>
        <ActivityIndicator size="large" />
      </Centered>
    );
  }

  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <Title>Weekly summary</Title>
          <Muted>
            Weekly update on money spent, and percent of money used so far in the month.
            The notification fires once a week at your chosen day and time.
          </Muted>

          <Pressable style={styles.toggleRow} onPress={() => update({ on: !prefs.on })}>
            <Text style={styles.toggleLabel}>Enable weekly summary</Text>
            <View style={[styles.pill, prefs.on && { backgroundColor: colors.primary }]}>
              <View style={[styles.thumb, prefs.on && styles.thumbOn]} />
            </View>
          </Pressable>
        </Card>

        {prefs.on ? (
          <Card style={styles.pickerCard}>
            <Pressable style={styles.pickerRow} onPress={() => setDayOpen(true)}>
              <Text style={styles.pickerLabel}>Day</Text>
              <Text style={styles.pickerValue}>{DAY_ITEMS[prefs.dayOfWeek]}</Text>
              <Text style={styles.pickerChevron}>›</Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable style={styles.pickerRow} onPress={() => setTimeOpen(true)}>
              <Text style={styles.pickerLabel}>Time</Text>
              <Text style={styles.pickerValue}>{HOUR_ITEMS[prefs.hour]}</Text>
              <Text style={styles.pickerChevron}>›</Text>
            </Pressable>
          </Card>
        ) : null}

        {prefs.on ? (
          <Card>
            <Muted>
              {`Notifications will arrive every ${DAY_ITEMS[prefs.dayOfWeek]} at ${HOUR_ITEMS[prefs.hour]} Brunei time. Content refreshes each time you open the app.`}
            </Muted>
          </Card>
        ) : null}
      </ScrollView>

      <PickerSheet visible={dayOpen} onClose={() => setDayOpen(false)} title="Day">
        <WheelPicker
          items={DAY_ITEMS}
          selectedIndex={prefs.dayOfWeek}
          onSelect={(idx) => update({ dayOfWeek: idx })}
        />
      </PickerSheet>

      <PickerSheet visible={timeOpen} onClose={() => setTimeOpen(false)} title="Time">
        <WheelPicker
          items={HOUR_ITEMS}
          selectedIndex={prefs.hour}
          onSelect={(idx) => update({ hour: idx })}
        />
      </PickerSheet>
    </>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  toggleLabel: { fontWeight: '600', color: colors.text, fontSize: 15 },
  pill: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.border,
    justifyContent: 'center',
    paddingHorizontal: 3,
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
  pickerCard: { paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pickerLabel: { flex: 1, fontWeight: '600', color: colors.text, fontSize: 15 },
  pickerValue: { color: colors.primary, fontSize: 15, fontWeight: '500', marginRight: 6 },
  pickerChevron: { color: colors.muted, fontSize: 20, lineHeight: 22 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: 16 },
}));
