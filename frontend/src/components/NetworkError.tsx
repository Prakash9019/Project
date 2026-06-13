import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

/** Full-screen network/error state with a retry button. */
export function NetworkError({
  message = 'Something went wrong. Check your connection and try again.',
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Ionicons name="cloud-offline-outline" size={48} color={theme.textTertiary} />
      <Text style={[styles.title, { color: theme.textPrimary }]}>Connection problem</Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>{message}</Text>
      <Pressable style={[styles.btn, { backgroundColor: theme.brand }]} onPress={onRetry}>
        <Text style={[styles.btnText, { color: theme.textInverse }]}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  btn: { marginTop: 8, height: 46, borderRadius: 999, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '700' },
});
