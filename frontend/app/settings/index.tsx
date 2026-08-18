import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useTheme } from '../../src/theme';
import { UpgradeModal } from '../../src/components/UpgradeModal';
import { CustomAlert } from '../../src/components/CustomAlert';
import { useAlert } from '../../src/hooks/useAlert';
import { Avatar } from '../../src/components/Avatar';
import { AnimatedSwitch } from '../../src/components/ui/AnimatedSwitch';
import { useAuthStore } from '../../src/store/authStore';
import { updateSettings, updateProfile, exportMyData, deleteAccount, logout as apiLogout } from '../../src/services/api';
import { planAtLeast } from '../../src/lib/format';
import type { Plan, UserSettings, AiOptInFeatures } from '../../src/types/api';

type SettingKey = keyof UserSettings;
type AiKey = keyof AiOptInFeatures;

export default function Settings() {
  const router = useRouter();
  const { theme, isDark, toggleTheme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const setUser = useAuthStore((s) => s.setUser);
  const doLogout = useAuthStore((s) => s.logout);
  const plan: Plan = user?.plan ?? 'free';
  const { alertConfig, hideAlert, alertSuccess, alertError } = useAlert();

  const [upgradeFor, setUpgradeFor] = useState<Plan | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState('');
  const [busy, setBusy] = useState(false);

  // Local toggle state seeded from the loaded user.
  const [toggles, setToggles] = useState<UserSettings>({});
  const [ai, setAi] = useState<AiOptInFeatures>({});
  // Availability toggles persist via PATCH /api/v1/me (User model fields).
  const [avail, setAvail] = useState<{ groupsAvailable?: boolean; audioCallAvailable?: boolean; videoCallAvailable?: boolean }>({});

  useEffect(() => {
    if (!user) {
      refreshUser();
      return;
    }
    setToggles({
      discoverable: user.isOnGrid,
      showDistance: !user.hideExactDistance,
      verifiedUsersOnlyFilter: user.verifiedUsersOnlyFilter,
      pauseIncomingMessages: user.pauseIncomingMessages,
      incognito: user.incognitoMode,
      hideActiveStatus: user.hideActiveStatus,
      hideLastSeen: user.hideLastSeen,
      hideExactDistance: user.hideExactDistance,
      requireProfileCompletenessToMessage: user.requireProfileCompletenessToMessage,
      disceetMode: user.disceetMode,
      showOrientationPublicly: user.showOrientationPublicly,
    });
    setAi(user.aiOptInFeatures ?? {});
    setAvail({
      groupsAvailable: user.groupsAvailable,
      audioCallAvailable: user.audioCallAvailable,
      videoCallAvailable: user.videoCallAvailable,
    });
  }, [user, refreshUser]);

  const patch = async (key: SettingKey, value: boolean) => {
    const prev = toggles[key];
    setToggles((t) => ({ ...t, [key]: value }));
    try {
      const updated = await updateSettings({ [key]: value });
      // Keep authStore in sync where a matching model field exists.
      if (user) setUser({ ...user, ...mapSettingToUser(key, value) });
      void updated;
    } catch {
      setToggles((t) => ({ ...t, [key]: prev }));
      alertError('Could not update setting', 'Please try again.');
    }
  };

  const patchAi = async (key: AiKey, value: boolean) => {
    const prev = ai[key];
    const nextAi = { ...ai, [key]: value };
    setAi(nextAi);
    try {
      await updateSettings({ aiOptInFeatures: nextAi });
      if (user) setUser({ ...user, aiOptInFeatures: nextAi });
    } catch {
      setAi((a) => ({ ...a, [key]: prev }));
      alertError('Could not update setting', 'Please try again.');
    }
  };

  type AvailKey = 'groupsAvailable' | 'audioCallAvailable' | 'videoCallAvailable';
  const patchAvailability = async (key: AvailKey, value: boolean) => {
    const prev = avail[key];
    setAvail((a) => ({ ...a, [key]: value }));
    try {
      await updateProfile({ [key]: value });
      if (user) setUser({ ...user, [key]: value });
    } catch {
      setAvail((a) => ({ ...a, [key]: prev }));
      alertError('Could not update setting', 'Please try again.');
    }
  };

  const onLogout = async () => {
    try {
      await apiLogout();
    } catch {
      /* ignore */
    }
    await doLogout();
    router.replace('/onboarding');
  };

  const onExport = async () => {
    try {
      await exportMyData();
      alertSuccess('Export started', 'Your data export has been requested. You’ll be notified when it’s ready.');
    } catch {
      alertError('Export failed', 'Please try again later.');
    }
  };

  const onDelete = async () => {
    if (deletePhrase !== 'DELETE' || busy) return;
    setBusy(true);
    try {
      await deleteAccount();
      await doLogout();
      router.replace('/onboarding');
    } catch {
      alertError('Could not delete account', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const Toggle = ({
    label,
    settingKey,
    requiredPlan,
  }: {
    label: string;
    settingKey: SettingKey;
    requiredPlan?: Plan;
  }) => {
    const locked = requiredPlan ? !planAtLeast(plan, requiredPlan) : false;
    return (
      <View style={styles.toggleRow}>
        <Text style={[styles.toggleLabel, { color: locked ? theme.textTertiary : theme.textPrimary }]}>{label}</Text>
        {locked ? (
          <Pressable style={styles.lockBtn} onPress={() => setUpgradeFor(requiredPlan!)}>
            <Ionicons name="lock-closed" size={14} color={theme.brand} />
            <Text style={[styles.lockText, { color: theme.brand }]}>{requiredPlan}</Text>
          </Pressable>
        ) : (
          <AnimatedSwitch value={!!toggles[settingKey]} onValueChange={(v) => patch(settingKey, v)} />
        )}
      </View>
    );
  };

  const AvailRow = ({ label, subtitle, availKey }: { label: string; subtitle: string; availKey: AvailKey }) => (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={[styles.toggleLabel, { color: theme.textPrimary }]}>{label}</Text>
        <Text style={[styles.availSub, { color: theme.textTertiary }]}>{subtitle}</Text>
      </View>
      <AnimatedSwitch value={!!avail[availKey]} onValueChange={(v) => patchAvailability(availKey, v)} />
    </View>
  );

  const AiToggle = ({ label, aiKey }: { label: string; aiKey: AiKey }) => {
    const locked = !planAtLeast(plan, 'platinum');
    return (
      <View style={styles.toggleRow}>
        <Text style={[styles.toggleLabel, { color: locked ? theme.textTertiary : theme.textPrimary }]}>{label}</Text>
        {locked ? (
          <Pressable style={styles.lockBtn} onPress={() => setUpgradeFor('platinum')}>
            <Ionicons name="lock-closed" size={14} color={theme.brand} />
            <Text style={[styles.lockText, { color: theme.brand }]}>platinum</Text>
          </Pressable>
        ) : (
          <AnimatedSwitch value={!!ai[aiKey]} onValueChange={(v) => patchAi(aiKey, v)} />
        )}
      </View>
    );
  };

  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: theme.textTertiary }]}>{title}</Text>
      <View style={[styles.groupCard, { backgroundColor: theme.surface }]}>{children}</View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Settings</Text>
        <Pressable onPress={() => router.push('/(tabs)/store')}>
          <Text style={[styles.upgradeLink, { color: theme.brand }]}>Upgrade</Text>
        </Pressable>
      </View>

      {!user ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Profile header */}
          <Pressable style={[styles.profile, { borderBottomColor: theme.border }]} onPress={() => router.push('/settings/edit-profile')}>
            <Avatar uri={user.primaryPhotoUrl} size={60} editable />
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: theme.textPrimary }]}>{user.firstName ?? 'Your profile'}</Text>
              <Text style={[styles.planText, { color: theme.textSecondary }]}>{user.plan.toUpperCase()} plan</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
          </Pressable>

          <Group title="VERIFICATION">
            <Pressable style={styles.actionRow} onPress={() => router.push('/verification')}>
              <Ionicons name="shield-checkmark-outline" size={20} color={user.isVerified ? theme.success : theme.textPrimary} />
              <Text style={[styles.actionText, { color: theme.textPrimary }]}>
                {user.isVerified ? 'Verified' : 'Get verified'}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} style={{ marginLeft: 'auto' }} />
            </Pressable>
          </Group>

          <Group title="DISCOVERY">
            <Toggle label="Discoverable" settingKey="discoverable" />
            <Toggle label="Show distance" settingKey="showDistance" />
            <Toggle label="Verified users only" settingKey="verifiedUsersOnlyFilter" requiredPlan="premium" />
            <Toggle label="Pause incoming messages" settingKey="pauseIncomingMessages" />
          </Group>

          <Group title="AVAILABILITY">
            <AvailRow label="Open to Group Additions" subtitle="Let anyone add you to groups directly" availKey="groupsAvailable" />
            <AvailRow label="Accept Audio Calls" subtitle="Allow others to audio call you" availKey="audioCallAvailable" />
            <AvailRow label="Accept Video Calls" subtitle="Allow others to video call you" availKey="videoCallAvailable" />
          </Group>

          <Group title="PRIVACY (GOLD+)">
            <Toggle label="Incognito mode" settingKey="incognito" requiredPlan="gold" />
            <Toggle label="Hide active status" settingKey="hideActiveStatus" requiredPlan="gold" />
            <Toggle label="Hide last seen" settingKey="hideLastSeen" requiredPlan="gold" />
            <Toggle label="Hide exact distance" settingKey="hideExactDistance" requiredPlan="gold" />
          </Group>

          <Group title="SAFETY">
            <Toggle label="Block offensive language" settingKey="blockOffensiveLanguage" />
            <Toggle label="Require profile completeness to message" settingKey="requireProfileCompletenessToMessage" />
            <Toggle label="Discreet mode" settingKey="disceetMode" />
            <Toggle label="Show orientation publicly" settingKey="showOrientationPublicly" />
          </Group>

          <Group title="AI FEATURES (PLATINUM+)">
            <AiToggle label="AI Icebreakers" aiKey="icebreakers" />
            <AiToggle label="AI Reply Suggestions" aiKey="replySuggestions" />
            <AiToggle label="AI Compatibility Score" aiKey="compatibility" />
            <AiToggle label="AI Daily Top 10" aiKey="dailyTop10" />
            <AiToggle label="AI Profile Optimizer" aiKey="profileOptimizer" />
          </Group>

          <Group title="CHATS">
            <Pressable style={styles.actionRow} onPress={() => router.push('/starred-messages' as Href)}>
              <Ionicons name="star-outline" size={20} color={theme.textPrimary} />
              <Text style={[styles.actionText, { color: theme.textPrimary }]}>Starred Messages</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} style={{ marginLeft: 'auto' }} />
            </Pressable>
            <Pressable style={styles.actionRow} onPress={() => router.push('/settings/notifications' as Href)}>
              <Ionicons name="notifications-outline" size={20} color={theme.textPrimary} />
              <Text style={[styles.actionText, { color: theme.textPrimary }]}>Notifications</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} style={{ marginLeft: 'auto' }} />
            </Pressable>
          </Group>

          <Group title="APPEARANCE">
            <View style={styles.toggleRow}>
              <Text style={[styles.toggleLabel, { color: theme.textPrimary }]}>Dark mode</Text>
              <AnimatedSwitch value={isDark} onValueChange={toggleTheme} />
            </View>
          </Group>

          <Group title="ACCOUNT">
            <Pressable style={styles.actionRow} onPress={onExport}>
              <Ionicons name="download-outline" size={20} color={theme.textPrimary} />
              <Text style={[styles.actionText, { color: theme.textPrimary }]}>Export my data</Text>
            </Pressable>
            <Pressable style={styles.actionRow} onPress={() => setDeleteOpen(true)}>
              <Ionicons name="trash-outline" size={20} color={theme.error} />
              <Text style={[styles.actionText, { color: theme.error }]}>Delete account</Text>
            </Pressable>
            <Pressable style={styles.actionRow} onPress={onLogout}>
              <Ionicons name="log-out-outline" size={20} color={theme.textPrimary} />
              <Text style={[styles.actionText, { color: theme.textPrimary }]}>Log out</Text>
            </Pressable>
          </Group>
        </ScrollView>
      )}

      <UpgradeModal
        visible={upgradeFor != null}
        onClose={() => setUpgradeFor(null)}
        title={`${upgradeFor ?? ''} feature`}
        message={`This feature is available on the ${upgradeFor ?? ''} plan and above.`}
      />

      {/* Delete-account confirm */}
      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
        <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.deleteCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.deleteTitle, { color: theme.textPrimary }]}>Delete account</Text>
            <Text style={[styles.deleteBody, { color: theme.textSecondary }]}>
              This permanently deletes your account and data. Type DELETE to confirm.
            </Text>
            <TextInput
              value={deletePhrase}
              onChangeText={setDeletePhrase}
              placeholder="DELETE"
              placeholderTextColor={theme.textTertiary}
              autoCapitalize="characters"
              style={[styles.deleteInput, { backgroundColor: theme.inputBackground, color: theme.textPrimary }]}
            />
            <Pressable
              disabled={deletePhrase !== 'DELETE' || busy}
              style={[styles.deleteBtn, { backgroundColor: deletePhrase === 'DELETE' ? theme.error : theme.callDisabled }]}
              onPress={onDelete}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteBtnText}>Delete forever</Text>}
            </Pressable>
            <Pressable style={styles.deleteCancel} onPress={() => setDeleteOpen(false)}>
              <Text style={{ color: theme.textSecondary }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {alertConfig ? <CustomAlert visible onDismiss={hideAlert} {...alertConfig} /> : null}
    </SafeAreaView>
  );
}

/** Map a settings key back to the User model field (where one exists). */
function mapSettingToUser(key: SettingKey, value: boolean): Record<string, unknown> {
  switch (key) {
    case 'discoverable':
      return { isOnGrid: value };
    case 'incognito':
      return { incognitoMode: value };
    case 'hideExactDistance':
      return { hideExactDistance: value };
    case 'showDistance':
      return { hideExactDistance: !value };
    case 'verifiedUsersOnlyFilter':
    case 'pauseIncomingMessages':
    case 'hideActiveStatus':
    case 'hideLastSeen':
    case 'requireProfileCompletenessToMessage':
    case 'disceetMode':
    case 'showOrientationPublicly':
      return { [key]: value };
    default:
      return {};
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  upgradeLink: { fontSize: 15, fontWeight: '700' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderBottomWidth: 1 },
  avatar: { width: 60, height: 60, borderRadius: 30 },
  editPencil: { position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  name: { fontSize: 20, fontWeight: '700' },
  planText: { fontSize: 13, marginTop: 2, fontWeight: '600' },
  group: { marginTop: 22, paddingHorizontal: 16 },
  groupTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  groupCard: { borderRadius: 14, paddingHorizontal: 14 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, minHeight: 48 },
  toggleLabel: { fontSize: 15, flex: 1, marginRight: 12 },
  availSub: { fontSize: 12, marginTop: 2 },
  lockBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  actionText: { fontSize: 15, fontWeight: '600' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  deleteCard: { width: '100%', borderRadius: 18, padding: 22, alignItems: 'center' },
  deleteTitle: { fontSize: 19, fontWeight: '800' },
  deleteBody: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  deleteInput: { width: '100%', height: 50, borderRadius: 12, paddingHorizontal: 16, marginTop: 16, fontSize: 16, textAlign: 'center', fontWeight: '700' },
  deleteBtn: { width: '100%', height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  deleteBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  deleteCancel: { marginTop: 14 },
});
