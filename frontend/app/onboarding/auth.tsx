import { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme';
import { T } from '../../src/components/ui';
import { NearMeLogo } from '../../src/components/icons';
import { firebaseLogin, devLogin, ApiError } from '../../src/services/api';
import { useAuthStore } from '../../src/store/authStore';

// Lazy-require Firebase to keep web bundle from breaking
function getFirebaseAuth() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-firebase/app');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: auth } = require('@react-native-firebase/auth');
  return auth();
}
function getGoogleSignin() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GoogleSignin } = require('@react-native-google-signin/google-signin');
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
  return GoogleSignin;
}
function getGoogleAuthProvider() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-firebase/app');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: auth } = require('@react-native-firebase/auth');
  return auth.GoogleAuthProvider;
}

type Tab = 'login' | 'signup';

interface FieldState {
  email: string;
  password: string;
  confirmPassword: string;
}

export default function AuthScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const login = useAuthStore((s) => s.login);

  const [tab, setTab] = useState<Tab>('login');
  const [fields, setFields] = useState<FieldState>({ email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const set = (key: keyof FieldState) => (val: string) => {
    setFields((f) => ({ ...f, [key]: val }));
    setError(null);
    setResetSent(false);
  };

  const handleFirebaseToken = async (idToken: string) => {
    const res = await firebaseLogin(idToken);
    await login(res.accessToken, res.refreshToken, res.user);
    if (res.isNewUser || !res.profileComplete) {
      router.replace('/onboarding/setup');
    } else {
      router.replace('/(tabs)');
    }
  };

const SEED_EMAIL_SUFFIX = '@nearme.dev';

  const handleDevLogin = async (email: string, password: string) => {
    const res = await devLogin(email.trim(), password);
    await login(res.accessToken, res.refreshToken, res.user);
    router.replace('/(tabs)');
  };

  const handleEmailAuth = async () => {
    if (loading) return;
    const { email, password, confirmPassword } = fields;

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    if (tab === 'signup') {
      if (email.trim().endsWith(SEED_EMAIL_SUFFIX)) {
        setError('Demo accounts cannot be created here. Use Log In with the demo password from PLAYBOOK.md.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      if (tab === 'login' && email.trim().endsWith(SEED_EMAIL_SUFFIX)) {
        await handleDevLogin(email, password);
        return;
      }
      const auth = getFirebaseAuth();
      let credential;
      if (tab === 'signup') {
        credential = await auth.createUserWithEmailAndPassword(email.trim(), password);
        await credential.user.sendEmailVerification().catch(() => {});
      } else {
        credential = await auth.signInWithEmailAndPassword(email.trim(), password);
      }
      const idToken = await credential.user.getIdToken();
      await handleFirebaseToken(idToken);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string } & ApiError;
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Try logging in.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password must be at least 6 characters.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.');
      } else if (err.status === 429) {
        setError('Too many requests. Please try again later.');
      } else {
        setError(err.message ?? 'Authentication failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
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
      const auth = getFirebaseAuth();
      const GoogleAuthProvider = getGoogleAuthProvider();
      const googleCredential = GoogleAuthProvider.credential(data.idToken);
      const userCredential = await auth.signInWithCredential(googleCredential);
      const idToken = await userCredential.user.getIdToken();
      await handleFirebaseToken(idToken);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'SIGN_IN_CANCELLED') {
        // user cancelled — silent
      } else if (err.code === 'IN_PROGRESS') {
        // already in progress — silent
      } else {
        setError('Google sign-in failed. Please try again.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const { email } = fields;
    if (!email.trim()) {
      setError('Enter your email address above, then tap Forgot password.');
      return;
    }
    try {
      const auth = getFirebaseAuth();
      await auth.sendPasswordResetEmail(email.trim());
      setResetSent(true);
      setError(null);
    } catch {
      setError('Could not send reset email. Check your email address and try again.');
    }
  };

  const isLoginReady = fields.email.trim() && fields.password;
  const isSignupReady = fields.email.trim() && fields.password && fields.confirmPassword;
  const isReady = tab === 'login' ? isLoginReady : isSignupReady;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
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

          <T style={[styles.heading, { color: theme.textPrimary }]}>
            {tab === 'login' ? 'Welcome back' : 'Create your account'}
          </T>
          <T style={[styles.subheading, { color: theme.textSecondary }]}>
            {tab === 'login'
              ? 'Sign in to continue to NearMe'
              : 'Join thousands of people nearby'}
          </T>

          {/* Tab switcher */}
          <View style={[styles.tabBar, { backgroundColor: theme.backgroundSecondary }]}>
            <Pressable
              style={[styles.tabBtn, tab === 'login' && [styles.tabBtnActive, { backgroundColor: theme.surface }]]}
              onPress={() => { setTab('login'); setError(null); setResetSent(false); }}
            >
              <T style={[styles.tabLabel, { color: tab === 'login' ? theme.textPrimary : theme.textSecondary }]}>
                Log In
              </T>
            </Pressable>
            <Pressable
              style={[styles.tabBtn, tab === 'signup' && [styles.tabBtnActive, { backgroundColor: theme.surface }]]}
              onPress={() => { setTab('signup'); setError(null); setResetSent(false); }}
            >
              <T style={[styles.tabLabel, { color: tab === 'signup' ? theme.textPrimary : theme.textSecondary }]}>
                Sign Up
              </T>
            </Pressable>
          </View>

          {/* Email field */}
          <View style={[styles.inputWrap, { backgroundColor: theme.inputBackground }]}>
            <Ionicons name="mail-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
            <TextInput
              value={fields.email}
              onChangeText={set('email')}
              placeholder="Email address"
              placeholderTextColor={theme.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              style={[styles.input, { color: theme.textPrimary }]}
            />
          </View>

          {/* Password field */}
          <View style={[styles.inputWrap, { backgroundColor: theme.inputBackground }]}>
            <Ionicons name="lock-closed-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
            <TextInput
              ref={passwordRef}
              value={fields.password}
              onChangeText={set('password')}
              placeholder="Password"
              placeholderTextColor={theme.textTertiary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType={tab === 'signup' ? 'next' : 'done'}
              onSubmitEditing={() => tab === 'signup' ? confirmRef.current?.focus() : handleEmailAuth()}
              style={[styles.input, { color: theme.textPrimary }]}
            />
            <Pressable onPress={() => setShowPassword((p) => !p)} hitSlop={8}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={theme.textTertiary}
              />
            </Pressable>
          </View>

          {/* Confirm password (signup only) */}
          {tab === 'signup' && (
            <View style={[styles.inputWrap, { backgroundColor: theme.inputBackground }]}>
              <Ionicons name="lock-closed-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
              <TextInput
                ref={confirmRef}
                value={fields.confirmPassword}
                onChangeText={set('confirmPassword')}
                placeholder="Confirm password"
                placeholderTextColor={theme.textTertiary}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleEmailAuth}
                style={[styles.input, { color: theme.textPrimary }]}
              />
              <Pressable onPress={() => setShowConfirm((p) => !p)} hitSlop={8}>
                <Ionicons
                  name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={theme.textTertiary}
                />
              </Pressable>
            </View>
          )}

          {/* Error / success message */}
          {error && (
            <View style={[styles.errorBox, { backgroundColor: `${theme.error}15`, borderColor: `${theme.error}40` }]}>
              <Ionicons name="alert-circle-outline" size={15} color={theme.error} />
              <T style={[styles.errorText, { color: theme.error }]}>{error}</T>
            </View>
          )}
          {resetSent && (
            <View style={[styles.errorBox, { backgroundColor: `${theme.success}15`, borderColor: `${theme.success}40` }]}>
              <Ionicons name="checkmark-circle-outline" size={15} color={theme.success} />
              <T style={[styles.errorText, { color: theme.success }]}>
                Password reset email sent. Check your inbox.
              </T>
            </View>
          )}

          {/* Forgot password (login only) */}
          {tab === 'login' && (
            <Pressable onPress={handleForgotPassword} style={styles.forgotRow}>
              <T style={[styles.forgotText, { color: theme.brand }]}>Forgot password?</T>
            </Pressable>
          )}

          {/* Primary CTA */}
          <Pressable
            disabled={!isReady || loading}
            onPress={handleEmailAuth}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: isReady ? theme.brand : theme.inputBackground,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={theme.textInverse} />
            ) : (
              <T style={[styles.primaryLabel, { color: isReady ? theme.textInverse : theme.textTertiary }]}>
                {tab === 'login' ? 'Log In' : 'Create Account'}
              </T>
            )}
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
            style={({ pressed }) => [
              styles.googleBtn,
              { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
            ]}
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

          {/* Switch tab link */}
          <Pressable
            onPress={() => { setTab(tab === 'login' ? 'signup' : 'login'); setError(null); setResetSent(false); }}
            style={styles.switchRow}
          >
            <T style={[styles.switchText, { color: theme.textSecondary }]}>
              {tab === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <T style={[styles.switchLink, { color: theme.brand }]}>
                {tab === 'login' ? 'Sign Up' : 'Log In'}
              </T>
            </T>
          </Pressable>

          {tab === 'signup' && (
            <T style={[styles.legalText, { color: theme.textTertiary }]}>
              By creating an account you agree to our{' '}
              <T style={{ color: theme.textSecondary }} onPress={() => router.push('/onboarding/terms')}>Terms of Service</T>
              {' '}and{' '}
              <T style={{ color: theme.textSecondary }} onPress={() => router.push('/onboarding/privacy')}>Privacy Policy</T>.
            </T>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function GoogleIcon() {
  return (
    <View style={styles.googleIcon}>
      {/* Simplified Google G in brand colors */}
      <T style={styles.googleIconText}>G</T>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },

  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginBottom: 28,
  },
  backBtn: { width: 36, alignItems: 'flex-start' },
  logoWrap: { alignItems: 'center' },

  heading: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subheading: { fontSize: 14, textAlign: 'center', marginTop: 6, marginBottom: 28 },

  tabBar: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
  },
  tabBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabLabel: { fontSize: 15, fontWeight: '600' },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    marginBottom: 12,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16 },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },

  forgotRow: { alignSelf: 'flex-end', marginBottom: 20, marginTop: -4 },
  forgotText: { fontSize: 14, fontWeight: '600' },

  primaryBtn: {
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  primaryLabel: { fontSize: 16, fontWeight: '700' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  dividerLine: { flex: 1, height: 1 },
  dividerLabel: { fontSize: 13 },

  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 28,
  },
  googleIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4285F4',
  },
  googleIconText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  googleLabel: { fontSize: 16, fontWeight: '600' },

  switchRow: { alignItems: 'center', marginBottom: 20 },
  switchText: { fontSize: 14, textAlign: 'center' },
  switchLink: { fontWeight: '700' },

  legalText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
