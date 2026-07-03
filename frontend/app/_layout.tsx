// @react-native-firebase/app requires a native build (not Expo Go).
// Guard with try-catch so a missing native module surfaces as a warning
// instead of crashing the entire root layout.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@react-native-firebase/app');
} catch (e) {
  console.warn('[Firebase] Native module not available — rebuild the app with `npx expo run:android` or `npx expo run:ios`:', e);
}
import { useCallback, useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  useFonts,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from '@expo-google-fonts/outfit';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { ThemeProvider, useTheme } from '../src/theme';
import { setOnAuthFailure } from '../src/services/auth';
import { useAuthStore } from '../src/store/authStore';
import { IncomingCallSheet } from '../src/components/IncomingCallSheet';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { OfflineBanner } from '../src/components/OfflineBanner';

function RootStack() {
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    // When a token refresh fails, clear session and bounce to onboarding.
    setOnAuthFailure(() => {
      logout();
      router.replace('/onboarding');
    });
    return () => setOnAuthFailure(null);
  }, [router, logout]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.background },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="profile/[id]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="call/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="filters" options={{ presentation: 'modal' }} />
          <Stack.Screen name="explore" options={{ presentation: 'modal' }} />
          <Stack.Screen name="map-explore" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings/index" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings/edit-profile" />
          <Stack.Screen name="albums/index" options={{ presentation: 'modal' }} />
          <Stack.Screen name="albums/[id]" />
          <Stack.Screen name="albums/create" options={{ presentation: 'modal' }} />
          <Stack.Screen name="albums/edit" options={{ presentation: 'modal' }} />
          <Stack.Screen name="verification" />
          <Stack.Screen name="rooms/[id]" />
          <Stack.Screen name="rooms/members" options={{ presentation: 'modal' }} />
        </Stack>
        <IncomingCallSheet />
        <OfflineBanner />
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const onReady = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Gate render on fonts so text never flashes in the system face. Still render
  // (and hide the splash) if font loading errors, so the app is never stuck.
  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <View style={{ flex: 1 }} onLayout={onReady}>
          <RootStack />
        </View>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
