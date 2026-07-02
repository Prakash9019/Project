import { useRef, useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../theme';
import { T } from './ui';

interface Props {
  value: string;
  onChange: (code: string) => void;
  /** Called with the full code once `length` digits are entered. */
  onComplete?: (code: string) => void;
  length?: number;
  autoFocus?: boolean;
  editable?: boolean;
}

/**
 * Reusable N-digit OTP input. A single hidden TextInput owns the value (so paste
 * and SMS autofill work); the visible cells just reflect each digit. Tapping
 * anywhere refocuses the hidden field. Used by phone-code and email-code.
 */
export default function OtpCodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  autoFocus = true,
  editable = true,
}: Props) {
  const { theme } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, length);
    onChange(digits);
    if (digits.length === length) onComplete?.(digits);
  };

  const cells = Array.from({ length });

  return (
    <Pressable style={styles.wrap} onPress={() => inputRef.current?.focus()}>
      {cells.map((_, i) => {
        const char = value[i] ?? '';
        const isActive = focused && i === value.length;
        const filled = char !== '';
        return (
          <View
            key={i}
            style={[
              styles.cell,
              {
                backgroundColor: theme.inputBackground,
                borderColor: isActive ? theme.brand : filled ? theme.border : 'transparent',
              },
            ]}
          >
            <T style={[styles.cellText, { color: theme.textPrimary }]}>{char}</T>
          </View>
        );
      })}

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        maxLength={length}
        autoFocus={autoFocus}
        editable={editable}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.hiddenInput}
        caretHidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  cell: {
    flex: 1,
    height: 58,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { fontSize: 24, fontWeight: '700' },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
});
