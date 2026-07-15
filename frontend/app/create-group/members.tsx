import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  FlatList,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Avatar } from '../../src/components/Avatar';
import { useTheme, FontFamily, DisplayFont, FontSize, spacing, radius } from '../../src/theme';
import { listConversations, addRoomMembersBulk } from '../../src/services/api';
import { toastApiError, showSuccess } from '../../src/lib/toast';
import { useCreateGroupStore, type PickedUser } from '../../src/store/createGroupStore';
import type { ConversationSummary } from '../../src/types/api';

/**
 * Contact picker for the Create Group flow. Contacts are the people you've
 * chatted with (WhatsApp-style). Two modes:
 *   • no `roomId`  → "Next" hands the selection to /create-group/details.
 *   • with `roomId` → "Add" bulk-adds/invites straight into an existing room.
 */
export default function CreateGroupMembers() {
  const { theme } = useTheme();
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId?: string }>();
  const addToExisting = typeof roomId === 'string' && roomId.length > 0;
  const setSelectedStore = useCreateGroupStore((s) => s.setSelected);

  const [contacts, setContacts] = useState<PickedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, PickedUser>>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listConversations('inbox');
      // Unique chat partners → picker contacts.
      const seen = new Set<string>();
      const people: PickedUser[] = [];
      for (const c of res.conversations as ConversationSummary[]) {
        if (!c.peer?.id || seen.has(c.peer.id)) continue;
        seen.add(c.peer.id);
        people.push({
          id: c.peer.id,
          firstName: c.peer.firstName,
          profilePhoto: c.peer.profilePhoto,
          age: c.peer.age,
          groupsAvailable: c.peer.groupsAvailable ?? false,
        });
      }
      setContacts(people);
    } catch (e) {
      toastApiError(e, 'Could not load your contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedList = useMemo(() => Object.values(selected), [selected]);
  const selectedCount = selectedList.length;

  const toggle = (u: PickedUser) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[u.id]) delete next[u.id];
      else next[u.id] = u;
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => (c.firstName ?? '').toLowerCase().includes(q));
  }, [contacts, query]);

  const onNext = async () => {
    if (selectedCount === 0 || submitting) return;
    if (addToExisting) {
      setSubmitting(true);
      try {
        const res = await addRoomMembersBulk(String(roomId), selectedList.map((u) => u.id));
        const parts: string[] = [];
        if (res.added.length) parts.push(`${res.added.length} added`);
        if (res.invited.length) parts.push(`${res.invited.length} invited`);
        showSuccess(parts.length ? parts.join(' · ') : 'Members updated');
        if (res.skipped.length) {
          setTimeout(() => showSuccess(`${res.skipped.length} couldn't be added`), 400);
        }
        router.back();
      } catch (e) {
        toastApiError(e, 'Could not add members');
      } finally {
        setSubmitting(false);
      }
      return;
    }
    // Create-group flow: stash selection and continue to details.
    setSelectedStore(selectedList);
    router.push('/create-group/details' as Href);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>
          {addToExisting ? 'Add Members' : 'Add Members'}
          {selectedCount ? ` (${selectedCount})` : ''}
        </Text>
        <Pressable onPress={onNext} disabled={selectedCount === 0 || submitting} hitSlop={8}>
          {submitting ? (
            <ActivityIndicator color={theme.brand} />
          ) : (
            <Text
              style={[
                styles.nextBtn,
                { color: selectedCount > 0 ? theme.brand : theme.textTertiary },
              ]}
            >
              {addToExisting ? 'Add' : 'Next'}
            </Text>
          )}
        </Pressable>
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
        <Ionicons name="search" size={18} color={theme.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search contacts"
          placeholderTextColor={theme.textTertiary}
          style={[styles.searchInput, { color: theme.textPrimary }]}
        />
      </View>

      {/* Selected strip */}
      {selectedCount > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
        >
          {selectedList.map((u) => (
            <Pressable key={u.id} style={styles.stripItem} onPress={() => toggle(u)}>
              <View>
                <Avatar uri={u.profilePhoto} size={52} />
                <View style={[styles.stripRemove, { backgroundColor: theme.textSecondary, borderColor: theme.background }]}>
                  <Ionicons name="close" size={12} color={theme.background} />
                </View>
              </View>
              <Text style={[styles.stripName, { color: theme.textSecondary }]} numberOfLines={1}>
                {u.firstName ?? 'User'}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          renderItem={({ item }) => {
            const isSelected = !!selected[item.id];
            return (
              <Pressable style={styles.row} onPress={() => toggle(item)}>
                <Avatar uri={item.profilePhoto} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
                    {item.firstName ?? 'User'}
                    {item.age != null ? (
                      <Text style={[styles.age, { color: theme.textSecondary }]}>{`, ${item.age}`}</Text>
                    ) : null}
                  </Text>
                  {!item.groupsAvailable ? (
                    <Text style={[styles.inviteHint, { color: theme.warning }]}>Will be invited</Text>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.check,
                    isSelected
                      ? { backgroundColor: theme.brand, borderColor: theme.brand }
                      : { borderColor: theme.border },
                  ]}
                >
                  {isSelected ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={56} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>No contacts yet</Text>
              <Text style={[styles.emptySub, { color: theme.textTertiary }]}>
                Start a conversation with someone to add them to a group
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  title: { fontSize: FontSize.lg, fontFamily: DisplayFont.bold, flex: 1, textAlign: 'center' },
  nextBtn: { fontSize: FontSize.md, fontFamily: FontFamily.bold, minWidth: 40, textAlign: 'right' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: FontSize.md, fontFamily: FontFamily.regular },
  strip: { gap: spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  stripItem: { alignItems: 'center', width: 56, gap: 4 },
  stripRemove: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  stripName: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, maxWidth: 56 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  name: { fontSize: FontSize.md, fontFamily: FontFamily.semibold, flexShrink: 1 },
  age: { fontSize: FontSize.sm, fontFamily: FontFamily.regular },
  inviteHint: { fontSize: FontSize.xs, fontFamily: FontFamily.medium, marginTop: 1 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: { alignItems: 'center', marginTop: spacing.xxxl * 1.5, gap: spacing.sm, paddingHorizontal: spacing.xl },
  emptyTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.semibold, textAlign: 'center' },
  emptySub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, textAlign: 'center' },
});
