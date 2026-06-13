import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme';
import { NearMeLogo } from '../src/components/icons';
import { useAuthStore } from '../src/store/authStore';
import { isAuthenticated } from '../src/services/auth';

/**
 * Splash — NearMe logo, then routes based on session:
 * authenticated → /(tabs), otherwise → /onboarding.
 */
export default function Splash() {
  const router = useRouter();
  const { theme } = useTheme();
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
    ]).start();

    const route = async () => {
      const authed = await isAuthenticated();
      if (authed) {
        await refreshUser();
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding');
      }
    };
    const t = setTimeout(route, 1400);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <NearMeLogo size={96} color={theme.brand} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
