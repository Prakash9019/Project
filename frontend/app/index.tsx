import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme';
import { NearMeLogo } from '../src/components/icons';
import { useAuthStore } from '../src/store/authStore';
import { useGridStore } from '../src/store/gridStore';
import { isAuthenticated } from '../src/services/auth';

/**
 * Splash — NearMe logo, then routes based on session:
 * authenticated → /(tabs), otherwise → /onboarding.
 *
 * Startup is optimistic (F42/F43): as soon as we confirm a token exists in
 * SecureStore we navigate to the grid IMMEDIATELY — the grid renders its own
 * skeleton — instead of sitting on the logo waiting for GET /auth/me on a cold
 * (Render) backend. /auth/me is revalidated in the BACKGROUND: on success we
 * reconcile the user silently; if the session turns out to be unfinished
 * onboarding we redirect to setup; if it's expired the api client's refresh
 * path fires setOnAuthFailure (root layout) which logs out → /onboarding.
 * No hard-coded delay — the logo animation is purely cosmetic and non-blocking.
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

    let cancelled = false;
    (async () => {
      const authed = await isAuthenticated();
      if (cancelled) return;
      if (!authed) {
        router.replace('/onboarding');
        return;
      }
      // Optimistic navigation: reach the grid without awaiting /auth/me. Warm the
      // cached grid page under the skeleton so cards paint instantly (idempotent —
      // no-ops if the grid is already populated). This hides server latency behind
      // the navigation transition.
      useGridStore.getState().hydrateCache().catch(() => {});
      router.replace('/(tabs)');
      // Revalidate the session in the background and reconcile silently.
      refreshUser()
        .then(() => {
          if (cancelled) return;
          const user = useAuthStore.getState().user;
          // Signed in but onboarding was never finished (closed the app mid-setup)
          // → resume setup, which rehydrates their saved draft on the last step.
          if (user && !(user.firstName || user.name)) {
            router.replace('/onboarding/setup');
          }
        })
        .catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
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
