import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import OtpCodeInput from '../OtpCodeInput';
import { useTheme, FontFamily, FontSize, DisplayFont } from '../../theme';

export type LockMethod = 'pin' | 'biometric';
export interface LockConfig {
  locked: boolean;
  method: LockMethod;
  /** Hashed 4-digit PIN (only for method === 'pin'). */
  pinHash?: string;
}

const keyFor = (conversationId: string) => `chat_lock:${conversationId}`;

/** Tiny non-cryptographic hash — sufficient for a local-only PIN gate. */
function hashPin(pin: string): string {
  let h = 0;
  for (let i = 0; i < pin.length; i++) h = (h * 31 + pin.charCodeAt(i)) & 0x7fffffff;
  return String(h);
}

export async function loadLockConfig(conversationId: string): Promise<LockConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(conversationId));
    return raw ? (JSON.parse(raw) as LockConfig) : null;
  } catch {
    return null;
  }
}

export async function saveLockConfig(conversationId: string, config: LockConfig): Promise<void> {
  await AsyncStorage.setItem(keyFor(conversationId), JSON.stringify(config)).catch(() => {});
}

export async function clearLockConfig(conversationId: string): Promise<void> {
  await AsyncStorage.removeItem(keyFor(conversationId)).catch(() => {});
}

/**
 * Full-screen lock gate shown over a locked conversation until the user
 * authenticates (biometric or PIN). 3 failed PIN attempts → 30s lockout.
 */
export function ChatLockScreen({ config, onUnlock }: { config: LockConfig; onUnlock: () => void }) {
  const { theme } = useTheme();
  const [pin, setPin] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  const cooldownLeft = Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const tryBiometric = async () => {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock chat',
      fallbackLabel: 'Use PIN',
    });
    if (res.success) onUnlock();
  };

  useEffect(() => {
    if (config.method === 'biometric') tryBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPinComplete = (code: string) => {
    if (cooldownLeft > 0) return;
    if (hashPin(code) === config.pinHash) {
      onUnlock();
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    setPin('');
    if (next >= 3) {
      setLockedUntil(Date.now() + 30_000);
      setAttempts(0);
      setError('Too many attempts. Locked for 30s.');
    } else {
      setError('Incorrect PIN');
    }
  };

  return (
    <View style={[styles.lockRoot, { backgroundColor: theme.background }]}>
      <View style={[styles.lockLogo, { backgroundColor: theme.brand + '22' }]}>
        <Ionicons name="lock-closed" size={40} color={theme.brand} />
      </View>
      <Text style={[styles.lockTitle, { color: theme.textPrimary }]}>This chat is locked</Text>

      {config.method === 'biometric' ? (
        <Pressable style={[styles.unlockBtn, { backgroundColor: theme.brand }]} onPress={tryBiometric}>
          <Ionicons name="finger-print" size={20} color={theme.textInverse} />
          <Text style={[styles.unlockText, { color: theme.textInverse }]}>Unlock with Biometrics</Text>
        </Pressable>
      ) : (
        <View style={styles.pinWrap}>
          <Text style={[styles.pinHint, { color: theme.textSecondary }]}>
            {cooldownLeft > 0 ? `Try again in ${cooldownLeft}s` : 'Enter your PIN'}
          </Text>
          <OtpCodeInput value={pin} onChange={setPin} onComplete={onPinComplete} length={4} editable={cooldownLeft === 0} />
        </View>
      )}
      {error ? <Text style={[styles.lockError, { color: theme.error }]}>{error}</Text> : null}
    </View>
  );
}

/**
 * Setup modal: choose PIN or biometric, and (for PIN) enter it twice to confirm.
 */
export function ChatLockSetup({
  visible,
  onClose,
  onEnabled,
}: {
  visible: boolean;
  onClose: () => void;
  onEnabled: (config: LockConfig) => void;
}) {
  const { theme } = useTheme();
  const [stage, setStage] = useState<'choose' | 'pin1' | 'pin2'>('choose');
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setStage('choose');
      setPin('');
      setFirstPin('');
      setError(null);
    }
  }, [visible]);

  const enableBiometric = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !enrolled) {
      setError('Biometrics not available on this device. Use a PIN instead.');
      return;
    }
    onEnabled({ locked: true, method: 'biometric' });
    onClose();
  };

  const onFirstPin = (code: string) => {
    setFirstPin(code);
    setPin('');
    setStage('pin2');
    setError(null);
  };

  const onConfirmPin = (code: string) => {
    if (code !== firstPin) {
      setError('PINs do not match. Try again.');
      setStage('pin1');
      setPin('');
      setFirstPin('');
      return;
    }
    onEnabled({ locked: true, method: 'pin', pinHash: hashPin(code) });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>Lock Chat</Text>

          {stage === 'choose' ? (
            <>
              <Pressable style={styles.optionRow} onPress={enableBiometric}>
                <Ionicons name="finger-print" size={22} color={theme.brand} />
                <Text style={[styles.optionText, { color: theme.textPrimary }]}>Use Biometrics</Text>
              </Pressable>
              <Pressable style={styles.optionRow} onPress={() => { setStage('pin1'); setError(null); }}>
                <Ionicons name="keypad" size={22} color={theme.brand} />
                <Text style={[styles.optionText, { color: theme.textPrimary }]}>Use a PIN</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.pinWrap}>
              <Text style={[styles.pinHint, { color: theme.textSecondary }]}>
                {stage === 'pin1' ? 'Choose a 4-digit PIN' : 'Confirm your PIN'}
              </Text>
              <OtpCodeInput
                value={pin}
                onChange={setPin}
                onComplete={stage === 'pin1' ? onFirstPin : onConfirmPin}
                length={4}
              />
            </View>
          )}
          {error ? <Text style={[styles.lockError, { color: theme.error }]}>{error}</Text> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  lockRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  lockLogo: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  lockTitle: { fontSize: 20, fontFamily: DisplayFont.medium, fontWeight: '600' },
  unlockBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingHorizontal: 24, borderRadius: 999, marginTop: 8 },
  unlockText: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  pinWrap: { alignItems: 'center', gap: 14, marginTop: 8, width: '100%' },
  pinHint: { fontSize: FontSize.md, fontFamily: FontFamily.medium },
  lockError: { fontSize: FontSize.sm, fontFamily: FontFamily.medium, marginTop: 6 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, gap: 6 },
  sheetTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.semibold, marginBottom: 8 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  optionText: { fontSize: FontSize.md, fontFamily: FontFamily.medium },
});
