import { useRef, useState } from 'react';
import {
  View, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme, FontFamily, DisplayFont } from '../../src/theme';
import { T } from '../../src/components/ui';
import { sendEmailOtp, devLogin, ApiError } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';

// Seed personas (dev builds) still log in with email + password via /auth/dev-login.
const SEED_EMAIL_SUFFIX = '@nearme.dev';

export default function EmailLogin() {
  const router = useRouter();
  const { theme } = useTheme();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const trimmed = email.trim();
  const isDev = trimmed.toLowerCase().endsWith(SEED_EMAIL_SUFFIX);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  const isReady = isDev ? emailValid && password.length > 0 : emailValid;

  const handleSubmit = async () => {
    if (loading || !isReady) return;
    setLoading(true);
    setError(null);
    try {
      if (isDev) {
        const res = await devLogin(trimmed, password);
        await login(res.accessToken, res.refreshToken, res.user);
        router.replace('/(tabs)');
        return;
      }
      await sendEmailOtp(trimmed);
      router.push({ pathname: '/onboarding/email-code', params: { email: trimmed } });
    } catch (e: unknown) {
      const err = e as ApiError;
      if (err.status === 429) setError('Too many requests. Please wait a moment and try again.');
      else setError(err.message ?? 'Could not send the code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={theme.textSecondary} />
          </Pressable>

          <T style={[styles.heading, { color: theme.textPrimary }]}>Enter your email</T>
          <T style={[styles.subheading, { color: theme.textSecondary }]}>
            We&apos;ll email you a 6-digit code to sign in.
          </T>

          <View style={[styles.inputWrap, { backgroundColor: theme.inputBackground }]}>
            <Ionicons name="mail-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
            <TextInput
              value={email}
              onChangeText={(v) => { setEmail(v); setError(null); }}
              placeholder="Email address"
              placeholderTextColor={theme.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType={isDev ? 'next' : 'done'}
              onSubmitEditing={() => (isDev ? passwordRef.current?.focus() : handleSubmit())}
              style={[styles.input, { color: theme.textPrimary }]}
            />
          </View>

          {isDev && (
            <View style={[styles.inputWrap, { backgroundColor: theme.inputBackground }]}>
              <Ionicons name="lock-closed-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={(v) => { setPassword(v); setError(null); }}
                placeholder="Demo password"
                placeholderTextColor={theme.textTertiary}
                secureTextEntry
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                style={[styles.input, { color: theme.textPrimary }]}
              />
            </View>
          )}

          {error && (
            <View style={[styles.errorBox, { backgroundColor: `${theme.error}15`, borderColor: `${theme.error}40` }]}>
              <Ionicons name="alert-circle-outline" size={15} color={theme.error} />
              <T style={[styles.errorText, { color: theme.error }]}>{error}</T>
            </View>
          )}

          <Pressable disabled={!isReady || loading} onPress={handleSubmit} style={({ pressed }) => [styles.primaryBtnWrap, { opacity: pressed ? 0.9 : 1 }]}>
            <LinearGradient
              colors={isReady ? theme.gradientWarm : [theme.inputBackground, theme.inputBackground]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.primaryBtn}
            >
              {loading ? <ActivityIndicator color="#fff" /> : (
                <T style={[styles.primaryLabel, { color: isReady ? '#fff' : theme.textTertiary }]}>
                  {isDev ? 'Log In' : 'Send Code'}
                </T>
              )}
            </LinearGradient>
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
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 14, height: 52, marginBottom: 12 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, fontFamily: FontFamily.regular },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  primaryBtnWrap: { marginTop: 8, borderRadius: 999 },
  primaryBtn: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 16, fontFamily: DisplayFont.bold, fontWeight: '700' },
});
