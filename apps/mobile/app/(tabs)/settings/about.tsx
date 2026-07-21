import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { Linking as RNLinking, Pressable, ScrollView, Text, View } from 'react-native';
import { Card, Muted, Title } from '@/components/ui';
import { PRIVACY_POLICY_URL, SUPPORT_EMAIL, TERMS_URL } from '@/lib/env';
import { themedStyles, useTheme } from '@/lib/theme';

export default function About() {
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>

      <Card>
        <Title>About</Title>
        <Muted>
          Bukit Pennies logs card spending by parsing bank notification text. It never connects to
          your bank apps or accounts. No credentials, no open banking, only the text you (or your
          phone) hand it.
        </Muted>
        <Link href="/(tabs)/settings/our-story" asChild>
          <Pressable style={styles.storyRow}>
            <Text style={[styles.storyLink, { color: colors.primary }]}>Our story</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </Pressable>
        </Link>
      </Card>

      <Card>
        <Title>Legal</Title>
        <View style={styles.links}>
          <Text style={styles.link} onPress={() => RNLinking.openURL(PRIVACY_POLICY_URL)}>
            Privacy Policy
          </Text>
          <Text style={styles.link} onPress={() => RNLinking.openURL(TERMS_URL)}>
            Terms of Service
          </Text>
        </View>
      </Card>

      <Card>
        <Title>Get in touch</Title>
        <Muted>
          Questions, feedback, feature requests, or anything else.
        </Muted>
        <Text
          style={[styles.link, { marginTop: 12 }]}
          onPress={() => RNLinking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        >
          {SUPPORT_EMAIL}
        </Text>
      </Card>

    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  storyRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  storyLink: { fontSize: 14, fontWeight: '600' },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  link: { color: colors.primary, textDecorationLine: 'underline', fontSize: 13 },
}));
