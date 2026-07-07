import { useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme, FontFamily, DisplayFont } from '../../src/theme';
import { T } from '../../src/components/ui';
import { NearMeLogo } from '../../src/components/icons';
import { firebaseLogin } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';

// Lazy-require Firebase to keep web bundle from breaking.
function getGoogleSignin() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleSignin } = require('@react-native-google-signin/google-signin');
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
  return GoogleSignin;
}
function getAuthModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-firebase/app');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-firebase/auth');
}

export default function AuthScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const login = useAuthStore((s) => s.login);

  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFirebaseToken = async (idToken: string) => {
    const res = await firebaseLogin(idToken);
    await login(res.accessToken, res.refreshToken, res.user);
    router.replace(res.isNewUser || !res.profileComplete ? '/onboarding/setup' : '/(tabs)');
  };

  const handleGoogleSignIn = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    setError(null);
    try {
      const GoogleSignin = getGoogleSignin();
      await GoogleSignin.hasPlayServices();
      const { data } = await GoogleSignin.signIn();
      if (!data?.idToken) throw new Error('Google sign-in cancelled');
      // Modular API (RNFB v22+): free functions instead of namespaced methods.
      const { getAuth, GoogleAuthProvider, signInWithCredential, getIdToken } = getAuthModule();
      const googleCredential = GoogleAuthProvider.credential(data.idToken);
      const userCredential = await signInWithCredential(getAuth(), googleCredential);
      const idToken = await getIdToken(userCredential.user);
      await handleFirebaseToken(idToken);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === 'SIGN_IN_CANCELLED' || err.code === 'IN_PROGRESS') {
        // user cancelled / already running — silent
      } else {
        setError('Google sign-in failed. Please try again.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Logo */}
        <View style={styles.logoRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={theme.textSecondary} />
          </Pressable>
          <View style={styles.logoWrap}>
            <NearMeLogo size={44} color={theme.brand} />
          </View>
          <View style={styles.backBtn} />
        </View>

        <T style={[styles.heading, { color: theme.textPrimary }]}>Welcome to NearMe</T>
        <T style={[styles.subheading, { color: theme.textSecondary }]}>
          Choose how you&apos;d like to continue
        </T>

        {/* Continue with Phone */}
        <Pressable
          onPress={() => router.push('/onboarding/phone-login')}
          style={({ pressed }) => [styles.choiceBtn, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}
        >
          <Ionicons name="call-outline" size={20} color={theme.textPrimary} />
          <T style={[styles.choiceLabel, { color: theme.textPrimary }]}>Continue with Phone</T>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </Pressable>

        {/* Continue with Email */}
        <Pressable
          onPress={() => router.push('/onboarding/email-login')}
          style={({ pressed }) => [styles.choiceBtn, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}
        >
          <Ionicons name="mail-outline" size={20} color={theme.textPrimary} />
          <T style={[styles.choiceLabel, { color: theme.textPrimary }]}>Continue with Email</T>
          <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
        </Pressable>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          <T style={[styles.dividerLabel, { color: theme.textTertiary }]}>or</T>
          <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
        </View>

        {/* Google Sign-In */}
        <Pressable
          onPress={handleGoogleSignIn}
          disabled={googleLoading}
          style={({ pressed }) => [styles.googleBtn, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.85 : 1 }]}
        >
          {googleLoading ? (
            <ActivityIndicator color={theme.textSecondary} />
          ) : (
            <>
              <GoogleIcon />
              <T style={[styles.googleLabel, { color: theme.textPrimary }]}>Continue with Google</T>
            </>
          )}
        </Pressable>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: `${theme.error}15`, borderColor: `${theme.error}40` }]}>
            <Ionicons name="alert-circle-outline" size={15} color={theme.error} />
            <T style={[styles.errorText, { color: theme.error }]}>{error}</T>
          </View>
        )}

        <T style={[styles.legalText, { color: theme.textTertiary }]}>
          By continuing you agree to our{' '}
          <T style={{ color: theme.textSecondary }} onPress={() => router.push('/onboarding/terms')}>Terms of Service</T>
          {' '}and{' '}
          <T style={{ color: theme.textSecondary }} onPress={() => router.push('/onboarding/privacy')}>Privacy Policy</T>.
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}

function GoogleIcon() {
  return (
    <View style={styles.googleIcon}>
      <T style={styles.googleIconText}>G</T>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },

  logoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, marginBottom: 28 },
  backBtn: { width: 36, alignItems: 'flex-start' },
  logoWrap: { alignItems: 'center' },

  heading: { fontSize: 28, fontFamily: DisplayFont.heavy, fontWeight: '800', textAlign: 'center' },
  subheading: { fontSize: 14, fontFamily: FontFamily.regular, textAlign: 'center', marginTop: 6, marginBottom: 32 },

  choiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  choiceLabel: { flex: 1, fontSize: 16, fontFamily: DisplayFont.semibold, fontWeight: '600' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  dividerLine: { flex: 1, height: 1 },
  dividerLabel: { fontSize: 13 },

  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 24,
  },
  googleIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#4285F4' },
  googleIconText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  googleLabel: { fontSize: 16, fontFamily: DisplayFont.semibold, fontWeight: '600' },

  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },

  legalText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
