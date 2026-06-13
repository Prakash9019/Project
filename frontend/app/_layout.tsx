import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
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
          <Stack.Screen name="settings/index" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings/edit-profile" />
          <Stack.Screen name="albums/index" />
          <Stack.Screen name="albums/[id]" />
          <Stack.Screen name="verification" />
        </Stack>
        <IncomingCallSheet />
        <OfflineBanner />
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <RootStack />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
