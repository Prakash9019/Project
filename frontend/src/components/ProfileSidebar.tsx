import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme, FontFamily, DisplayFont } from '../theme';
import { Avatar } from './Avatar';
import { useAuthStore } from '../store/authStore';
import { updateSettings } from '../services/api';
import { planLabel, planBadgeColor, planAtLeast } from '../lib/format';
import { showSuccess, toastApiError } from '../lib/toast';

const SIDEBAR_WIDTH = 280;

type MenuItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

/**
 * Sliding profile sidebar for the Browse screen. Slides in from the LEFT with a
 * dark backdrop over the remaining screen width. Self-contained: accepts
 * `isOpen` + `onClose`. Render only on Browse (not globally).
 */
export function ProfileSidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  const slideAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(isOpen);

  const isGoldPlus = planAtLeast(user?.plan, 'gold');
  // Online = NOT hiding active status. Incognito mirrors user.incognitoMode.
  const online = !(user?.hideActiveStatus ?? false);
  const incognito = user?.incognitoMode ?? false;

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -SIDEBAR_WIDTH, duration: 240, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) setMounted(false); });
    }
  }, [isOpen, slideAnim, fadeAnim]);

  if (!mounted) return null;

  const go = (fn: () => void) => { onClose(); fn(); };

  const menu: MenuItem[] = [
    { key: 'nearme', label: 'NearMe', icon: 'home-outline', onPress: () => go(() => router.push('/(tabs)')) },
    { key: 'friends', label: 'Friends', icon: 'people-outline', onPress: () => go(() => showSuccess('Friends is coming soon', 'Coming soon')) },
    { key: 'edit', label: 'Edit Profile', icon: 'create-outline', onPress: () => go(() => router.push('/settings/edit-profile')) },
    { key: 'albums', label: 'My Albums', icon: 'images-outline', onPress: () => go(() => router.push('/albums')) },
    { key: 'safety', label: 'Safety & Security', icon: 'shield-outline', onPress: () => go(() => router.push('/settings')) },
    { key: 'privacy', label: 'Privacy Settings', icon: 'lock-closed-outline', onPress: () => go(() => router.push('/settings')) },
    { key: 'help', label: 'Help Center', icon: 'help-circle-outline', onPress: () => go(() => Linking.openURL('https://help.nearme.app').catch(() => {})) },
    { key: 'settings', label: 'Settings', icon: 'settings-outline', onPress: () => go(() => router.push('/settings')) },
  ];

  const toggleOnline = async () => {
    if (!user) return;
    const next = !online; // next online state
    setUser({ ...user, hideActiveStatus: !next });
    try {
      await updateSettings({ hideActiveStatus: !next });
    } catch (e) {
      setUser({ ...user, hideActiveStatus: online ? false : true });
      toastApiError(e, 'Could not update status');
    }
  };

  const toggleIncognito = async () => {
    if (!user) return;
    if (!isGoldPlus) { go(() => router.push('/(tabs)/store')); return; }
    const next = !incognito;
    setUser({ ...user, incognitoMode: next });
    try {
      await updateSettings({ incognito: next });
    } catch (e) {
      setUser({ ...user, incognitoMode: incognito });
      toastApiError(e, 'Could not update incognito');
    }
  };

  const doLogout = async () => {
    onClose();
    await logout();
    router.replace('/onboarding');
  };

  const badgeLabel = planLabel(user?.plan);
  const badgeColor = planBadgeColor(theme, user?.plan);

  const Separator = () => <View style={[styles.sep, { backgroundColor: theme.border }]} />;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop over the right portion */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]} pointerEvents={isOpen ? 'auto' : 'none'}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay }]} onPress={onClose} />
      </Animated.View>

      {/* Sliding panel */}
      <Animated.View
        style={[
          styles.panel,
          { width: SIDEBAR_WIDTH, backgroundColor: theme.background, transform: [{ translateX: slideAnim }] },
        ]}
      >
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            {/* Header */}
            <View style={styles.headerRow}>
              <Avatar uri={user?.primaryPhotoUrl} size={60} online={online} />
              <View style={styles.headerText}>
                <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
                  {user?.firstName ?? 'You'}
                </Text>
                {badgeLabel && badgeColor ? (
                  <View style={[styles.planBadge, { backgroundColor: badgeColor }]}>
                    <Text style={styles.planBadgeText}>{badgeLabel}</Text>
                  </View>
                ) : (
                  <Text style={[styles.planFree, { color: theme.textTertiary }]}>Free plan</Text>
                )}
              </View>
            </View>

            <Separator />

            {/* Menu items */}
            <View style={styles.menu}>
              {menu.map((m) => (
                <Pressable key={m.key} style={styles.menuRow} onPress={m.onPress}>
                  <Ionicons name={m.icon} size={22} color={theme.textPrimary} />
                  <Text style={[styles.menuLabel, { color: theme.textPrimary }]}>{m.label}</Text>
                </Pressable>
              ))}
            </View>

            <Separator />

            {/* Toggles */}
            <View style={styles.toggles}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <Ionicons name="radio-outline" size={22} color={theme.textPrimary} />
                  <Text style={[styles.menuLabel, { color: theme.textPrimary }]}>Online Status</Text>
                </View>
                <Pressable onPress={toggleOnline} style={[styles.switch, { backgroundColor: online ? theme.online : theme.backgroundTertiary }]}>
                  <View style={[styles.knob, { transform: [{ translateX: online ? 20 : 2 }] }]} />
                </Pressable>
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <Ionicons name="eye-off-outline" size={22} color={isGoldPlus ? theme.textPrimary : theme.textTertiary} />
                  <Text style={[styles.menuLabel, { color: isGoldPlus ? theme.textPrimary : theme.textTertiary }]}>Incognito Mode</Text>
                  {!isGoldPlus && <Ionicons name="lock-closed" size={13} color={theme.brand} style={{ marginLeft: 4 }} />}
                </View>
                <Pressable onPress={toggleIncognito} style={[styles.switch, { backgroundColor: incognito ? theme.brand : theme.backgroundTertiary }]}>
                  <View style={[styles.knob, { transform: [{ translateX: incognito ? 20 : 2 }] }]} />
                </Pressable>
              </View>
            </View>

            <Separator />

            <Pressable style={styles.menuRow} onPress={() => go(() => router.push('/(tabs)/store'))}>
              <Ionicons name="flash-outline" size={22} color={theme.textPrimary} />
              <Text style={[styles.menuLabel, { color: theme.textPrimary }]}>Add-ons</Text>
            </Pressable>

            <Separator />

            <Pressable style={styles.menuRow} onPress={doLogout}>
              <Ionicons name="log-out-outline" size={22} color={theme.error} />
              <Text style={[styles.menuLabel, { color: theme.error }]}>Log Out</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18 },
  headerText: { flex: 1, gap: 6 },
  name: { fontSize: 20, fontFamily: DisplayFont.bold, fontWeight: '700' },
  planBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  planBadgeText: { color: '#fff', fontSize: 11, fontFamily: FontFamily.bold, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  planFree: { fontSize: 13, fontFamily: FontFamily.regular },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 6, marginHorizontal: 20 },
  menu: { paddingVertical: 4 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 13 },
  menuLabel: { fontSize: 16, fontFamily: FontFamily.semibold, fontWeight: '600' },
  toggles: { paddingVertical: 4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 13 },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  switch: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
});
