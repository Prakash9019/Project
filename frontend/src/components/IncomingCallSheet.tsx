import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme';
import { connectSocket } from '../services/socket';
import { updateCall, getPublicProfile } from '../services/api';

interface Invite {
  callId: string;
  callerId: string;
  type: 'audio' | 'video';
  callerName?: string;
  callerPhoto?: string;
}

/**
 * Global incoming-call listener. Mounted once at the root; listens for the
 * `call:invite` socket event and presents an accept/decline sheet.
 */
export function IncomingCallSheet() {
  const { theme } = useTheme();
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null>(null);

  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      const socket = await connectSocket();
      if (!socket) return;
      const onInvite = async (p: any) => {
        const base: Invite = { callId: p.callId, callerId: p.callerId, type: p.type };
        setInvite(base);
        // Enrich with caller name/photo (best effort).
        try {
          const prof = await getPublicProfile(p.callerId);
          setInvite((cur) =>
            cur && cur.callId === p.callId
              ? { ...cur, callerName: prof.firstName ?? 'Someone', callerPhoto: prof.profilePhoto ?? undefined }
              : cur
          );
        } catch {
          /* ignore */
        }
      };
      socket.on('call:invite', onInvite);
      cleanup = () => socket.off('call:invite', onInvite);
    })();
    return () => cleanup();
  }, []);

  const accept = async () => {
    if (!invite) return;
    const inv = invite;
    setInvite(null);
    try {
      await updateCall(inv.callId, 'answered');
    } catch {
      /* ignore */
    }
    router.push({
      pathname: '/call/[id]',
      params: {
        id: inv.callId,
        type: inv.type,
        peerName: inv.callerName ?? '',
        peerPhoto: inv.callerPhoto ?? '',
      },
    });
  };

  const decline = async () => {
    if (!invite) return;
    const inv = invite;
    setInvite(null);
    try {
      await updateCall(inv.callId, 'declined');
    } catch {
      /* ignore */
    }
  };

  if (!invite) return null;

  return (
    <Modal visible transparent animationType="slide">
      <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          {invite.callerPhoto ? (
            <Image source={{ uri: invite.callerPhoto }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.backgroundTertiary, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={48} color={theme.textTertiary} />
            </View>
          )}
          <Text style={[styles.name, { color: theme.textPrimary }]}>{invite.callerName ?? 'Incoming call'}</Text>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>
            Incoming {invite.type} call…
          </Text>
          <View style={styles.actions}>
            <View style={styles.action}>
              <Pressable style={[styles.btn, { backgroundColor: theme.error }]} onPress={decline}>
                <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              </Pressable>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Decline</Text>
            </View>
            <View style={styles.action}>
              <Pressable
                style={[styles.btn, { backgroundColor: invite.type === 'video' ? theme.callVideo : theme.callAudio }]}
                onPress={accept}
              >
                <Ionicons name={invite.type === 'video' ? 'videocam' : 'call'} size={28} color="#fff" />
              </Pressable>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Accept</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, alignItems: 'center', paddingBottom: 48 },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  name: { fontSize: 22, fontWeight: '800', marginTop: 16 },
  sub: { fontSize: 15, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 60, marginTop: 32 },
  action: { alignItems: 'center', gap: 8 },
  btn: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13 },
});
