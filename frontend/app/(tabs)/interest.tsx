import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';

/** Interest (Taps / Views) — placeholder pending new designs (mock data removed). */
export default function Interest() {
  const { theme } = useTheme();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>Interest</Text>
      <View style={styles.center}>
        <Ionicons name="heart" size={48} color={theme.brand} />
        <Text style={[styles.h, { color: theme.textPrimary }]}>Coming soon</Text>
        <Text style={[styles.b, { color: theme.textSecondary }]}>See who tapped and viewed you here.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { fontSize: 26, fontWeight: '800', paddingHorizontal: 20, paddingTop: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  h: { fontSize: 20, fontWeight: '700' },
  b: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
