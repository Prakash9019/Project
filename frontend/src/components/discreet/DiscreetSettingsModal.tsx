import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, FontFamily, FontSize } from '../../theme';
import {
  DiscreetConfig,
  DisguiseIcon,
  getDiscreetConfig,
  updateDiscreetConfig,
  setAppIcon,
  setCamouflageMode,
  isExpoGo,
} from '../../services/discreetService';

const ICONS: { id: DisguiseIcon; name: string; icon: React.ComponentProps<typeof Ionicons>['name']; bg: string; color: string }[] = [
  { id: 'default', name: 'NearMe', icon: 'heart', bg: '#FF4D67', color: '#fff' },
  { id: 'calculator', name: 'Calculator', icon: 'calculator', bg: '#2B2B2B', color: '#FF9F0A' },
  { id: 'notes', name: 'Quick Notes', icon: 'document-text', bg: '#F5A623', color: '#fff' },
  { id: 'weather', name: 'Weather', icon: 'partly-sunny', bg: '#4A90E2', color: '#fff' },
  { id: 'calendar', name: 'Calendar', icon: 'calendar', bg: '#E74C3C', color: '#fff' },
  { id: 'news', name: 'Daily News', icon: 'newspaper', bg: '#5C6BC0', color: '#fff' },
];

export function DiscreetSettingsModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const [config, setConfig] = useState<DiscreetConfig>(getDiscreetConfig());
  const [inExpoGo] = useState(isExpoGo());

  useEffect(() => {
    if (visible) {
      setConfig(getDiscreetConfig());
    }
  }, [visible]);

  const toggleMaster = async (val: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    const updated = await updateDiscreetConfig({ enabled: val });
    setConfig(updated);
  };

  const selectIcon = async (iconId: DisguiseIcon) => {
    Haptics.selectionAsync().catch(() => {});
    await setAppIcon(iconId);
    setConfig((prev) => ({ ...prev, selectedIcon: iconId }));
  };

  const toggleNotifications = async (val: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    const updated = await updateDiscreetConfig({ hideNotificationPreviews: val });
    setConfig(updated);
  };

  const toggleDecoy = async (val: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    const updated = await updateDiscreetConfig({ decoyCalculatorEnabled: val });
    setConfig(updated);
  };

  const triggerCamouflage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onClose();
    setTimeout(() => {
      setCamouflageMode(true);
    }, 200);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHeader}>
            <View style={[styles.titleIcon, { backgroundColor: theme.brand + '22' }]}>
              <Ionicons name="shield-checkmark" size={22} color={theme.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>Discreet & Privacy Mode</Text>
              <Text style={[styles.sheetSubtitle, { color: theme.textSecondary }]}>
                Disguise the app icon, mask notifications, and enable decoy calculator
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={theme.textTertiary} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {/* Master Toggle */}
            <View style={[styles.card, { backgroundColor: theme.backgroundTertiary }]}>
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Discreet Mode Active</Text>
                  <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
                    Enables disguise app icon, masked notifications, and decoy protection
                  </Text>
                </View>
                <Switch
                  value={config.enabled}
                  onValueChange={toggleMaster}
                  trackColor={{ false: theme.border, true: theme.brand }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {/* App Icon Disguise */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>DISGUISE APP ICON</Text>
              {inExpoGo && (
                <View style={[styles.badge, { backgroundColor: theme.warning + '22' }]}>
                  <Text style={[styles.badgeText, { color: theme.warning }]}>Expo Go Preview</Text>
                </View>
              )}
            </View>

            <View style={styles.iconGrid}>
              {ICONS.map((item) => {
                const selected = config.selectedIcon === item.id;
                return (
                  <Pressable
                    key={item.id}
                    style={[
                      styles.iconTile,
                      { backgroundColor: theme.backgroundTertiary, borderColor: selected ? theme.brand : theme.border },
                      selected && { borderWidth: 2 },
                    ]}
                    onPress={() => selectIcon(item.id)}
                  >
                    <View style={[styles.iconGraphic, { backgroundColor: item.bg }]}>
                      <Ionicons name={item.icon} size={26} color={item.color} />
                    </View>
                    <Text style={[styles.iconName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {selected ? (
                      <View style={[styles.selectedCheck, { backgroundColor: theme.brand }]}>
                        <Ionicons name="checkmark" size={12} color="#fff" />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            {inExpoGo && (
              <Text style={[styles.hintText, { color: theme.textTertiary }]}>
                Note: In Expo Go testing, app icon styling is simulated in-app. Dynamic home screen icon switching activates automatically in production builds via native activity aliases.
              </Text>
            )}

            {/* Notification Privacy */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>PRIVACY & NOTIFICATIONS</Text>
            </View>

            <View style={[styles.card, { backgroundColor: theme.backgroundTertiary }]}>
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Mask Push Notifications</Text>
                  <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
                    Displays generic &quot;New notification&quot; instead of message text or sender name
                  </Text>
                </View>
                <Switch
                  value={config.hideNotificationPreviews}
                  onValueChange={toggleNotifications}
                  trackColor={{ false: theme.border, true: theme.brand }}
                  thumbColor="#fff"
                />
              </View>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>Decoy Calculator</Text>
                  <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
                    Provides a working calculator disguise with secret PIN unlock
                  </Text>
                </View>
                <Switch
                  value={config.decoyCalculatorEnabled}
                  onValueChange={toggleDecoy}
                  trackColor={{ false: theme.border, true: theme.brand }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {/* Test Camouflage Button */}
            <Pressable
              style={[styles.decoyLaunchBtn, { backgroundColor: theme.brand + '18', borderColor: theme.brand + '40' }]}
              onPress={triggerCamouflage}
            >
              <Ionicons name="calculator" size={20} color={theme.brand} />
              <Text style={[styles.decoyLaunchText, { color: theme.brand }]}>Open Decoy Calculator Now</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', padding: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  titleIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.bold },
  sheetSubtitle: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 2 },
  body: { flexGrow: 0 },
  bodyContent: { paddingBottom: 32, gap: 14 },
  card: { borderRadius: 16, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  cardSub: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, marginTop: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  sectionTitle: { fontSize: FontSize.xs, fontFamily: FontFamily.bold, letterSpacing: 0.5 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: FontFamily.semibold },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  iconTile: { width: '31%', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1, position: 'relative' },
  iconGraphic: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  iconName: { fontSize: FontSize.xs, fontFamily: FontFamily.medium, textAlign: 'center' },
  selectedCheck: { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  hintText: { fontSize: 11, fontFamily: FontFamily.regular, lineHeight: 16 },
  decoyLaunchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 12, borderWidth: 1, marginTop: 8 },
  decoyLaunchText: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
});
