import { useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme';
import { T } from '../../src/components/ui';
import { requestOtp, ApiError } from '../../src/services/api';

const COUNTRIES = [
  { code: '+91', flag: '🇮🇳', name: 'India' },
  { code: '+1', flag: '🇺🇸', name: 'United States' },
  { code: '+44', flag: '🇬🇧', name: 'United Kingdom' },
  { code: '+61', flag: '🇦🇺', name: 'Australia' },
  { code: '+971', flag: '🇦🇪', name: 'UAE' },
  { code: '+65', flag: '🇸🇬', name: 'Singapore' },
  { code: '+49', flag: '🇩🇪', name: 'Germany' },
  { code: '+33', flag: '🇫🇷', name: 'France' },
  { code: '+81', flag: '🇯🇵', name: 'Japan' },
  { code: '+86', flag: '🇨🇳', name: 'China' },
];

export default function PhoneScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [digits, setDigits] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const e164 = `${country.code}${digits}`;
  const valid = /^\+[1-9]\d{7,14}$/.test(e164);

  const send = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      await requestOtp(e164);
      router.push({ pathname: '/onboarding/otp', params: { phone: e164 } });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 429) {
        setError('Too many attempts. Please wait a moment and try again.');
      } else {
        setError(err.message ?? 'Could not send OTP. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <Pressable style={styles.back} onPress={() => router.back()} hitSlop={12}>
        <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
      </Pressable>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.body}>
          <T style={[styles.title, { color: theme.textPrimary }]}>What's your number?</T>
          <T style={[styles.sub, { color: theme.textSecondary }]}>
            We'll text you a 6-digit code to verify your phone. No passwords ever.
          </T>

          <View style={styles.row}>
            <Pressable
              style={[styles.country, { backgroundColor: theme.inputBackground }]}
              onPress={() => setPickerOpen(true)}
            >
              <T style={styles.flag}>{country.flag}</T>
              <T style={[styles.code, { color: theme.textPrimary }]}>{country.code}</T>
              <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
            </Pressable>
            <TextInput
              value={digits}
              onChangeText={(t) => setDigits(t.replace(/[^0-9]/g, ''))}
              placeholder="Phone number"
              placeholderTextColor={theme.textTertiary}
              keyboardType="number-pad"
              maxLength={15}
              autoFocus
              style={[
                styles.input,
                { backgroundColor: theme.inputBackground, color: theme.textPrimary },
              ]}
            />
          </View>

          {error && <T style={[styles.error, { color: theme.error }]}>{error}</T>}
        </View>

        <View style={styles.footer}>
          <Pressable
            disabled={!valid || loading}
            style={({ pressed }) => [
              styles.primary,
              {
                backgroundColor: valid ? theme.brand : theme.callDisabled,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            onPress={send}
          >
            {loading ? (
              <ActivityIndicator color={theme.textInverse} />
            ) : (
              <T style={[styles.primaryText, { color: theme.textInverse }]}>Send OTP</T>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={pickerOpen} animationType="slide" transparent>
        <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={() => setPickerOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
            <T style={[styles.sheetTitle, { color: theme.textPrimary }]}>Select country</T>
            <FlatList
              data={COUNTRIES}
              keyExtractor={(c) => c.code}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.countryRow}
                  onPress={() => {
                    setCountry(item);
                    setPickerOpen(false);
                  }}
                >
                  <T style={styles.flag}>{item.flag}</T>
                  <T style={[styles.countryName, { color: theme.textPrimary }]}>{item.name}</T>
                  <T style={[styles.code, { color: theme.textSecondary }]}>{item.code}</T>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  back: { padding: 16 },
  body: { flex: 1, paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 12 },
  sub: { fontSize: 15, marginTop: 10, lineHeight: 21 },
  row: { flexDirection: 'row', gap: 10, marginTop: 28 },
  country: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 52,
    borderRadius: 12,
  },
  flag: { fontSize: 20 },
  code: { fontSize: 16, fontWeight: '600' },
  input: { flex: 1, height: 52, borderRadius: 12, paddingHorizontal: 16, fontSize: 17 },
  error: { fontSize: 13, marginTop: 14 },
  footer: { padding: 20 },
  primary: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 17, fontWeight: '700' },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '60%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  countryName: { flex: 1, fontSize: 16 },
});
