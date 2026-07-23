import { ScrollView, Text, View } from 'react-native';
import { HornbillMascot } from '@/components/HornbillMascot';
import { Card, Title } from '@/components/ui';
import { themedStyles, useTheme } from '@/lib/theme';

export default function OurStory() {
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>

      <Card>
        <View style={styles.titleRow}>
          <View style={styles.titleWrap}><Title>The story</Title></View>
          <HornbillMascot animation="tail" size={48} flip blinkChance={0.25} />
        </View>
        <Text style={[styles.body, { color: colors.text }]}>
          I built this because I kept failing at the same thing. I would download a budgeting app,
          track every transaction diligently for a week or two, then slowly stop. Months later I
          had no idea where my money went.
        </Text>
        <Text style={[styles.body, { color: colors.text }]}>
          Manually keying in every purchase is a habit that is easy to break. So I built something
          that removes the task entirely. Your
          bank already texts you when you spend, so I wrote an app that reads those messages and
          logs the transaction for you. Now the only spending I track manually is cash, which I
          rarely use anyway.
        </Text>
        <Text style={[styles.body, { color: colors.text }]}>
          Once the auto-capture was working, it felt natural to keep going. Budgets, categories,
          goals. Might as well have it all in one place. International apps are polished, but they
          don't understand how local banks format their SMS, or what makes sense for someone
          spending in BND. Building it myself, as someone who actually lives here, felt like the
          right advantage to have.
        </Text>
        <Text style={[styles.body, { color: colors.text }]}>
          This started as a personal tool. I just imagined what I would want as a user and built
          that. If it helps even one other person in the same situation, that would be a pretty
          cool thing to have built.
        </Text>
      </Card>

      <Card>
        <Title>The name</Title>
        <Text style={[styles.body, { color: colors.text }]}>
          My teacher once said <Text style={styles.italic}>sedikit-sedikit, lama-lama menjadi bukit</Text>. Little by
          little, it becomes a mountain. It is the only idiom from school I still remember, and it
          turns out it applies to everything. Savings, habits, debt. Pennies add up. That is the
          whole idea.
        </Text>
      </Card>

    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  titleWrap: { marginBottom: -8 },
  body: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  italic: { fontStyle: 'italic' },
}));
