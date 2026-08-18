import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTheme, FontFamily, FontSize, DisplayFont } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { updateSettings } from '../../src/services/api';
import { toastApiError } from '../../src/lib/toast';
import type { UserSettings } from '../../src/types/api';

export interface NotificationPreferences {
  messages: boolean;
  preview: boolean;
  sound: boolean;
  vibrate: boolean;
  reactions: boolean;
  missedCalls: boolean;
  groupMessages: boolean;
  memberActivity: boolean;
  mentionsOnly: boolean;
}

export const NOTIF_PREFS_KEY = 'notification_preferences';

export const DEFAULT_NOTIF_PREFS: NotificationPreferences = {
  messages: true,
  preview: true,
  sound: true,
  vibrate: true,
  reactions: true,
  missedCalls: true,
  groupMessages: true,
  memberActivity: true,
  mentionsOnly: false,
};

/** Local pref key -> the backend UserSettings field it persists to (PATCH /me/settings). */
const BACKEND_KEY: Record<keyof NotificationPreferences, keyof UserSettings> = {
  messages: 'notifyMessages',
  preview: 'notifyPreview',
  sound: 'notifySound',
  vibrate: 'notifyVibrate',
  reactions: 'notifyReactions',
  missedCalls: 'notifyMissedCalls',
  groupMessages: 'notifyGroupMessages',
  memberActivity: 'notifyMemberActivity',
  mentionsOnly: 'notifyMentionsOnly',
};

function fromServerSettings(settings: UserSettings | null | undefined): Partial<NotificationPreferences> {
  if (!settings) return {};
  const out: Partial<NotificationPreferences> = {};
  for (const key of Object.keys(BACKEND_KEY) as (keyof NotificationPreferences)[]) {
    const v = settings[BACKEND_KEY[key]];
    if (typeof v === 'boolean') out[key] = v;
  }
  return out;
}

/** Load stored notification prefs, merged over defaults. Used as an offline-first cache; the
 *  server (UserSettings, via GET /auth/me) is the source of truth once it's loaded. */
export async function loadNotificationPrefs(): Promise<NotificationPreferences> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
    return raw ? { ...DEFAULT_NOTIF_PREFS, ...JSON.parse(raw) } : DEFAULT_NOTIF_PREFS;
  } catch {
    return DEFAULT_NOTIF_PREFS;
  }
}

export default function NotificationSettings() {
  const router = useRouter();
  const { theme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIF_PREFS);

  // 1. Seed from the local cache immediately (fast paint / offline-first).
  useEffect(() => {
    loadNotificationPrefs().then(setPrefs);
  }, []);

  // 2. Once the server settings arrive, they win — and get cached locally.
  useEffect(() => {
    if (!user) {
      refreshUser();
      return;
    }
    const fromServer = fromServerSettings(user.settings);
    if (Object.keys(fromServer).length === 0) return;
    setPrefs((prev) => {
      const next = { ...prev, ...fromServer };
      AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [user, refreshUser]);

  const update = async (key: keyof NotificationPreferences, value: boolean) => {
    const prev = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(next)).catch(() => {});
    try {
      await updateSettings({ [BACKEND_KEY[key]]: value });
    } catch (e) {
      // Backend rejected/failed to persist — roll back so the UI never shows
      // a state that wasn't actually saved.
      setPrefs(prev);
      AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prev)).catch(() => {});
      toastApiError(e, 'Could not update notification setting');
    }
  };

  const Row = ({ label, k, disabled }: { label: string; k: keyof NotificationPreferences; disabled?: boolean }) => (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: disabled ? theme.textTertiary : theme.textPrimary }]}>{label}</Text>
      <Switch
        value={prefs[k]}
        disabled={disabled}
        onValueChange={(v) => update(k, v)}
        trackColor={{ true: theme.brand, false: theme.border }}
        thumbColor="#fff"
      />
    </View>
  );

  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: theme.textTertiary }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: theme.surface }]}>{children}</View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Notifications</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Group title="MESSAGE NOTIFICATIONS">
          <Row label="Message notifications" k="messages" />
          <Row label="Show preview" k="preview" disabled={!prefs.messages} />
          <Row label="Sound" k="sound" disabled={!prefs.messages} />
          <Row label="Vibrate" k="vibrate" disabled={!prefs.messages} />
        </Group>

        <Group title="REACTIONS">
          <Row label="Reaction notifications" k="reactions" />
        </Group>

        <Group title="CALLS">
          <Row label="Missed call notifications" k="missedCalls" />
        </Group>

        <Group title="GROUPS">
          <Row label="Group message notifications" k="groupMessages" />
          <Row label="Member joined / left" k="memberActivity" disabled={!prefs.groupMessages} />
          <Row label="Mentions only" k="mentionsOnly" disabled={!prefs.groupMessages} />
        </Group>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: FontSize.lg, fontFamily: DisplayFont.bold, fontWeight: '700' },
  group: { marginTop: 22, paddingHorizontal: 16 },
  groupTitle: { fontSize: 12, fontFamily: FontFamily.semibold, letterSpacing: 0.5, marginBottom: 8 },
  card: { borderRadius: 14, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, minHeight: 48 },
  rowLabel: { fontSize: 15, fontFamily: FontFamily.regular, flex: 1, marginRight: 12 },
});
