import { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Vibration } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Toast, { type ToastConfig as ToastConfigType, type ToastConfigParams } from 'react-native-toast-message';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
const ringtoneAsset = require('../../../assets/sounds/ringtone.wav');
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { useTheme, FontFamily, DisplayFont, type AppTheme } from '../../theme';
import { updateCall } from '../../services/api';

/* ─────────────────────────── Prop types ─────────────────────────── */

export interface MessageToastProps {
  conversationId: string;
  senderName: string;
  senderPhoto: string | null;
  messagePreview: string;
  timeAgo: string;
  isOnline: boolean;
}
export interface TapToastProps {
  senderId: string;
  firstName: string;
  senderPhoto: string | null;
  age: number;
  distanceLabel: string;
}
export interface CallToastProps {
  callId: string;
  callerId: string;
  callerName: string;
  callerPhoto: string | null;
  type: 'audio' | 'video';
  agoraChannelName: string;
  agoraToken: string;
}
export interface RoomMessageToastProps {
  roomId: string;
  roomName: string;
  senderName: string;
  messagePreview: string;
}

/* ─────────────────────────── Shared shell ─────────────────────────── */

/**
 * Rounded card with a coloured accent bar down the left edge — the shared
 * chrome for the message / tap / room toasts. Tapping runs the toast's onPress
 * (navigation) then dismisses.
 */
function ToastCard({
  theme,
  accent,
  onPress,
  children,
  wide,
}: {
  theme: AppTheme;
  accent: string;
  onPress?: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        onPress?.();
        Toast.hide();
      }}
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          shadowColor: theme.brand,
          marginHorizontal: wide ? 12 : 16,
        },
      ]}
    >
      <View style={[styles.accent, { backgroundColor: accent }]} />
      {children}
    </Pressable>
  );
}

function Avatar({ uri, size, theme }: { uri: string | null; size: number; theme: AppTheme }) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        transition={120}
        cachePolicy="memory-disk"
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.backgroundTertiary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="person" size={size * 0.5} color={theme.textTertiary} />
    </View>
  );
}

/* ─────────────────────────── Type 1: message ─────────────────────────── */

function MessageToast({ props, onPress }: ToastConfigParams<MessageToastProps>) {
  const { theme } = useTheme();
  return (
    <ToastCard theme={theme} accent={theme.brand} onPress={onPress}>
      <View style={styles.avatarWrap}>
        <Avatar uri={props.senderPhoto} size={40} theme={theme} />
        {props.isOnline && (
          <View style={[styles.onlineDot, { backgroundColor: theme.online, borderColor: theme.surface }]} />
        )}
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
          {props.senderName}
        </Text>
        <Text style={[styles.preview, { color: theme.textSecondary }]} numberOfLines={1}>
          {props.messagePreview}
        </Text>
      </View>
      <Text style={[styles.timeAgo, { color: theme.textTertiary }]}>{props.timeAgo}</Text>
    </ToastCard>
  );
}

/* ─────────────────────────── Type 2: tap_received ─────────────────────────── */

function TapToast({ props, onPress }: ToastConfigParams<TapToastProps>) {
  const { theme } = useTheme();
  const meta = [props.age ? `${props.age}` : null, props.distanceLabel || null]
    .filter(Boolean)
    .join(' · ');
  return (
    <ToastCard theme={theme} accent={theme.brandSecondary} onPress={onPress}>
      <Avatar uri={props.senderPhoto} size={40} theme={theme} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>
          {props.firstName} tapped you 🔥
        </Text>
        {!!meta && (
          <Text style={[styles.preview, { color: theme.textSecondary }]} numberOfLines={1}>
            {meta}
          </Text>
        )}
      </View>
      <Ionicons name="flame" size={20} color={theme.brand} />
    </ToastCard>
  );
}

/* ─────────────────────────── Type 3: call_incoming ─────────────────────────── */

/** Pulsing ring behind the caller avatar (Reanimated, infinite scale+fade). */
function PulseRing({ size, color }: { size: number; color: string }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1.25, { duration: 600 }), withTiming(1, { duration: 600 })),
      -1,
      false,
    );
  }, [pulse]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: interpolate(pulse.value, [1, 1.25], [0.6, 0]),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function CallToast({ props }: ToastConfigParams<CallToastProps>) {
  const { theme } = useTheme();
  const router = useRouter();

  // Incoming-call feedback: loop the ringtone + device vibration so the call is
  // unmissable, and auto-dismiss as MISSED after 30s (autoHide is disabled on
  // this toast). The cleanup — stop the ringtone, cancel vibration, clear the
  // timer — runs on unmount, which covers every exit path: accept, decline,
  // AND timeout all unmount the toast.
  useEffect(() => {
    // Repeating pattern [wait, vibrate, pause, …] with repeat = true.
    Vibration.vibrate([0, 700, 1000], true);
    const player = createAudioPlayer(ringtoneAsset);
    player.loop = true;
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' })
      .catch(() => {})
      .finally(() => player.play());
    const t = setTimeout(() => {
      updateCall(props.callId, 'missed').catch(() => {});
      Toast.hide();
    }, 30000);
    return () => {
      clearTimeout(t);
      Vibration.cancel();
      player.remove();
    };
  }, [props.callId]);

  const accept = () => {
    Vibration.cancel(); // stop feedback immediately, before the exit animation
    Toast.hide();
    updateCall(props.callId, 'answered').catch(() => {});
    router.push({
      pathname: '/call/[id]',
      params: {
        id: props.callId,
        channel: props.agoraChannelName,
        token: props.agoraToken,
        type: props.type,
        peerName: props.callerName,
        peerPhoto: props.callerPhoto ?? '',
      },
    });
  };

  const decline = () => {
    Vibration.cancel(); // stop feedback immediately, before the exit animation
    Toast.hide();
    updateCall(props.callId, 'declined').catch(() => {});
  };

  return (
    <LinearGradient
      colors={[theme.background, theme.surface]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[styles.callCard, { borderColor: theme.border }]}
    >
      <View style={styles.callAvatarWrap}>
        <PulseRing size={56} color={theme.online} />
        <Avatar uri={props.callerPhoto} size={48} theme={theme} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.callName, { color: theme.textPrimary }]} numberOfLines={1}>
          {props.callerName} is calling…
        </Text>
        <View style={styles.callTypeRow}>
          <Ionicons
            name={props.type === 'video' ? 'videocam' : 'call'}
            size={13}
            color={theme.textSecondary}
          />
          <Text style={[styles.callType, { color: theme.textSecondary }]}>
            {props.type === 'video' ? 'Video Call' : 'Audio Call'}
          </Text>
        </View>
      </View>
      <View style={styles.callActions}>
        <Pressable style={[styles.callBtn, { backgroundColor: theme.error }]} onPress={decline}>
          <Ionicons name="call" size={20} color={theme.textInverse} style={styles.declineIcon} />
        </Pressable>
        <Pressable style={[styles.callBtn, { backgroundColor: theme.online }]} onPress={accept}>
          <Ionicons name="call" size={20} color={theme.textInverse} />
        </Pressable>
      </View>
    </LinearGradient>
  );
}

/* ─────────────────────────── Type 4: room_message ─────────────────────────── */

function RoomMessageToast({ props, onPress }: ToastConfigParams<RoomMessageToastProps>) {
  const { theme } = useTheme();
  return (
    <ToastCard theme={theme} accent={theme.rightNow} onPress={onPress}>
      <View
        style={[styles.roomIcon, { backgroundColor: theme.rightNowSoft }]}
      >
        <Ionicons name="people" size={20} color={theme.rightNow} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.roomName, { color: theme.textTertiary }]} numberOfLines={1}>
          {props.roomName}
        </Text>
        <Text style={[styles.preview, { color: theme.textPrimary }]} numberOfLines={1}>
          <Text style={{ fontFamily: FontFamily.semibold }}>{props.senderName}: </Text>
          {props.messagePreview}
        </Text>
      </View>
    </ToastCard>
  );
}

/* ─────────────────────────── Type 5/6: success / error ─────────────────────────── */

function StatusToast({
  text1,
  text2,
  accent,
  icon,
}: {
  text1?: string;
  text2?: string;
  accent: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const { theme } = useTheme();
  return (
    <ToastCard theme={theme} accent={accent}>
      <Ionicons name={icon} size={24} color={accent} />
      <View style={[styles.body, { marginLeft: 12 }]}>
        {!!text1 && (
          <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={2}>
            {text1}
          </Text>
        )}
        {!!text2 && (
          <Text style={[styles.preview, { color: theme.textSecondary }]} numberOfLines={2}>
            {text2}
          </Text>
        )}
      </View>
    </ToastCard>
  );
}

// Own components so useTheme() runs inside a real component render (rules of
// hooks) rather than in a bare config callback.
function SuccessToast({ text1, text2 }: ToastConfigParams<unknown>) {
  const { theme } = useTheme();
  return <StatusToast text1={text1} text2={text2} accent={theme.success} icon="checkmark-circle" />;
}
function ErrorToast({ text1, text2 }: ToastConfigParams<unknown>) {
  const { theme } = useTheme();
  return <StatusToast text1={text1} text2={text2} accent={theme.error} icon="close-circle" />;
}
function InfoToast({ text1, text2 }: ToastConfigParams<unknown>) {
  const { theme } = useTheme();
  return <StatusToast text1={text1} text2={text2} accent={theme.brand} icon="information-circle" />;
}

/* ─────────────────────────── Config export ─────────────────────────── */

export const ToastConfig: ToastConfigType = {
  message: (p) => <MessageToast {...(p as ToastConfigParams<MessageToastProps>)} />,
  tap_received: (p) => <TapToast {...(p as ToastConfigParams<TapToastProps>)} />,
  call_incoming: (p) => <CallToast {...(p as ToastConfigParams<CallToastProps>)} />,
  room_message: (p) => <RoomMessageToast {...(p as ToastConfigParams<RoomMessageToastProps>)} />,
  success: (p) => <SuccessToast {...p} />,
  error: (p) => <ErrorToast {...p} />,
  info: (p) => <InfoToast {...p} />,
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 12,
    paddingLeft: 15,
    marginTop: 8,
    overflow: 'hidden',
    // shadowColor is set inline to theme.brand
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    width: '92%',
    alignSelf: 'center',
  },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  avatarWrap: { position: 'relative' },
  onlineDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  body: { flex: 1, gap: 2 },
  title: { fontFamily: FontFamily.semibold, fontSize: 14 },
  preview: { fontFamily: FontFamily.regular, fontSize: 13 },
  timeAgo: { fontFamily: FontFamily.regular, fontSize: 11 },
  roomIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  roomName: { fontFamily: FontFamily.semibold, fontSize: 13 },

  callCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 80,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 12,
    marginTop: 8,
    width: '94%',
    alignSelf: 'center',
    elevation: 12,
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  callAvatarWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  callName: { fontFamily: DisplayFont.medium, fontSize: 16 },
  callTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  callType: { fontFamily: FontFamily.regular, fontSize: 13 },
  callActions: { flexDirection: 'row', gap: 10 },
  callBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  declineIcon: { transform: [{ rotate: '135deg' }] },
});
