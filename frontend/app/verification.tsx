import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../src/theme';
import {
  getVerificationStatus,
  verifyPhoto,
  verifyFace,
  VerificationStatusResponse,
  ApiError,
} from '../src/services/api';
import { useAuthStore } from '../src/store/authStore';

export default function Verification() {
  const router = useRouter();
  const { theme } = useTheme();
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [status, setStatus] = useState<VerificationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'photo' | 'face' | null>(null);

  const load = async () => {
    try {
      setStatus(await getVerificationStatus());
    } catch {
      /* shown as default */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const submit = async (kind: 'photo' | 'face') => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera needed', 'Allow camera access to verify.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    setBusy(kind);
    try {
      if (kind === 'photo') await verifyPhoto(res.assets[0].uri);
      else await verifyFace(res.assets[0].uri);
      await load();
      await refreshUser();
      Alert.alert('Submitted', 'Your verification is being reviewed.');
    } catch (e) {
      Alert.alert('Failed', (e as ApiError).message ?? 'Try again.');
    } finally {
      setBusy(null);
    }
  };

  const Row = ({
    icon,
    label,
    done,
    onPress,
    loadingKey,
  }: {
    icon: any;
    label: string;
    done: boolean;
    onPress: () => void;
    loadingKey?: 'photo' | 'face';
  }) => (
    <View style={[styles.row, { backgroundColor: theme.surface }]}>
      <Ionicons name={icon} size={22} color={done ? theme.success : theme.textSecondary} />
      <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{label}</Text>
      {done ? (
        <View style={styles.doneTag}>
          <Ionicons name="checkmark-circle" size={18} color={theme.success} />
          <Text style={[styles.doneText, { color: theme.success }]}>Verified</Text>
        </View>
      ) : (
        <Pressable style={[styles.verifyBtn, { backgroundColor: theme.brand }]} onPress={onPress} disabled={busy != null}>
          {busy === loadingKey ? <ActivityIndicator size="small" color={theme.textInverse} /> : <Text style={[styles.verifyText, { color: theme.textInverse }]}>Verify</Text>}
        </Pressable>
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
              Verified status requires both phone and face verification.
            </Text>
          </View>

          <Row icon="call" label="Phone verified" done={!!status?.phoneVerified} onPress={() => {}} />
          <Row icon="image" label="Photo verification" done={!!status?.photoVerified} onPress={() => submit('photo')} loadingKey="photo" />
          <Row icon="happy" label="Face verification" done={!!status?.faceVerified} onPress={() => submit('face')} loadingKey="face" />
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
  verifyBtn: { borderRadius: 999, paddingHorizontal: 18, height: 36, alignItems: 'center', justifyContent: 'center', minWidth: 72 },
  verifyText: { fontSize: 14, fontWeight: '700' },
});
