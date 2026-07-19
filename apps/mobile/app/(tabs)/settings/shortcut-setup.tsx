import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Button, Card, Field, Muted } from '@/components/ui';
import { SHORTCUT_DOWNLOAD_URL } from '@/lib/env';
import { kvGet, kvSet } from '@/lib/kvStore';
import { deferSetup, onboardedKey } from '@/lib/onboarding';
import { useCreateIngestToken, useDevices } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { themedStyles, useTheme } from '@/lib/theme';

// ─── Reusable sub-components ────────────────────────────────────────────────

function StepHeader({ number, title }: { number: number; title: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.stepHeader}>
      <View style={[styles.stepBadge, { backgroundColor: colors.primary }]}>
        <Text style={styles.stepBadgeText}>{number}</Text>
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );
}

function Instruction({ children }: { children: string }) {
  const styles = useStyles();
  return <Text style={styles.instruction}>{children}</Text>;
}

function Tip({ children }: { children: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.tipBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Text style={[styles.tipLabel, { color: colors.primary }]}>Tip  </Text>
      <Text style={[styles.tipText, { color: colors.muted }]}>{children}</Text>
    </View>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      style={[styles.copyRow, { borderColor: colors.border, backgroundColor: colors.bg }]}
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      accessibilityLabel={`Copy ${label}`}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.copyLabel, { color: colors.muted }]}>{label}</Text>
        <Text style={[styles.copyValue, { color: colors.text }]}>{value}</Text>
      </View>
      <Text style={[styles.copyHint, { color: copied ? colors.primary : colors.muted }]}>
        {copied ? '✓ Copied' : 'Copy'}
      </Text>
    </Pressable>
  );
}

// Creates an ios_shortcut token without leaving the setup guide. The token is
// shown once with a copy button; revoking lives in Capture devices & tokens.
// onToken lifts the fresh token so Step 3 can hand it to the Shortcut.
function InlineTokenCreator({ onToken }: { onToken: (token: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const create = useCreateIngestToken();
  const [name, setName] = useState('My iPhone');
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (token) {
    return (
      <View style={[styles.tokenBox, { borderColor: colors.primary }]}>
        <Text style={[styles.tokenLabel, { color: colors.primary }]}>
          Your token. Copy it now, it is shown only once.
        </Text>
        <Text selectable style={[styles.tokenValue, { color: colors.text, backgroundColor: colors.bg }]}>
          {token}
        </Text>
        <Button
          label={copied ? '✓ Copied' : 'Copy token'}
          onPress={async () => {
            await Clipboard.setStringAsync(token);
            setCopied(true);
          }}
        />
        <Tip>No need to save it anywhere else. The Shortcut stores it for you in Step 3, and you can replace it anytime under Settings → Capture.</Tip>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 12 }}>
      <Field label="Device name" value={name} onChangeText={setName} placeholder="My iPhone" />
      <Button
        label="Create my token"
        onPress={() =>
          create.mutate(
            { name: name.trim(), kind: 'ios_shortcut' },
            {
              onSuccess: (t) => {
                setToken(t);
                onToken(t);
              },
            },
          )
        }
        disabled={!name.trim()}
        busy={create.isPending}
      />
      {create.error ? (
        <Text style={{ color: colors.danger, marginTop: 8 }}>{create.error.message}</Text>
      ) : null}
      <Tip>Already created one before? Reuse it, or manage tokens under Settings → Capture → Capture devices & tokens.</Tip>
    </View>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 12 }} />;
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ShortcutSetup() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const [token, setToken] = useState<string | null>(null);
  // Onboarding mode: first-time users are held here by AuthGate until they
  // tap "Setup complete", which flips the flag and releases them.
  const [onboarding, setOnboarding] = useState(false);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let live = true;
    kvGet(onboardedKey(userId)).then((v) => {
      if (live) setOnboarding(v !== '1');
    });
    return () => {
      live = false;
    };
  }, [userId]);

  // Capture-verified completion: the server stamps last_seen_at on the token
  // whenever the Shortcut delivers a message, so a used ios_shortcut token
  // proves the whole pipeline works. Poll while onboarding so the "Test it
  // now" message flips the button live.
  const devices = useDevices(onboarding ? { refetchInterval: 5000 } : undefined);
  const captureVerified = !!devices.data?.some(
    (d) => d.kind === 'ios_shortcut' && !d.revoked_at && d.last_seen_at !== null,
  );

  async function completeSetup() {
    if (userId) await kvSet(onboardedKey(userId), '1');
    router.replace('/(tabs)');
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>

      {/* Intro */}
      <Card>
        <Text style={styles.heroTitle}>Automatic capture</Text>
        {onboarding ? (
          <Muted>One-time setup. Finish the steps below to start using the app.</Muted>
        ) : null}
        <Muted>
          Your bank texts you for every card payment. A free Apple Shortcut forwards those
          messages here so they log themselves. Set it up once, then forget it.
        </Muted>
        <View style={[styles.timePill, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' }]}>
          <Text style={[styles.timePillText, { color: colors.primary }]}>⏱ 3 to 5 minutes</Text>
        </View>
      </Card>

      {/* Requirement warning: capture depends entirely on bank SMS arriving in Messages */}
      <Card>
        <View style={[styles.warnBox, { backgroundColor: colors.danger + '12', borderColor: colors.danger + '55' }]}>
          <Text style={[styles.warnTitle, { color: colors.danger }]}>Important</Text>
          <Text style={[styles.warnText, { color: colors.text }]}>
            This only works if your bank sends transaction alerts as SMS, arriving in the
            Messages app. If those alerts are disabled, or your bank sends them another way
            (app notification, email), nothing can be captured. You can usually enable SMS
            transaction alerts from your bank's mobile app settings, or by asking your bank.
          </Text>
        </View>
        <View style={[styles.warnBox, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '40', marginTop: 10 }]}>
          <Text style={[styles.warnTitle, { color: colors.primary }]}>Stay safe</Text>
          <Text style={[styles.warnText, { color: colors.text }]}>
            Bukit Pennies will never ask for your banking details. No card numbers, no
            account numbers, no bank passwords, no OTPs. Anyone asking for these in our name
            is a scammer.
          </Text>
        </View>
      </Card>

      {/* Step 1: inline token creation, no navigating away */}
      <Card>
        <StepHeader number={1} title="Create your token" />
        <Instruction>
          {'1. Tap "Create my token".\n2. Tap "Copy token".'}
        </Instruction>
        <InlineTokenCreator onToken={setToken} />
      </Card>

      {/* Step 2 */}
      <Card>
        <StepHeader number={2} title="Download the Shortcut" />
        <Instruction>
          {'1. Tap the button below.\n2. When iOS asks, tap "Add Shortcut".'}
        </Instruction>
        <View style={{ marginTop: 12 }}>
          <Button
            label="Download the Shortcut"
            onPress={() => Linking.openURL(SHORTCUT_DOWNLOAD_URL)}
          />
        </View>
      </Card>

      {/* Step 3: one-tap token handoff via shortcuts:// deep link */}
      <Card>
        <StepHeader number={3} title="Connect the app to the Shortcut" />
        <Instruction>
          Tap the button below. When you see the notification "Connected. Capture is ready."
          this step is done.
        </Instruction>
        <View style={{ marginTop: 12 }}>
          <Button
            label="Send the token to the Shortcut"
            onPress={() =>
              Linking.openURL(
                'shortcuts://run-shortcut?name=' +
                  encodeURIComponent('Bukit Pennies Capture') +
                  '&input=text&text=' +
                  encodeURIComponent(token ?? ''),
              )
            }
            disabled={!token}
          />
          {!token ? (
            <Muted>Finish Step 1 first. This button unlocks once you have a token.</Muted>
          ) : null}
        </View>
        <Tip>Reusing an old token? Run the Shortcut once from the Shortcuts app instead. It will ask for the token and remember it.</Tip>
      </Card>

      {/* Step 4: the Message automation, per bank or per card */}
      <Card>
        <StepHeader number={4} title="Turn on capture: per bank or per card" />
        <Instruction>
          {'1. Open the Shortcuts app.\n' +
            '2. Tap "Automation" at the bottom, then tap "+".\n' +
            '3. Choose "Message".\n' +
            '4. Leave "Sender" empty.\n' +
            '5. In "Message Contains", paste a template from below.\n' +
            '6. Choose "Run Immediately", then tap "Next".\n' +
            '7. Pick the "Bukit Pennies Capture" shortcut.'}
        </Instruction>

        <Divider />
        <Text style={[styles.optionLabel, { color: colors.text }]}>Per bank (recommended)</Text>
        <Muted>One automation captures every card from that bank.</Muted>
        <CopyRow label="Baiduri" value="Card No.:" />
        <CopyRow label="BIBD" value="card ending with" />

        <Divider />
        <Text style={[styles.optionLabel, { color: colors.text }]}>Per card</Text>
        <Muted>
          Only want certain cards tracked? Use the card digits exactly as they appear in a real
          SMS, one automation per card.
        </Muted>
        <CopyRow label="Baiduri (use your own digits)" value="Card No.: 4x0213" />
        <CopyRow label="BIBD (use your own last 4 digits)" value="card ending with 0298" />
        <Tip>If a card is replaced, its digits change and capture stops. Update the automation with the new digits. Per bank setups never have this problem.</Tip>
      </Card>

      {/* Step 5: test run. Also teaches the trigger logic: it fires on the
          SMS arriving in Messages, not on the physical card tap. */}
      <Card>
        <StepHeader number={5} title="Test it" />
        <Instruction>
          The Shortcut runs when a bank message arrives in the Messages app, not when you tap
          your card. So you can trigger it yourself right now:
        </Instruction>
        <View style={{ height: 8 }} />
        <Instruction>
          {'1. Copy a real transaction message from your bank.\n' +
            '2. Open the Messages app (the iOS one, not WhatsApp).\n' +
            '3. Open the chat with yourself or your own number.\n' +
            '4. Paste the message and tap send.\n' +
            '5. The transaction appears in the app within seconds, with a Logged notification.'}
        </Instruction>
      </Card>

      {/* Good to know */}
      <Card>
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>Good to know</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>✓</Text>
          <Text style={[styles.infoText, { color: colors.text }]}>
            <Text style={{ fontWeight: '700' }}>Logged confirmations are built in.</Text>
            {'  '}Every captured spend shows a notification like "Logged $5.10 at HUA HO". No extra setup.
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>✓</Text>
          <Text style={[styles.infoText, { color: colors.text }]}>
            <Text style={{ fontWeight: '700' }}>Duplicates are ignored.</Text>
            {'  '}If the same SMS arrives twice, only the first is stored and spending is never double counted. The duplicate shows an empty "Logged $ at ." notification, which you can ignore.
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>✓</Text>
          <Text style={[styles.infoText, { color: colors.text }]}>
            <Text style={{ fontWeight: '700' }}>Confirmation tap.</Text>
            {'  '}iOS may ask you to confirm before the automation runs. That is an iOS security setting, not an error.
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>✓</Text>
          <Text style={[styles.infoText, { color: colors.text }]}>
            <Text style={{ fontWeight: '700' }}>This setup is per phone.</Text>
            {'  '}Your transactions live in your account, so a new phone shows all your data
            the moment you log in. Only this Shortcut setup needs to be done again on the new
            phone.
          </Text>
        </View>

      </Card>

      {/* Onboarding completion — releases the AuthGate hold */}
      {onboarding ? (
        <Card>
          <Text style={[styles.sectionLabel, { color: colors.muted }]}>All done?</Text>
          <Instruction>
            Once your automation is created, you're set and ready to go. Every bank SMS from
            here on logs itself. Open the app anytime and your latest spending is already
            there, without keying in a thing.
          </Instruction>
          <View style={{ marginTop: 12 }}>
            {captureVerified ? (
              <Text style={{ color: colors.primary, fontWeight: '600' }}>
                ✓ Capture verified. Your Shortcut delivered its first message.
              </Text>
            ) : (
              <Text style={{ color: colors.muted }}>
                Waiting for your first captured message. Finish the steps above, then send
                one with Step 5.
              </Text>
            )}
          </View>
          <View style={{ marginTop: 12, gap: 8 }}>
            <Button
              label="Setup complete, take me to the app"
              onPress={completeSetup}
              disabled={!captureVerified}
            />
            <Button
              label="I'll do it later"
              variant="secondary"
              onPress={() => {
                deferSetup();
                router.replace('/(tabs)');
              }}
            />
          </View>
          <Muted>
            You'll be brought back here each time you open the app until setup is complete.
          </Muted>
        </Card>
      ) : null}

    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center' },

  heroTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 8 },
  timePill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  timePillText: { fontSize: 13, fontWeight: '600' },

  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepBadgeText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  stepTitle: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },

  instruction: { color: colors.text, lineHeight: 22, fontSize: 14 },

  tipBox: {
    flexDirection: 'row',
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  tipLabel: { fontWeight: '700', fontSize: 13 },
  tipText: { flex: 1, fontSize: 13, lineHeight: 18 },

  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  copyLabel: { fontSize: 11, marginBottom: 2 },
  copyValue: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 14,
  },
  copyHint: { fontWeight: '600', fontSize: 13 },

  tokenBox: { marginTop: 12, borderWidth: 1, borderRadius: 10, padding: 12 },
  tokenLabel: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  tokenValue: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 13,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },

  optionLabel: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  warnBox: { padding: 14, borderRadius: 10, borderWidth: 1 },
  warnTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  warnText: { fontSize: 14, lineHeight: 21 },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  infoRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  infoIcon: { fontSize: 16, color: colors.primary, lineHeight: 22 },
  infoText: { flex: 1, fontSize: 14, lineHeight: 22 },
}));
