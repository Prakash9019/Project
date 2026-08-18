import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily } from '../theme';
import type { AlbumPrivacy } from '../types/api';

const OPTIONS: { value: AlbumPrivacy; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'everyone', label: 'Everyone', icon: 'globe-outline' },
  { value: 'matches', label: 'Matches', icon: 'heart-outline' },
  { value: 'chats_only', label: "People I've chatted with", icon: 'chatbubbles-outline' },
  { value: 'nobody', label: 'Only me', icon: 'lock-closed-outline' },
];

/** Privacy selector for an album — exposes exactly the four values the backend supports. */
export function AlbumPrivacyPicker({
  value,
  onChange,
}: {
  value: AlbumPrivacy;
  onChange: (privacy: AlbumPrivacy) => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.root}>
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            style={[
              styles.row,
              { borderColor: active ? theme.brand : theme.border, backgroundColor: active ? theme.brand + '1a' : theme.surfaceElevated },
            ]}
            onPress={() => onChange(opt.value)}
          >
            <Ionicons name={opt.icon} size={18} color={active ? theme.brand : theme.textSecondary} />
            <Text style={[styles.label, { color: active ? theme.brand : theme.textPrimary }]}>{opt.label}</Text>
            {active ? <Ionicons name="checkmark-circle" size={18} color={theme.brand} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14 },
  label: { flex: 1, fontSize: 14, fontFamily: FontFamily.semibold, fontWeight: '600' },
});
