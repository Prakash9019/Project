import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, FontFamily, FontSize } from '../../theme';
import type { Message } from '../../types/api';

function fullTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}, ${time}`;
}

function previewFor(message: Message): string {
  if (message.isUnsent) return 'message removed';
  if (message.type === 'photo' || message.type === 'expiring_photo') return '📷 Photo';
  if (message.type === 'video') return '🎥 Video';
  if (message.type === 'voice' || message.type === 'voice_note') return '🎤 Voice message';
  return message.content ?? 'Media';
}

type Step = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: 'tertiary' | 'grey' | 'blue';
  timestamp: string | null;
  fallback: string;
};

export function MessageInfo({
  message,
  isOwn,
  onClose,
}: {
  message: Message | null;
  isOwn: boolean;
  onClose: () => void;
}) {
  const { theme } = useTheme();

  if (!message) return null;

  const steps: Step[] = [
    { key: 'sent', label: 'Sent', icon: 'time-outline', color: 'tertiary', timestamp: message.createdAt, fallback: '' },
    { key: 'delivered', label: 'Delivered', icon: 'checkmark-done', color: 'grey', timestamp: message.deliveredAt, fallback: 'Waiting for delivery' },
    { key: 'read', label: 'Read', icon: 'checkmark-done', color: 'blue', timestamp: message.readAt, fallback: 'Not yet read' },
  ];

  const iconColor = (c: Step['color']) =>
    c === 'blue' ? theme.info : c === 'grey' ? theme.textTertiary : theme.textTertiary;

  return (
    <Modal visible={!!message} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={[styles.title, { color: theme.textPrimary }]}>Message Info</Text>

          {isOwn ? (
            <LinearGradient
              colors={theme.gradientWarm}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.previewBubble, { alignSelf: 'flex-end' }]}
            >
              <Text style={styles.previewTextMe} numberOfLines={2}>{previewFor(message)}</Text>
            </LinearGradient>
          ) : (
            <View style={[styles.previewBubble, { backgroundColor: theme.surfaceElevated, alignSelf: 'flex-start' }]}>
              <Text style={[styles.previewText, { color: theme.textPrimary }]} numberOfLines={2}>{previewFor(message)}</Text>
            </View>
          )}

          <View style={styles.timeline}>
            {steps.map((s, i) => (
              <View key={s.key} style={styles.stepRow}>
                <View style={styles.stepLeft}>
                  <View style={[styles.iconCircle, { backgroundColor: theme.backgroundTertiary }]}>
                    <Ionicons name={s.icon} size={16} color={iconColor(s.color)} />
                  </View>
                  {i < steps.length - 1 ? <View style={[styles.connector, { backgroundColor: theme.border }]} /> : null}
                </View>
                <View style={styles.stepBody}>
                  <Text style={[styles.stepLabel, { color: theme.textPrimary }]}>{s.label}</Text>
                  <Text style={[styles.stepTime, { color: theme.textTertiary }]}>
                    {s.timestamp ? fullTimestamp(s.timestamp) : s.fallback}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <Pressable style={styles.close} onPress={onClose}>
            <Text style={{ color: theme.brand, fontFamily: FontFamily.semibold }}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.4)', alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: FontSize.lg, fontFamily: FontFamily.semibold, marginBottom: 14 },
  previewBubble: { maxWidth: '85%', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9, marginBottom: 20 },
  previewText: { fontSize: FontSize.md, fontFamily: FontFamily.regular },
  previewTextMe: { fontSize: FontSize.md, fontFamily: FontFamily.regular, color: '#fff' },
  timeline: { gap: 0 },
  stepRow: { flexDirection: 'row' },
  stepLeft: { alignItems: 'center', width: 32 },
  iconCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  connector: { width: 2, flex: 1, minHeight: 22, marginVertical: 2 },
  stepBody: { flex: 1, paddingLeft: 12, paddingBottom: 18 },
  stepLabel: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  stepTime: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 2 },
  close: { alignItems: 'center', marginTop: 4 },
});
