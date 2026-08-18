// @react-native-firebase/app requires a native build (not Expo Go).
// Guard with try-catch so a missing native module surfaces as a warning
// instead of crashing the entire root layout.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@react-native-firebase/app');
} catch (e) {
  console.warn('[Firebase] Native module not available — rebuild the app with `npx expo run:android` or `npx expo run:ios`:', e);
}
import { useCallback, useEffect, useRef } from 'react';
import { Stack, useRouter, useNavigationContainerRef } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, View } from 'react-native';
import * as Location from 'expo-location';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
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
import { connectSocket, emitLocationUpdate } from '../src/services/socket';
import { updateLocation, registerFcmToken } from '../src/services/api';
import { useAuthStore } from '../src/store/authStore';
import { useChatStore } from '../src/store/chatStore';
import { useGroupsStore } from '../src/store/groupsStore';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { ToastConfig } from '../src/components/notifications/ToastConfig';
import { setNavigationRef } from '../src/utils/navigationRef';
import {
  showMessageToast,
  showTapToast,
  showCallToast,
  showRoomMessageToast,
  showRoomCallToast,
} from '../src/lib/toast';
import { loadNotificationPrefs, type NotificationPreferences } from './settings/notifications';
import type { UserCard, RoomMessageCard } from '../src/types/api';

/** Human-friendly one-line preview for a message toast, by message type. */
function messagePreviewFor(type: string | undefined, content: string | undefined): string {
  switch (type) {
    case 'photo':
    case 'expiring_photo':
      return '📷 Photo';
    case 'voice':
    case 'voice_note':
      return '🎤 Voice message';
    case 'video':
      return '🎥 Video';
    default:
      return (content ?? '').slice(0, 60) || 'New message';
  }
}

function RootStack() {
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const authedUserId = useAuthStore((s) => s.user?.id);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const navContainerRef = useNavigationContainerRef();
  const appState = useRef(AppState.currentState);

  // Expose the router's navigation container so toast logic can read the
  // focused route/params and suppress notifications for the screen you're on.
  useEffect(() => {
    setNavigationRef(navContainerRef);
    return () => setNavigationRef(null);
  }, [navContainerRef]);

  // Bootstrap the session ONCE at the true app root, not just on the splash
  // screen (`app/index.tsx`). When the app is cold-started from a deep link
  // (e.g. an album share link — Linking.createURL('albums/:id', ...)),
  // expo-router's linking config resolves the initial route directly to the
  // deep-linked screen (e.g. `/albums/[id]`) and `index.tsx` never mounts, so
  // its `refreshUser()` call — the only place that populated `useAuthStore`
  // — never ran. Every screen that reads `me`/`authedUserId` (album
  // ownership checks, the socket connection below, FCM registration) was
  // left with a null user for the lifetime of that session. Running it here
  // guarantees `me` hydrates on every cold start, deep-link or not.
  useEffect(() => {
    refreshUser().catch(() => {});
  }, [refreshUser]);

  useEffect(() => {
    // When a token refresh fails, clear session and bounce to onboarding.
    setOnAuthFailure(() => {
      logout();
      router.replace('/onboarding');
    });
    return () => setOnAuthFailure(null);
  }, [router, logout]);

  // Establish the realtime socket ONCE the user is authenticated — at the root,
  // so every screen (Browse, Right Now, chats, rooms, incoming calls) receives
  // live events without each having to bootstrap the connection itself. The
  // socket is a singleton; connecting here after login/rehydrate means messages,
  // taps, and call invites arrive even before the user opens Inbox. logout()
  // disconnects it. Keyed on user id so it re-establishes on account switch.
  useEffect(() => {
    if (authedUserId) connectSocket().catch(() => {});
  }, [authedUserId]);

  // Refresh the user's location whenever the app returns to the foreground.
  // Distances shown across the app go stale while backgrounded (the user may
  // have moved); pushing a fresh fix on resume corrects both our own outgoing
  // distance and keeps us discoverable. Silent — never interrupts the user.
  useEffect(() => {
    if (!authedUserId) return;
    const sub = AppState.addEventListener('change', async (nextState) => {
      const cameToForeground =
        appState.current.match(/inactive|background/) && nextState === 'active';
      appState.current = nextState;
      if (!cameToForeground) return;
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        emitLocationUpdate(loc.coords.latitude, loc.coords.longitude);
        updateLocation(loc.coords.latitude, loc.coords.longitude).catch(() => {});
      } catch {
        // Silent fail — don't interrupt the user on a location hiccup.
      }
    });
    return () => sub.remove();
  }, [authedUserId]);

  // FCM push registration + background handler. Requires a native build (not
  // Expo Go) and @react-native-firebase/messaging linked via app.config.js
  // plugins — guarded the same way as the app.ts require above so a missing
  // native module only warns instead of crashing the root layout.
  useEffect(() => {
    if (!authedUserId) return;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const messagingModule = require('@react-native-firebase/messaging');
        const messaging = messagingModule.default;
        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messagingModule.AuthorizationStatus.AUTHORIZED ||
          authStatus === messagingModule.AuthorizationStatus.PROVISIONAL;
        if (!enabled) return;
        const token = await messaging().getToken();
        if (token) registerFcmToken(token).catch(() => {});
        // App is foregrounded — the socket listener above already shows a
        // toast for new messages/taps/calls; don't double-notify here.
        messaging().onMessage(async () => {});
        messaging().setBackgroundMessageHandler(async () => {});

        // ── Notification-tap navigation ──
        // Route to the right screen based on the typed `data` set by the backend
        // (see adapters/fcm.ts buildPushMessage). Chat-family → /chat/:id,
        // room-family → /rooms/:id.
        const navigateFromData = (data: Record<string, string> | undefined) => {
          if (!data?.type) return;
          const { type, conversationId, roomId } = data;
          if (type.startsWith('room_') && roomId) {
            router.push(`/rooms/${roomId}`);
          } else if (conversationId) {
            router.push(`/chat/${conversationId}`);
          }
        };

        // App opened from a quit state by tapping a notification.
        messaging()
          .getInitialNotification()
          .then((remoteMessage: { data?: Record<string, string> } | null) => {
            if (remoteMessage) navigateFromData(remoteMessage.data);
          })
          .catch(() => {});

        // App in background, brought to foreground by a notification tap.
        messaging().onNotificationOpenedApp((remoteMessage: { data?: Record<string, string> } | null) => {
          if (remoteMessage) navigateFromData(remoteMessage.data);
        });
      } catch (e) {
        console.warn('[FCM] Native module not available — rebuild the app with `npx expo run:android` or `npx expo run:ios`:', e);
      }
    })();
  }, [authedUserId]);

  // Global notification toasts. One always-mounted place turns realtime socket
  // events into rich toasts (message / tap / incoming call / room message).
  // Each helper self-suppresses when you're already viewing that content.
  const notifPrefs = useRef<NotificationPreferences | null>(null);
  const myFirstName = useAuthStore((s) => s.user?.firstName);
  useEffect(() => {
    loadNotificationPrefs().then((p) => { notifPrefs.current = p; }).catch(() => {});
  }, [authedUserId]);

  useEffect(() => {
    if (!authedUserId) return;
    let cleanup = () => {};
    (async () => {
      const socket = await connectSocket();
      if (!socket) return;

      const onMessage = (p: { conversationId: string; senderId: string; content?: string; type?: string }) => {
        if (p.senderId === authedUserId) return; // never toast your own message
        if (notifPrefs.current && !notifPrefs.current.messages) return;
        const convo = useChatStore.getState().conversations.find((c) => c.id === p.conversationId);
        const peer = convo?.peer;
        showMessageToast({
          conversationId: p.conversationId,
          senderName: peer?.firstName ?? 'Someone',
          senderPhoto: peer?.profilePhoto ?? null,
          messagePreview: messagePreviewFor(p.type, p.content),
          timeAgo: 'now',
          isOnline: peer?.activity?.online ?? true,
        });
      };

      const onTap = (p: { senderId: string; senderCard?: UserCard | null }) => {
        const card = p.senderCard;
        if (!card) return;
        showTapToast({
          senderId: card.id ?? p.senderId,
          firstName: card.firstName ?? 'Someone',
          senderPhoto: card.profilePhoto ?? null,
          age: card.age ?? 0,
          distanceLabel: card.distanceLabel ?? card.distance ?? '',
        });
      };

      const onCallInvite = (p: {
        callId: string;
        callerId: string;
        callerName?: string;
        callerPhoto?: string | null;
        type: 'audio' | 'video';
        agoraChannelName: string;
        agoraToken: string;
      }) => {
        showCallToast({
          callId: p.callId,
          callerId: p.callerId,
          callerName: p.callerName ?? 'Someone',
          callerPhoto: p.callerPhoto ?? null,
          type: p.type,
          agoraChannelName: p.agoraChannelName,
          agoraToken: p.agoraToken,
        });
      };

      const onRoomCallInvite = (p: {
        callId: string;
        roomId: string;
        initiatorId: string;
        initiatorName?: string | null;
        initiatorPhoto?: string | null;
        type: 'audio' | 'video';
        agoraChannelName: string;
        agoraToken: string;
      }) => {
        if (p.initiatorId === authedUserId) return; // don't ring the person who just started the call
        const prefs = notifPrefs.current;
        if (prefs && !prefs.missedCalls) return;
        showRoomCallToast({
          callId: p.callId,
          roomId: p.roomId,
          roomName: useGroupsStore.getState().roomName(p.roomId),
          initiatorId: p.initiatorId,
          initiatorName: p.initiatorName ?? 'Someone',
          initiatorPhoto: p.initiatorPhoto ?? null,
          type: p.type,
          agoraChannelName: p.agoraChannelName,
          agoraToken: p.agoraToken,
        });
      };

      const onRoomMessage = (msg: RoomMessageCard) => {
        if (msg.senderId === authedUserId) return;
        const prefs = notifPrefs.current;
        if (prefs) {
          if (!prefs.groupMessages) return;
          if (prefs.mentionsOnly) {
            const mentioned = !!myFirstName && new RegExp(`@${myFirstName}\\b`, 'i').test(msg.content ?? '');
            if (!mentioned) return;
          }
        }
        showRoomMessageToast({
          roomId: msg.roomId,
          roomName: useGroupsStore.getState().roomName(msg.roomId),
          senderName: msg.sender?.firstName ?? 'Someone',
          messagePreview: (msg.content ?? '').slice(0, 60),
        });
      };

      socket.on('message.created', onMessage);
      socket.on('tap.received', onTap);
      socket.on('call:invite', onCallInvite);
      socket.on('room:call.invite', onRoomCallInvite);
      socket.on('room:message', onRoomMessage);
      cleanup = () => {
        socket.off('message.created', onMessage);
        socket.off('tap.received', onTap);
        socket.off('call:invite', onCallInvite);
        socket.off('room:call.invite', onRoomCallInvite);
        socket.off('room:message', onRoomMessage);
      };
    })();
    return () => cleanup();
  }, [authedUserId]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.background },
            // Native iOS interactive push (with swipe-back) on both platforms —
            // feels native rather than the default RN slide (F45). Modal screens
            // below opt into `presentation: 'modal'` for the native sheet slide-up;
            // expo-router Tabs switch instantly with no transition.
            animation: 'ios_from_right',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="profile/[id]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="chat/media" />
          <Stack.Screen name="call/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="filters" options={{ presentation: 'modal' }} />
          <Stack.Screen name="explore" options={{ presentation: 'modal' }} />
          <Stack.Screen name="map-explore" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings/index" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings/edit-profile" />
          <Stack.Screen name="settings/notifications" />
          <Stack.Screen name="starred-messages" />
          <Stack.Screen name="albums/index" options={{ presentation: 'modal' }} />
          <Stack.Screen name="albums/[id]" />
          <Stack.Screen name="albums/create" options={{ presentation: 'modal' }} />
          <Stack.Screen name="albums/edit" options={{ presentation: 'modal' }} />
          <Stack.Screen name="verification" />
          <Stack.Screen name="rooms/[id]" />
          <Stack.Screen name="rooms/members" options={{ presentation: 'modal' }} />
          <Stack.Screen name="rooms/info" />
          <Stack.Screen name="rooms/media" />
          <Stack.Screen name="rooms/pinned" />
          <Stack.Screen name="rooms/join/[code]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="create-group/members" />
          <Stack.Screen name="create-group/details" />
        </Stack>
        {/* Incoming calls now surface as a 'call_incoming' toast (with
            Accept/Decline) via the socket listener above — no separate sheet. */}
        <OfflineBanner />
        <Toast config={ToastConfig} position="top" topOffset={50} visibilityTime={4000} />
        </BottomSheetModalProvider>
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
