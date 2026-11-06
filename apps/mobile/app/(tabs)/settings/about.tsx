import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Linking as RNLinking, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, Chip, Field, Muted, Title } from '@/components/ui';
import { PRIVACY_POLICY_URL, SUPPORT_EMAIL, TERMS_URL } from '@/lib/env';
import { useProfile, useUpdateProfile } from '@/lib/queries';
import { themedStyles, useTheme } from '@/lib/theme';

/**
 * The channels a user can pick for "How did you hear about us?".
 *
 * The `value` literals are the database allowlist (migration 26's
 * `profiles_heard_about_allowlist`) — change them here *and* in the
 * migration, never in one place. `label` is what the user sees.
 */
const HEARD_ABOUT_OPTIONS = [
  { value: 'app_store', label: 'App Store search' },
  { value: 'friend_family', label: 'Friend or family' },
  { value: 'social_media', label: 'Social media' },
  { value: 'online_community', label: 'Online community' },
  { value: 'news_blog', label: 'News or blog' },
  { value: 'other', label: 'Other' },
] as const;

export default function About() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [sent, setSent] = useState(false);

  const alreadyAnswered = Boolean(profile?.heard_about);

  function submit() {
    if (!selected) return;
    const otherDetail = selected === 'other' && detail.trim() ? detail.trim() : null;
    updateProfile.mutate(
      { heard_about: selected, heard_about_detail: otherDetail },
      {
        onSuccess: () => setSent(true),
        onError: () => setSent(false),
      },
    );
  }

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
        <Title>How did you hear about us?</Title>
        <Muted>
          Just curious, and it helps us reach people like you. Pick one option.
        </Muted>
        {alreadyAnswered || sent ? (
          <Muted>
            Thanks for letting us know!
          </Muted>
        ) : (
          <View style={{ marginTop: 12 }}>
            <View style={styles.chips}>
              {HEARD_ABOUT_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  active={selected === option.value}
                  onPress={() => setSelected(option.value)}
                />
              ))}
            </View>
            {selected === 'other' ? (
              <Field
                label="Tell us more (optional)"
                value={detail}
                onChangeText={setDetail}
                placeholder="e.g. saw it in a WhatsApp group"
                maxLength={200}
              />
            ) : null}
            <Button
              label="Submit"
              onPress={submit}
              busy={updateProfile.isPending}
              disabled={!selected}
              style={{ marginTop: 4 }}
            />
          </View>
        )}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
}));
