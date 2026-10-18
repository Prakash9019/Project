import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { setCamouflageMode } from '../../services/discreetService';

const { width } = Dimensions.get('window');
const BTN_SIZE = Math.floor((width - 60) / 4);

export function DecoyCalculator({ onUnlock }: { onUnlock?: () => void }) {
  const [display, setDisplay] = useState('0');
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [historySequence, setHistorySequence] = useState('');

  const handleDigit = (digit: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setHistorySequence((prev) => (prev + digit).slice(-10));

    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === '0' ? digit : display + digit);
    }
  };

  const handleDot = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (!display.includes('.')) {
      setDisplay(display + '.');
      setWaitingForOperand(false);
    }
  };

  const handleClear = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setDisplay('0');
    setPrevValue(null);
    setOperator(null);
    setWaitingForOperand(false);
  };

  const handleToggleSign = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setDisplay((prev) => (prev.startsWith('-') ? prev.slice(1) : '-' + prev));
  };

  const handlePercent = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const num = parseFloat(display);
    if (!isNaN(num)) {
      setDisplay(String(num / 100));
    }
  };

  const handleOperator = (nextOp: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const current = parseFloat(display);

    if (prevValue == null) {
      setPrevValue(current);
    } else if (operator) {
      const result = calculate(prevValue, current, operator);
      setDisplay(String(result));
      setPrevValue(result);
    }

    setWaitingForOperand(true);
    setOperator(nextOp);
  };

  const calculate = (a: number, b: number, op: string): number => {
    switch (op) {
      case '+': return a + b;
      case '−': return a - b;
      case '×': return a * b;
      case '÷': return b !== 0 ? a / b : 0;
      default: return b;
    }
  };

  const handleEquals = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    // Secret passcode pattern: any 4-digit code (e.g. 1234, 0000, 9999, etc.) or sequence
    if (historySequence.length >= 4 && (historySequence.endsWith('1234') || historySequence.endsWith('0000') || historySequence.endsWith('9019') || display === '1234' || display === '9019')) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCamouflageMode(false);
      onUnlock?.();
      return;
    }

    const current = parseFloat(display);
    if (prevValue != null && operator) {
      const result = calculate(prevValue, current, operator);
      setDisplay(String(result));
      setPrevValue(null);
      setOperator(null);
      setWaitingForOperand(true);
    }
  };

  const handleSecretLongPress = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCamouflageMode(false);
    onUnlock?.();
  };

  const renderBtn = (
    label: string,
    onPress: () => void,
    variant: 'num' | 'op' | 'fn' = 'num',
    flex2 = false,
  ) => {
    const isOpActive = operator === label && waitingForOperand;
    return (
      <Pressable
        key={label}
        style={[
          styles.btn,
          variant === 'num' && styles.btnNum,
          variant === 'op' && (isOpActive ? styles.btnOpActive : styles.btnOp),
          variant === 'fn' && styles.btnFn,
          flex2 && styles.btnZero,
        ]}
        onPress={onPress}
      >
        <Text
          style={[
            styles.btnText,
            variant === 'fn' && styles.btnFnText,
            variant === 'op' && isOpActive && styles.btnOpActiveText,
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Secret unlock target: long-pressing the display */}
      <Pressable style={styles.displayArea} onLongPress={handleSecretLongPress} delayLongPress={800}>
        <Text style={styles.displaySubText}>
          {prevValue != null && operator ? `${prevValue} ${operator}` : ''}
        </Text>
        <Text
          style={[
            styles.displayText,
            display.length > 7 && { fontSize: 50 },
            display.length > 10 && { fontSize: 38 },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {display}
        </Text>
      </Pressable>

      {/* Keypad */}
      <View style={styles.pad}>
        <View style={styles.row}>
          {renderBtn(display === '0' ? 'AC' : 'C', handleClear, 'fn')}
          {renderBtn('±', handleToggleSign, 'fn')}
          {renderBtn('%', handlePercent, 'fn')}
          {renderBtn('÷', () => handleOperator('÷'), 'op')}
        </View>

        <View style={styles.row}>
          {renderBtn('7', () => handleDigit('7'))}
          {renderBtn('8', () => handleDigit('8'))}
          {renderBtn('9', () => handleDigit('9'))}
          {renderBtn('×', () => handleOperator('×'), 'op')}
        </View>

        <View style={styles.row}>
          {renderBtn('4', () => handleDigit('4'))}
          {renderBtn('5', () => handleDigit('5'))}
          {renderBtn('6', () => handleDigit('6'))}
          {renderBtn('−', () => handleOperator('−'), 'op')}
        </View>

        <View style={styles.row}>
          {renderBtn('1', () => handleDigit('1'))}
          {renderBtn('2', () => handleDigit('2'))}
          {renderBtn('3', () => handleDigit('3'))}
          {renderBtn('+', () => handleOperator('+'), 'op')}
        </View>

        <View style={styles.row}>
          {renderBtn('0', () => handleDigit('0'), 'num', true)}
          {renderBtn('.', handleDot)}
          {renderBtn('=', handleEquals, 'op')}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end', paddingBottom: 16 },
  displayArea: { paddingHorizontal: 28, paddingVertical: 20, alignItems: 'flex-end', justifyContent: 'flex-end', flex: 1 },
  displaySubText: { color: '#888', fontSize: 20, marginBottom: 4 },
  displayText: { color: '#fff', fontSize: 72, fontWeight: '300' },
  pad: { paddingHorizontal: 16, gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  btn: { width: BTN_SIZE, height: BTN_SIZE, borderRadius: BTN_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  btnZero: { width: BTN_SIZE * 2 + 12, alignItems: 'flex-start', paddingLeft: 30, borderRadius: BTN_SIZE / 2 },
  btnNum: { backgroundColor: '#333333' },
  btnFn: { backgroundColor: '#A5A5A5' },
  btnOp: { backgroundColor: '#FF9F0A' },
  btnOpActive: { backgroundColor: '#FFFFFF' },
  btnText: { color: '#fff', fontSize: 32, fontWeight: '400' },
  btnFnText: { color: '#000', fontSize: 28, fontWeight: '500' },
  btnOpActiveText: { color: '#FF9F0A' },
});
