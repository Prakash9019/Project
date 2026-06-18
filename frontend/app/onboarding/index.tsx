import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { NearMeLogo } from '../../src/components/icons';
import { T } from '../../src/components/ui';

/** NearMe welcome screen — email/Google auth. */
export default function Welcome() {
  const router = useRouter();
  const { theme } = useTheme();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.center}>
        <NearMeLogo size={96} color={theme.brand} />
        <T style={[styles.wordmark, { color: theme.textPrimary }]}>NearMe</T>
        <T style={[styles.tagline, { color: theme.textSecondary }]}>Real people, right nearby</T>
      </View>
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: theme.brand, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={() => router.push('/onboarding/intro')}
        >
          <T style={[styles.primaryText, { color: theme.textInverse }]}>Get Started</T>
        </Pressable>
        <Pressable style={styles.loginRow} onPress={() => router.push('/onboarding/auth')}>
          <T style={[styles.loginText, { color: theme.textSecondary }]}>
            I have an account  <T style={[styles.loginLink, { color: theme.brand }]}>Log In</T>
          </T>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  wordmark: { fontSize: 36, fontWeight: '800', letterSpacing: 1, marginTop: 12 },
  tagline: { fontSize: 15 },
  footer: { padding: 20, gap: 16 },
  primary: {
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontSize: 17, fontWeight: '700' },
  loginRow: { alignItems: 'center', paddingVertical: 8 },
  loginText: { fontSize: 15 },
  loginLink: { fontWeight: '700' },
});
