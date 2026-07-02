import { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme, FontFamily, DisplayFont } from '../../src/theme';
import { T } from '../../src/components/ui';
import OtpCodeInput from '../../src/components/OtpCodeInput';
import { verifyEmailOtp, sendEmailOtp, ApiError } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';

const RESEND_COOLDOWN = 30;

export default function EmailCode() {
  const router = useRouter();
  const { theme } = useTheme();
  const login = useAuthStore((s) => s.login);
  const { email } = useLocalSearchParams<{ email: string }>();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = async (fullCode: string) => {
    if (loading || !email) return;
    setLoading(true);
    setError(null);
    try {
      const res = await verifyEmailOtp(email, fullCode);
      await login(res.accessToken, res.refreshToken, res.user);
      router.replace(res.isNewUser || !res.profileComplete ? '/onboarding/setup' : '/(tabs)');
    } catch (e: unknown) {
      const err = e as ApiError;
      if (err.code === 'invalid_code') setError('That code is incorrect. Try again.');
      else if (err.code === 'code_expired_or_invalid') setError('That code expired. Request a new one.');
      else setError(err.message ?? 'Verification failed. Please try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || !email) return;
    setError(null);
    try {
      await sendEmailOtp(email);
      setCooldown(RESEND_COOLDOWN);
    } catch (e: unknown) {
      const err = e as ApiError;
      setError(err.status === 429 ? 'Too many requests. Please wait before retrying.' : 'Could not resend the code.');
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={theme.textSecondary} />
          </Pressable>

          <T style={[styles.heading, { color: theme.textPrimary }]}>Enter the code</T>
          <T style={[styles.subheading, { color: theme.textSecondary }]}>
            We sent a 6-digit code to {email ?? 'your email'}.
          </T>

          <OtpCodeInput value={code} onChange={setCode} onComplete={verify} editable={!loading} />

          {error && (
            <View style={[styles.errorBox, { backgroundColor: `${theme.error}15`, borderColor: `${theme.error}40` }]}>
              <Ionicons name="alert-circle-outline" size={15} color={theme.error} />
              <T style={[styles.errorText, { color: theme.error }]}>{error}</T>
            </View>
          )}

          <Pressable disabled={code.length < 6 || loading} onPress={() => verify(code)} style={({ pressed }) => [styles.primaryBtnWrap, { opacity: pressed ? 0.9 : 1 }]}>
            <LinearGradient
              colors={code.length === 6 ? theme.gradientWarm : [theme.inputBackground, theme.inputBackground]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.primaryBtn}
            >
              {loading ? <ActivityIndicator color="#fff" /> : (
                <T style={[styles.primaryLabel, { color: code.length === 6 ? '#fff' : theme.textTertiary }]}>Verify</T>
              )}
            </LinearGradient>
          </Pressable>

          <Pressable onPress={resend} disabled={cooldown > 0} style={styles.resendRow}>
            <T style={[styles.resendText, { color: cooldown > 0 ? theme.textTertiary : theme.brand }]}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </T>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 },
  backBtn: { width: 36, height: 36, justifyContent: 'center', marginBottom: 16 },
  heading: { fontSize: 28, fontFamily: DisplayFont.heavy, fontWeight: '800' },
  subheading: { fontSize: 14, fontFamily: FontFamily.regular, marginTop: 8, marginBottom: 28 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 16 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  primaryBtnWrap: { marginTop: 24, borderRadius: 999 },
  primaryBtn: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 16, fontFamily: DisplayFont.bold, fontWeight: '700' },
  resendRow: { alignItems: 'center', marginTop: 20 },
  resendText: { fontSize: 14, fontFamily: FontFamily.semibold, fontWeight: '600' },
});
