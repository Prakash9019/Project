import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme, FontFamily, DisplayFont } from '../src/theme';
import { T } from '../src/components/ui';
import OtpCodeInput from '../src/components/OtpCodeInput';
import {
  getVerificationStatus, sendCollegeOtp, confirmCollegeOtp, VerificationStatusResponse, ApiError,
} from '../src/services/api';
import { showSuccess } from '../src/lib/toast';

const RESEND_COOLDOWN = 30;

export default function Verification() {
  const router = useRouter();
  const { theme } = useTheme();
  const [status, setStatus] = useState<VerificationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [collegeSheetOpen, setCollegeSheetOpen] = useState(false);

  const refresh = () => getVerificationStatus().then(setStatus).catch(() => { /* shown as default */ });

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const Row = ({ icon, label, done, onPress }: { icon: any; label: string; done: boolean; onPress?: () => void }) => (
    <Pressable
      style={[styles.row, { backgroundColor: theme.surface }]}
      onPress={onPress}
      disabled={!onPress || done}
    >
      <Ionicons name={icon} size={22} color={done ? theme.success : theme.textSecondary} />
      <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{label}</Text>
      {done ? (
        <View style={styles.doneTag}>
          <Ionicons name="checkmark-circle" size={18} color={theme.success} />
          <Text style={[styles.doneText, { color: theme.success }]}>Verified</Text>
        </View>
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
      ) : (
        <Ionicons name="close-circle-outline" size={20} color={theme.textTertiary} />
      )}
    </Pressable>
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
          <Row
            icon="school"
            label="College verified"
            done={!!status?.isCollegeVerified}
            onPress={() => setCollegeSheetOpen(true)}
          />
        </View>
      )}

      <CollegeVerifySheet
        visible={collegeSheetOpen}
        onClose={() => setCollegeSheetOpen(false)}
        onVerified={() => {
          setCollegeSheetOpen(false);
          showSuccess('College verified', 'Verified');
          refresh();
        }}
      />
    </SafeAreaView>
  );
}

function CollegeVerifySheet({
  visible,
  onClose,
  onVerified,
}: {
  visible: boolean;
  onClose: () => void;
  onVerified: () => void;
}) {
  const { theme } = useTheme();
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!visible) {
      setStep('email');
      setEmail('');
      setCode('');
      setError(null);
      setLoading(false);
      setCooldown(0);
    }
  }, [visible]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const eduEmailValid = /^[^\s@]+@[^\s@]+\.edu$/i.test(email.trim());

  const sendOtp = async () => {
    if (loading || !eduEmailValid) return;
    setLoading(true);
    setError(null);
    try {
      await sendCollegeOtp(email.trim());
      setStep('otp');
      setCooldown(RESEND_COOLDOWN);
    } catch (e: unknown) {
      const err = e as ApiError;
      setError(err.status === 429 ? 'Too many requests. Please wait and try again.' : (err.message ?? 'Could not send the code.'));
    } finally {
      setLoading(false);
    }
  };

  const verify = async (fullCode: string) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await confirmCollegeOtp(fullCode);
      onVerified();
    } catch (e: unknown) {
      const err = e as ApiError;
      if (err.code === 'invalid_code') setError('That code is incorrect. Try again.');
      else setError(err.message ?? 'Verification failed. Please try again.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setError(null);
    try {
      await sendCollegeOtp(email.trim());
      setCooldown(RESEND_COOLDOWN);
    } catch (e: unknown) {
      const err = e as ApiError;
      setError(err.status === 429 ? 'Too many requests. Please wait before retrying.' : 'Could not resend the code.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={() => {}}>
            <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />

            {step === 'email' ? (
              <>
                <T style={[styles.sheetTitle, { color: theme.textPrimary }]}>Verify your college</T>
                <T style={[styles.sheetSub, { color: theme.textSecondary }]}>
                  Enter your .edu email — we&apos;ll send a 6-digit code to confirm it&apos;s yours.
                </T>
                <View style={[styles.inputWrap, { backgroundColor: theme.inputBackground }]}>
                  <Ionicons name="mail-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    value={email}
                    onChangeText={(v) => { setEmail(v); setError(null); }}
                    placeholder="you@college.edu"
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={sendOtp}
                    style={[styles.input, { color: theme.textPrimary }]}
                  />
                </View>

                {error && (
                  <View style={[styles.errorBox, { backgroundColor: `${theme.error}15`, borderColor: `${theme.error}40` }]}>
                    <Ionicons name="alert-circle-outline" size={15} color={theme.error} />
                    <T style={[styles.errorText, { color: theme.error }]}>{error}</T>
                  </View>
                )}

                <Pressable disabled={!eduEmailValid || loading} onPress={sendOtp} style={({ pressed }) => [styles.primaryBtnWrap, { opacity: pressed ? 0.9 : 1 }]}>
                  <LinearGradient
                    colors={eduEmailValid ? theme.gradientWarm : [theme.inputBackground, theme.inputBackground]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.primaryBtn}
                  >
                    {loading ? <ActivityIndicator color="#fff" /> : (
                      <T style={[styles.primaryLabel, { color: eduEmailValid ? '#fff' : theme.textTertiary }]}>Send code</T>
                    )}
                  </LinearGradient>
                </Pressable>
              </>
            ) : (
              <>
                <T style={[styles.sheetTitle, { color: theme.textPrimary }]}>Enter the code</T>
                <T style={[styles.sheetSub, { color: theme.textSecondary }]}>
                  We sent a 6-digit code to {email}.
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
              </>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
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

  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 20, fontFamily: DisplayFont.heavy, fontWeight: '800' },
  sheetSub: { fontSize: 14, fontFamily: FontFamily.regular, marginTop: 8, marginBottom: 20 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 14, height: 52, marginBottom: 4 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, fontFamily: FontFamily.regular },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 12 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  primaryBtnWrap: { marginTop: 20, borderRadius: 999 },
  primaryBtn: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 16, fontFamily: DisplayFont.bold, fontWeight: '700' },
  resendRow: { alignItems: 'center', marginTop: 20 },
  resendText: { fontSize: 14, fontFamily: FontFamily.semibold, fontWeight: '600' },
});
