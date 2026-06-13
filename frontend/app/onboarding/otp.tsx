import { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../src/theme';
import { T } from '../../src/components/ui';
import { requestOtp, verifyOtp, ApiError } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';

const LEN = 6;

export default function OtpScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const login = useAuthStore((s) => s.login);

  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(30);
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const submit = async (code: string) => {
    if (loading || !phone) return;
    setLoading(true);
    setError(null);
    try {
      const res = await verifyOtp(phone, code);
      await login(res.accessToken, res.refreshToken, res.user);
      if (res.isNewUser || !res.profileComplete) {
        router.replace('/onboarding/setup');
      } else {
        router.replace('/(tabs)');
      }
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 429) setError('Too many attempts. Please wait and try again.');
      else if (err.status === 400) setError('Invalid or expired code. Please re-enter.');
      else setError(err.message ?? 'Verification failed.');
      setDigits(Array(LEN).fill(''));
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const onChange = (text: string, idx: number) => {
    const clean = text.replace(/[^0-9]/g, '');
    if (!clean) {
      setDigits((d) => d.map((v, i) => (i === idx ? '' : v)));
      return;
    }
    // Support paste of full code
    if (clean.length > 1) {
      const next = clean.slice(0, LEN).split('');
      const filled = Array(LEN)
        .fill('')
        .map((_, i) => next[i] ?? '');
      setDigits(filled);
      if (filled.every((c) => c !== '')) submit(filled.join(''));
      else inputs.current[Math.min(next.length, LEN - 1)]?.focus();
      return;
    }
    const newDigits = digits.map((v, i) => (i === idx ? clean : v));
    setDigits(newDigits);
    if (idx < LEN - 1) inputs.current[idx + 1]?.focus();
    if (newDigits.every((c) => c !== '')) submit(newDigits.join(''));
  };

  const onKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>, idx: number) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
      setDigits((d) => d.map((v, i) => (i === idx - 1 ? '' : v)));
    }
  };

  const resend = async () => {
    if (cooldown > 0 || !phone) return;
    try {
      await requestOtp(phone);
      setCooldown(30);
      setError(null);
    } catch (e) {
      const err = e as ApiError;
      setError(err.status === 429 ? 'Please wait before requesting another code.' : err.message);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <Pressable style={styles.back} onPress={() => router.back()} hitSlop={12}>
        <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
      </Pressable>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.body}>
          <T style={[styles.title, { color: theme.textPrimary }]}>Enter the code</T>
          <T style={[styles.sub, { color: theme.textSecondary }]}>
            Sent to {phone}
          </T>

          <View style={styles.boxes}>
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={(r) => {
                  inputs.current[i] = r;
                }}
                value={d}
                onChangeText={(t) => onChange(t, i)}
                onKeyPress={(e) => onKeyPress(e, i)}
                keyboardType="number-pad"
                maxLength={LEN}
                autoFocus={i === 0}
                style={[
                  styles.box,
                  {
                    backgroundColor: theme.inputBackground,
                    color: theme.textPrimary,
                    borderColor: d ? theme.brand : 'transparent',
                  },
                ]}
              />
            ))}
          </View>

          {loading && <ActivityIndicator color={theme.brand} style={{ marginTop: 16 }} />}
          {error && <T style={[styles.error, { color: theme.error }]}>{error}</T>}

          <Pressable onPress={resend} disabled={cooldown > 0} style={styles.resend}>
            <T style={[styles.resendText, { color: cooldown > 0 ? theme.textTertiary : theme.brand }]}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </T>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  back: { padding: 16 },
  body: { flex: 1, paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 12 },
  sub: { fontSize: 15, marginTop: 10 },
  boxes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 32 },
  box: {
    width: 48,
    height: 58,
    borderRadius: 12,
    borderWidth: 2,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
  },
  error: { fontSize: 13, marginTop: 16 },
  resend: { marginTop: 24, alignSelf: 'flex-start' },
  resendText: { fontSize: 15, fontWeight: '600' },
});
