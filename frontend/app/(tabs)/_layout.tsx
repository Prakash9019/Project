import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, FontFamily, DisplayFont } from '../../src/theme';
import { RightNowIcon } from '../../src/components/icons';
import { useChatStore } from '../../src/store/chatStore';
import { useGroupsStore } from '../../src/store/groupsStore';
import { useAuthStore } from '../../src/store/authStore';
import { connectSocket } from '../../src/services/socket';
import { isViewing } from '../../src/utils/navigationRef';
import type { RoomMessageCard } from '../../src/types/api';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type TabDef =
  | { name: string; label: string; active: IoniconName; inactive: IoniconName; svgIcon?: undefined }
  | { name: string; label: string; svgIcon: true; active?: undefined; inactive?: undefined };

const TABS: TabDef[] = [
  { name: 'index',     label: 'Browse',    active: 'grid',                inactive: 'grid-outline' },
  { name: 'right-now', label: 'Right Now', svgIcon: true },
  { name: 'groups',    label: 'Groups',    active: 'people',              inactive: 'people-outline' },
  { name: 'inbox',     label: 'Inbox',     active: 'chatbubble-ellipses', inactive: 'chatbubble-ellipses-outline' },
  { name: 'store',     label: 'Store',     active: 'diamond',             inactive: 'diamond-outline' },
];

function TabIcon({ name, color, active }: { name: string; color: string; active: boolean }) {
  const meta = TABS.find((t) => t.name === name);
  if (!meta) return null;
  if (meta.svgIcon) {
    return <RightNowIcon size={25} color={color} solid={active} />;
  }
  return <Ionicons name={active ? meta.active : meta.inactive} size={25} color={color} />;
}

/** Orange dot + count shown on a tab icon (currently the Inbox unread count). */
function TabBadge({ count, theme }: { count: number; theme: ReturnType<typeof useTheme>['theme'] }) {
  if (count <= 0) return null;
  return (
    <View style={[s.badge, { backgroundColor: theme.brand, borderColor: theme.tabBar }]}>
      <Text style={s.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

function CustomTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  // Total unread across all conversations, summed live from the chat store
  // (kept current by the socket listener in TabsLayout). Shown as a badge on
  // the Inbox tab; clears to 0 as conversations are marked read.
  const inboxUnread = useChatStore((st) =>
    st.conversations.reduce((n, c) => n + (c.unreadCount ?? 0), 0),
  );
  // Total unread across joined rooms (kept live by the room:message listener in
  // TabsLayout); shown on the Groups tab, cleared as rooms are opened.
  const groupsUnread = useGroupsStore((st) =>
    st.rooms.reduce((n, r) => n + (r.unreadCount ?? 0), 0),
  );
  return (
    <View style={[s.bar, { backgroundColor: theme.tabBar, borderTopColor: theme.border, paddingBottom: insets.bottom || 8 }]}>
      {state.routes
        .filter((r: any) => TABS.some((t) => t.name === r.name))
        .map((route: any) => {
          const meta = TABS.find((t) => t.name === route.name)!;
          const routeIndex = state.routes.findIndex((r: any) => r.key === route.key);
          const active = state.index === routeIndex;
          const color = active ? theme.tabBarActive : theme.tabBarInactive;
          return (
            <Pressable
              key={route.key}
              style={s.tab}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!active && !event.defaultPrevented) navigation.navigate(route.name);
              }}
            >
              <View style={s.iconWrap}>
                <TabIcon name={route.name} color={color} active={active} />
                {route.name === 'inbox' && <TabBadge count={inboxUnread} theme={theme} />}
                {route.name === 'groups' && <TabBadge count={groupsUnread} theme={theme} />}
              </View>
              <Text
                style={[
                  s.label,
                  { color, fontFamily: active ? DisplayFont.bold : FontFamily.semibold },
                ]}
              >
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
    </View>
  );
}

export default function TabsLayout() {
  const { theme } = useTheme();
  const meId = useAuthStore((st) => st.user?.id);
  const fetchConversations = useChatStore((st) => st.fetchConversations);
  const applyIncomingMessage = useChatStore((st) => st.applyIncomingMessage);
  const fetchJoinedRooms = useGroupsStore((st) => st.fetchJoinedRooms);
  const applyIncomingRoomMessage = useGroupsStore((st) => st.applyIncomingRoomMessage);

  // Seed the conversation + joined-room lists once so the Inbox and Groups tab
  // badges are accurate even before the user opens those tabs.
  useEffect(() => {
    if (!meId) return;
    fetchConversations('inbox').catch(() => {});
    fetchJoinedRooms().catch(() => {});
  }, [meId, fetchConversations, fetchJoinedRooms]);

  // Single always-mounted listener that keeps unread counts (and thus the tab
  // badges) live. Centralised here — not in the Inbox/Groups screens — so counts
  // update regardless of which tab is focused, and so incoming messages are
  // never counted twice by overlapping listeners.
  useEffect(() => {
    if (!meId) return;
    let cleanup = () => {};
    (async () => {
      const socket = await connectSocket();
      if (!socket) return;
      const onCreated = (p: { conversationId: string; senderId: string; content?: string; type?: string }) => {
        const preview = p.content ?? (p.type ? `[${p.type}]` : 'New message');
        applyIncomingMessage(p.conversationId, preview, p.senderId === meId);
      };
      const onRoomMessage = (msg: RoomMessageCard) => {
        // Skip our own messages and any room we're currently viewing (that room
        // marks itself read on open, so bumping it would be wrong).
        if (msg.senderId === meId) return;
        if (isViewing('rooms/[id]', msg.roomId)) return;
        applyIncomingRoomMessage(msg.roomId);
      };
      socket.on('message.created', onCreated);
      socket.on('room:message', onRoomMessage);
      cleanup = () => {
        socket.off('message.created', onCreated);
        socket.off('room:message', onRoomMessage);
      };
    })();
    return () => cleanup();
  }, [meId, applyIncomingMessage, applyIncomingRoomMessage]);

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.background } }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="right-now" />
      <Tabs.Screen name="groups" />
      <Tabs.Screen name="inbox" />
      <Tabs.Screen name="store" />
    </Tabs>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  iconWrap: { height: 28, justifyContent: 'center' },
  label: { fontSize: 11 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
