import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme';
import { getVerificationStatus, VerificationStatusResponse } from '../src/services/api';

export default function Verification() {
  const router = useRouter();
  const { theme } = useTheme();
  const [status, setStatus] = useState<VerificationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getVerificationStatus()
      .then(setStatus)
      .catch(() => { /* shown as default */ })
      .finally(() => setLoading(false));
  }, []);

  const Row = ({ icon, label, done }: { icon: any; label: string; done: boolean }) => (
    <View style={[styles.row, { backgroundColor: theme.surface }]}>
      <Ionicons name={icon} size={22} color={done ? theme.success : theme.textSecondary} />
      <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{label}</Text>
      {done ? (
        <View style={styles.doneTag}>
          <Ionicons name="checkmark-circle" size={18} color={theme.success} />
          <Text style={[styles.doneText, { color: theme.success }]}>Verified</Text>
        </View>
      ) : (
        <Ionicons name="close-circle-outline" size={20} color={theme.textTertiary} />
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Verification</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.brand} /></View>
      ) : (
        <View style={styles.body}>
          <View style={[styles.banner, { backgroundColor: status?.isVerified ? theme.success + '22' : theme.surfaceElevated }]}>
            <Ionicons
              name={status?.isVerified ? 'shield-checkmark' : 'shield-outline'}
              size={28}
              color={status?.isVerified ? theme.success : theme.textSecondary}
            />
            <Text style={[styles.bannerText, { color: theme.textPrimary }]}>
              {status?.isVerified ? "You're verified" : 'Get the blue tick'}
            </Text>
            <Text style={[styles.bannerSub, { color: theme.textSecondary }]}>
              You're verified once your phone or email is confirmed.
            </Text>
          </View>

          <Row icon="call" label="Phone verified" done={!!status?.phoneVerified} />
          <Row icon="mail" label="Email verified" done={!!status?.emailVerified} />
          <Row icon="school" label="College verified" done={!!status?.isCollegeVerified} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { fontSize: 18, fontWeight: '700' },
  body: { padding: 16, gap: 12 },
  banner: { borderRadius: 16, padding: 20, alignItems: 'center', gap: 6, marginBottom: 8 },
  bannerText: { fontSize: 18, fontWeight: '800' },
  bannerSub: { fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 16 },
  rowLabel: { fontSize: 15, fontWeight: '600', flex: 1 },
  doneTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  doneText: { fontSize: 13, fontWeight: '700' },
});
