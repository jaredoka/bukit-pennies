import { Linking as RNLinking, ScrollView, Text, View } from 'react-native';
import { Card, Muted, Title } from '@/components/ui';
import { PRIVACY_POLICY_URL, SUPPORT_EMAIL, TERMS_URL } from '@/lib/env';
import { themedStyles } from '@/lib/theme';

export default function About() {
  const styles = useStyles();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Title>About</Title>
        <Muted>
          Bukit Pennies logs card spending by parsing bank notification text. It never connects to
          your bank apps or accounts. No credentials, no open banking, only the text you (or your
          phone) hand it.
        </Muted>
        <View style={styles.links}>
          <Text style={styles.link} onPress={() => RNLinking.openURL(PRIVACY_POLICY_URL)}>
            Privacy Policy
          </Text>
          <Text style={styles.link} onPress={() => RNLinking.openURL(TERMS_URL)}>
            Terms of Service
          </Text>
          <Text style={styles.link} onPress={() => RNLinking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
            Contact support
          </Text>
        </View>
      </Card>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  link: { color: colors.primary, textDecorationLine: 'underline', fontSize: 13 },
}));
