import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Avatar } from '../../src/components/Avatar';
import { MiniProfile } from '../../src/components/MiniProfile';
import { useTheme, FontFamily, DisplayFont, spacing } from '../../src/theme';
import { listRoomMembers } from '../../src/services/api';
import { toastApiError } from '../../src/lib/toast';
import type { RoomMemberCard, RoomUserCard } from '../../src/types/api';

export default function RoomMembers() {
  const { theme } = useTheme();
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();

  const [members, setMembers] = useState<RoomMemberCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [miniUser, setMiniUser] = useState<RoomUserCard | null>(null);

  const load = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    try {
      const res = await listRoomMembers(String(roomId), { limit: 100 });
      setMembers(res.members);
      setTotal(res.total);
    } catch (e) {
      toastApiError(e, 'Could not load members');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => (m.user.firstName ?? '').toLowerCase().includes(q));
  }, [members, query]);

  const online = filtered.filter((m) => m.user.isOnline);
  const rest = filtered.filter((m) => !m.user.isOnline);

  const sections = [
    ...(online.length ? [{ title: `Online · ${online.length}`, data: online }] : []),
    ...(rest.length ? [{ title: 'All Members', data: rest }] : []),
  ];
  // Flatten to a single list with section headers.
  const rows: ({ type: 'header'; title: string } | { type: 'member'; member: RoomMemberCard })[] = [];
  for (const s of sections) {
    rows.push({ type: 'header', title: s.title });
    for (const m of s.data) rows.push({ type: 'member', member: m });
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Members ({total})</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={[styles.searchBar, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
        <Ionicons name="search" size={18} color={theme.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search members"
          placeholderTextColor={theme.textTertiary}
          style={[styles.searchInput, { color: theme.textPrimary }]}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => (r.type === 'header' ? `h-${r.title}-${i}` : `m-${r.member.id}`)}
          renderItem={({ item }) =>
            item.type === 'header' ? (
              <Text style={[styles.sectionHeader, { color: theme.textTertiary }]}>{item.title}</Text>
            ) : (
              <MemberRow member={item.member} onPress={() => setMiniUser(item.member.user)} />
            )
          }
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          ListEmptyComponent={<Text style={[styles.empty, { color: theme.textTertiary }]}>No members found.</Text>}
        />
      )}

      <MiniProfile visible={!!miniUser} member={miniUser} onClose={() => setMiniUser(null)} onBlocked={() => load()} />
    </SafeAreaView>
  );
}

function MemberRow({ member, onPress }: { member: RoomMemberCard; onPress: () => void }) {
  const { theme } = useTheme();
  const u = member.user;
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Avatar uri={u.profilePhotoUrl} size={48} online={u.isOnline} />
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
            {u.firstName ?? 'Someone'}
            {u.age != null ? <Text style={[styles.age, { color: theme.textSecondary }]}>{`, ${u.age}`}</Text> : null}
          </Text>
          {u.isVerified ? <Ionicons name="checkmark-circle" size={14} color={theme.info} /> : null}
          {member.role !== 'member' ? (
            <View style={[styles.roleChip, { backgroundColor: theme.brand + '22' }]}>
              <Text style={[styles.roleText, { color: theme.brand }]}>{member.role}</Text>
            </View>
          ) : null}
        </View>
        {u.distanceLabel ? <Text style={[styles.dist, { color: theme.textTertiary }]}>{u.distanceLabel}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: spacing.xxxl, fontFamily: FontFamily.regular, fontSize: 15 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  title: { fontSize: 18, fontFamily: DisplayFont.bold },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 44, borderRadius: 14, paddingHorizontal: spacing.md, borderWidth: StyleSheet.hairlineWidth, marginHorizontal: spacing.xl, marginBottom: spacing.md },
  searchInput: { flex: 1, fontSize: 15, fontFamily: FontFamily.regular },
  sectionHeader: { fontSize: 13, fontFamily: FontFamily.semibold, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { fontSize: 16, fontFamily: FontFamily.semibold, flexShrink: 1 },
  age: { fontSize: 14, fontFamily: FontFamily.regular },
  dist: { fontSize: 12, fontFamily: FontFamily.regular, marginTop: 2 },
  roleChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  roleText: { fontSize: 10, fontFamily: FontFamily.bold, textTransform: 'capitalize' },
});
