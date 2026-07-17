import { useEffect, useRef, type ComponentProps } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, FontFamily, DisplayFont, spacing } from '../theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type AlertButtonStyle = 'default' | 'destructive' | 'cancel';

export interface AlertButton {
  label: string;
  onPress?: () => void;
  style?: AlertButtonStyle;
}

export interface AlertConfig {
  title: string;
  message?: string;
  icon?: IoniconName;
  iconColor?: string;
  buttons: AlertButton[];
}

/**
 * In-app bottom-sheet dialog that replaces the native Alert.alert(). Themed,
 * animated, and driven by an AlertConfig (see the useAlert hook). Rendered only
 * while a config is active: `{alertConfig && <CustomAlert {...alertConfig} onDismiss={hideAlert} />}`.
 */
export function CustomAlert({
  visible = true,
  title,
  message,
  icon,
  iconColor,
  buttons,
  onDismiss,
}: AlertConfig & { visible?: boolean; onDismiss: () => void }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(600)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 220,
    }).start();
  }, [translateY]);

  // Tapping the overlay behaves like the cancel button (or a plain dismiss).
  const dismissFromOverlay = () => {
    const cancel = buttons.find((b) => b.style === 'cancel');
    if (cancel?.onPress) cancel.onPress();
    else onDismiss();
  };

  const accent = iconColor ?? theme.brand;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismissFromOverlay} statusBarTranslucent>
      <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={dismissFromOverlay}>
        <Animated.View style={{ transform: [{ translateY }] }}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + spacing.lg }]}
            onPress={(e) => e.stopPropagation()}
          >
            {icon ? (
              <View style={[styles.iconCircle, { backgroundColor: accent + '26' }]}>
                <Ionicons name={icon} size={28} color={accent} />
              </View>
            ) : null}
            <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
            {message ? <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text> : null}
            <View style={styles.buttons}>
              {buttons.map((b, i) => {
                if (b.style === 'default') {
                  return (
                    <Pressable key={`${b.label}-${i}`} onPress={b.onPress} style={styles.btn}>
                      <LinearGradient
                        colors={theme.gradientWarm}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.btnInner}
                      >
                        <Text style={[styles.btnText, { color: '#fff' }]}>{b.label}</Text>
                      </LinearGradient>
                    </Pressable>
                  );
                }
                const bg = b.style === 'destructive' ? theme.error + '1A' : theme.surfaceElevated;
                const fg = b.style === 'destructive' ? theme.error : theme.textSecondary;
                return (
                  <Pressable
                    key={`${b.label}-${i}`}
                    onPress={b.onPress}
                    style={[styles.btn, styles.btnInner, { backgroundColor: bg }]}
                  >
                    <Text style={[styles.btnText, { color: fg }]}>{b.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    alignItems: 'center',
  },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontFamily: DisplayFont.bold, textAlign: 'center', marginTop: spacing.md },
  message: { fontSize: 15, fontFamily: FontFamily.regular, textAlign: 'center', marginTop: spacing.sm },
  buttons: { width: '100%', gap: 8, marginTop: spacing.lg },
  btn: { width: '100%', height: 52, borderRadius: 12, overflow: 'hidden' },
  btnInner: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  btnText: { fontSize: 16, fontFamily: FontFamily.semibold },
});
