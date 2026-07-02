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
import { sendPhoneOtp } from '../../src/services/phoneAuth';

export default function PhoneLogin() {
  const router = useRouter();
  const { theme } = useTheme();
  const [code, setCode] = useState('+91');
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numberRef = useRef<TextInput>(null);

  const e164 = `${code.trim()}${number.replace(/\D/g, '')}`;
  const isReady = /^\+\d{1,4}$/.test(code.trim()) && number.replace(/\D/g, '').length >= 6;

  const handleSend = async () => {
    if (loading || !isReady) return;
    setLoading(true);
    setError(null);
    try {
      await sendPhoneOtp(e164);
      router.push('/onboarding/phone-code');
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'auth/invalid-phone-number') setError('That phone number looks invalid.');
      else if (err.code === 'auth/too-many-requests') setError('Too many attempts. Please try again later.');
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

          <T style={[styles.heading, { color: theme.textPrimary }]}>Enter your phone</T>
          <T style={[styles.subheading, { color: theme.textSecondary }]}>
            We&apos;ll text you a 6-digit code to verify your number.
          </T>

          <View style={styles.phoneRow}>
            <View style={[styles.codeWrap, { backgroundColor: theme.inputBackground }]}>
              <TextInput
                value={code}
                onChangeText={(v) => { setCode(v); setError(null); }}
                keyboardType="phone-pad"
                returnKeyType="next"
                onSubmitEditing={() => numberRef.current?.focus()}
                style={[styles.codeInput, { color: theme.textPrimary }]}
                maxLength={5}
              />
            </View>
            <View style={[styles.numberWrap, { backgroundColor: theme.inputBackground }]}>
              <Ionicons name="call-outline" size={18} color={theme.textTertiary} style={styles.inputIcon} />
              <TextInput
                ref={numberRef}
                value={number}
                onChangeText={(v) => { setNumber(v); setError(null); }}
                placeholder="Phone number"
                placeholderTextColor={theme.textTertiary}
                keyboardType="phone-pad"
                returnKeyType="done"
                onSubmitEditing={handleSend}
                autoFocus
                style={[styles.input, { color: theme.textPrimary }]}
              />
            </View>
          </View>

          {error && (
            <View style={[styles.errorBox, { backgroundColor: `${theme.error}15`, borderColor: `${theme.error}40` }]}>
              <Ionicons name="alert-circle-outline" size={15} color={theme.error} />
              <T style={[styles.errorText, { color: theme.error }]}>{error}</T>
            </View>
          )}

          <Pressable disabled={!isReady || loading} onPress={handleSend} style={({ pressed }) => [styles.primaryBtnWrap, { opacity: pressed ? 0.9 : 1 }]}>
            <LinearGradient
              colors={isReady ? theme.gradientWarm : [theme.inputBackground, theme.inputBackground]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.primaryBtn}
            >
              {loading ? <ActivityIndicator color="#fff" /> : (
                <T style={[styles.primaryLabel, { color: isReady ? '#fff' : theme.textTertiary }]}>Send Code</T>
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
  phoneRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  codeWrap: { width: 84, borderRadius: 12, height: 52, justifyContent: 'center', paddingHorizontal: 14 },
  codeInput: { fontSize: 16, fontFamily: FontFamily.regular, textAlign: 'center' },
  numberWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 14, height: 52 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, fontFamily: FontFamily.regular },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  primaryBtnWrap: { marginTop: 8, borderRadius: 999 },
  primaryBtn: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 16, fontFamily: DisplayFont.bold, fontWeight: '700' },
});
