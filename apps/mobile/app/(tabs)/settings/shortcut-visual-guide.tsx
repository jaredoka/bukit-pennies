import { Image, ScrollView, Text, View } from 'react-native';
import { Card, Muted } from '@/components/ui';
import { themedStyles, useTheme } from '@/lib/theme';

// Screenshot walkthrough of Step 4 (the Message automation). Images are
// captured on a real iPhone and dropped into assets/shortcut-guide/; map
// each file here with a static require (Metro cannot resolve dynamic paths).
// Slots with image: null render a placeholder until the screenshot exists.
const STEPS: Array<{ caption: string; image: number | null }> = [
  { caption: '1. Open the Shortcuts app.', image: null },
  { caption: '2. Tap "Automation" at the bottom, then tap "+".', image: null },
  { caption: '3. Choose "Message".', image: null },
  { caption: '4. Leave "Sender" empty.', image: null },
  { caption: '5. In "Message Contains", paste your template.', image: null },
  { caption: '6. Choose "Run Immediately", then tap "Next".', image: null },
  { caption: '7. Pick the "Bukit Pennies Capture" shortcut.', image: null },
];

export default function ShortcutVisualGuide() {
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.title}>Automation, in pictures</Text>
        <Muted>
          The same seven actions from Step 4, one screenshot each. Copy your template from the
          setup page before you start.
        </Muted>
      </Card>

      {STEPS.map((s) => (
        <Card key={s.caption}>
          <Text style={[styles.caption, { color: colors.text }]}>{s.caption}</Text>
          {s.image !== null ? (
            <Image source={s.image} style={styles.shot} resizeMode="contain" />
          ) : (
            <View style={[styles.placeholder, { borderColor: colors.border, backgroundColor: colors.bg }]}>
              <Text style={{ color: colors.muted }}>Screenshot coming soon</Text>
            </View>
          )}
        </Card>
      ))}
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 8 },
  caption: { fontSize: 15, fontWeight: '600', marginBottom: 10 },
  shot: { width: '100%', aspectRatio: 9 / 19.5, borderRadius: 8 },
  placeholder: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
