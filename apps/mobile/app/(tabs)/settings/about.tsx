import { Linking as RNLinking, ScrollView, Text, View } from 'react-native';
import { Card, Muted, Title } from '@/components/ui';
import { PRIVACY_POLICY_URL, SUPPORT_EMAIL, TERMS_URL } from '@/lib/env';
import { themedStyles, useTheme } from '@/lib/theme';

export default function About() {
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>

      <Card>
        <Title>The story</Title>
        <Text style={[styles.body, { color: colors.text }]}>
          I built this because I kept failing at the same thing: I'd download a budgeting app, track
          every transaction diligently for a week or two, then slowly stop — until I hadn't opened
          it in months and had no idea where my money went.
        </Text>
        <Text style={[styles.body, { color: colors.text }]}>
          The problem wasn't discipline. It was friction. Manually keying in every purchase is a
          habit that's easy to break. So I built something that removes the habit entirely — your
          bank already texts you when you spend, so I wrote an app that reads those messages and
          logs the transaction for you. Now the only spending I track manually is cash, which I
          rarely use anyway.
        </Text>
        <Text style={[styles.body, { color: colors.text }]}>
          Once the auto-capture was working, it felt natural to keep going. Budgets, categories,
          goals — might as well have it all in one place. International apps are polished, but they
          don't know how Baiduri formats an SMS, or what makes sense for someone spending in BND.
          Building it myself, as someone who actually lives here, felt like the right advantage to
          have.
        </Text>
        <Text style={[styles.body, { color: colors.text }]}>
          This started as a personal tool. I just imagined what I'd want as a user and built that.
          If it helps you too, that's everything.
        </Text>
      </Card>

      <Card>
        <Title>The name</Title>
        <Text style={[styles.body, { color: colors.text }]}>
          My teacher once said <Text style={styles.italic}>lama lama jadi bukit</Text> — little by
          little, it becomes a mountain. It's the only idiom from school I still remember, and it
          turns out it applies to everything: savings, habits, debt. Pennies add up. That's the
          whole idea.
        </Text>
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
          Questions, feedback, collaboration, or anything else — I read every email.
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
  body: { fontSize: 14, lineHeight: 22, marginTop: 10 },
  italic: { fontStyle: 'italic' },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  link: { color: colors.primary, textDecorationLine: 'underline', fontSize: 13 },
}));
