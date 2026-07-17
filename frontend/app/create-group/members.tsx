import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  FlatList,
  ScrollView,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Avatar } from '../../src/components/Avatar';
import { useTheme, FontFamily, DisplayFont, FontSize, spacing, radius } from '../../src/theme';
import { listConversations, addRoomMembersBulk, listRoomMembers } from '../../src/services/api';
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
  const insets = useSafeAreaInsets();
  const { roomId } = useLocalSearchParams<{ roomId?: string }>();
  const addToExisting = typeof roomId === 'string' && roomId.length > 0;
  const setSelectedStore = useCreateGroupStore((s) => s.setSelected);

  const [contacts, setContacts] = useState<PickedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, PickedUser>>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // In "add to existing room" mode, fetch the current members so people who
      // are already in the group are hidden from the picker — otherwise adding
      // them again just produces a confusing "couldn't be added" result.
      const [res, existingMemberIds] = await Promise.all([
        listConversations('inbox'),
        addToExisting
          ? listRoomMembers(String(roomId), { limit: 100 })
              .then((m) => new Set(m.members.map((x) => x.user.id)))
              .catch(() => new Set<string>())
          : Promise.resolve(new Set<string>()),
      ]);
      // Unique chat partners → picker contacts, minus anyone already in the room.
      const seen = new Set<string>();
      const people: PickedUser[] = [];
      for (const c of res.conversations as ConversationSummary[]) {
        if (!c.peer?.id || seen.has(c.peer.id)) continue;
        if (existingMemberIds.has(c.peer.id)) continue;
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
      setError(true);
      toastApiError(e, 'Could not load your contacts');
    } finally {
      setLoading(false);
    }
  }, [addToExisting, roomId]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedList = useMemo(() => Object.values(selected), [selected]);
  const selectedCount = selectedList.length;

  const toggle = (u: PickedUser) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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

  // ── Animations ──
  // "Next (n)" count bounce whenever the selection changes.
  const countScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (selectedCount === 0) return;
    Animated.sequence([
      Animated.timing(countScale, { toValue: 1.25, duration: 90, useNativeDriver: true }),
      Animated.spring(countScale, { toValue: 1, useNativeDriver: true }),
    ]).start();
  }, [selectedCount, countScale]);

  // Selected strip springs in on the first selection, out when cleared.
  const stripAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(stripAnim, {
      toValue: selectedCount > 0 ? 1 : 0,
      useNativeDriver: true,
      damping: 16,
      stiffness: 180,
    }).start();
  }, [selectedCount, stripAnim]);

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

  const actionVerb = addToExisting ? 'Add' : 'Next';
  const bottomLabel =
    selectedCount === 0
      ? actionVerb
      : addToExisting
        ? `${actionVerb} (${selectedCount})`
        : `${actionVerb} (${selectedCount} ${selectedCount === 1 ? 'person' : 'people'})`;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Add People</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Select people to add to your group</Text>
        </View>
        <Pressable onPress={onNext} disabled={selectedCount === 0 || submitting} hitSlop={8}>
          {submitting ? (
            <ActivityIndicator color={theme.brand} />
          ) : (
            <Animated.Text
              style={[
                styles.nextBtn,
                { color: selectedCount > 0 ? theme.brand : theme.textTertiary, transform: [{ scale: countScale }] },
              ]}
            >
              {actionVerb}{selectedCount ? ` (${selectedCount})` : ''}
            </Animated.Text>
          )}
        </Pressable>
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: theme.inputBackground }]}>
        <Ionicons name="search" size={18} color={theme.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name..."
          placeholderTextColor={theme.textTertiary}
          style={[styles.searchInput, { color: theme.textPrimary }]}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      {/* Selected strip */}
      {selectedCount > 0 ? (
        <Animated.View
          style={{
            opacity: stripAnim,
            transform: [{ translateY: stripAnim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
          }}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {selectedList.map((u) => (
              <Pressable key={u.id} style={styles.stripItem} onPress={() => toggle(u)}>
                <View>
                  <Avatar uri={u.profilePhoto} size={48} />
                  <View style={[styles.stripRemove, { backgroundColor: theme.error, borderColor: theme.background }]}>
                    <Ionicons name="close" size={12} color="#fff" />
                  </View>
                </View>
                <Text style={[styles.stripName, { color: theme.textSecondary }]} numberOfLines={1}>
                  {(u.firstName ?? 'User').slice(0, 6)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}

      {/* Body */}
      {loading ? (
        <View style={styles.listPad}>
          {[0, 1, 2].map((i) => (
            <SkeletonRow key={i} theme={theme} />
          ))}
        </View>
      ) : error ? (
        <View style={styles.stateWrap}>
          <Ionicons name="cloud-offline-outline" size={56} color={theme.textTertiary} />
          <Text style={[styles.stateTitle, { color: theme.textSecondary }]}>Couldn't load contacts</Text>
          <Pressable onPress={load} style={[styles.stateBtn, { backgroundColor: theme.brand }]} hitSlop={8}>
            <Text style={styles.stateBtnText}>Try Again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: spacing.xxxl * 2 }}
          ListHeaderComponent={
            filtered.length > 0 ? (
              <Text style={[styles.listSection, { color: theme.textTertiary }]}>
                YOUR CONTACTS ({filtered.length})
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <ContactRow
              user={item}
              selected={!!selected[item.id]}
              theme={theme}
              onPress={() => toggle(item)}
            />
          )}
          ListEmptyComponent={
            addToExisting ? (
              <View style={styles.stateWrap}>
                <Ionicons name="checkmark-circle-outline" size={56} color={theme.success} />
                <Text style={[styles.stateTitle, { color: theme.textSecondary }]}>Everyone's already here</Text>
                <Text style={[styles.stateSub, { color: theme.textTertiary }]}>
                  Everyone you chat with is already in this group
                </Text>
              </View>
            ) : (
              <View style={styles.stateWrap}>
                <Ionicons name="people-outline" size={56} color={theme.textTertiary} />
                <Text style={[styles.stateTitle, { color: theme.textSecondary }]}>No contacts yet</Text>
                <Text style={[styles.stateSub, { color: theme.textTertiary }]}>
                  Start chatting with people to add them to groups
                </Text>
                <Pressable onPress={() => router.push('/(tabs)' as Href)} style={[styles.stateBtn, { backgroundColor: theme.brand }]} hitSlop={8}>
                  <Text style={styles.stateBtnText}>Go to Browse</Text>
                </Pressable>
              </View>
            )
          }
        />
      )}

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12, backgroundColor: theme.background, borderTopColor: theme.border }]}>
        <Pressable onPress={onNext} disabled={selectedCount === 0 || submitting}>
          <LinearGradient
            colors={selectedCount > 0 ? theme.gradientWarm : [theme.surfaceElevated, theme.surfaceElevated]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bottomCta}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.bottomCtaText, { color: selectedCount > 0 ? '#fff' : theme.textTertiary }]}>
                {bottomLabel} {selectedCount > 0 ? '→' : ''}
              </Text>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/** A single contact row — 64px tall, status line + animated checkbox. */
function ContactRow({
  user,
  selected,
  theme,
  onPress,
}: {
  user: PickedUser;
  selected: boolean;
  theme: ReturnType<typeof useTheme>['theme'];
  onPress: () => void;
}) {
  // Everyone in this picker is a chat partner, so the two live states are
  // "can be added" (open to groups) and "will receive invite" (not open yet).
  const canAdd = user.groupsAvailable;
  const statusColor = canAdd ? theme.online : theme.warning;
  const statusText = canAdd ? 'Can be added' : 'Will receive invite';

  const scale = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    if (selected) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.2, duration: 100, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.timing(scale, { toValue: 0, duration: 120, useNativeDriver: true }).start();
    }
  }, [selected, scale]);

  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Avatar uri={user.profilePhoto} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
          {user.firstName ?? 'User'}
          {user.age != null ? <Text style={[styles.age, { color: theme.textSecondary }]}>{`, ${user.age}`}</Text> : null}
        </Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
        </View>
      </View>
      <View
        style={[
          styles.check,
          selected ? { backgroundColor: theme.brand, borderColor: theme.brand } : { borderColor: theme.border },
        ]}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name="checkmark" size={15} color="#fff" />
        </Animated.View>
      </View>
    </Pressable>
  );
}

/** Shimmer placeholder row shown while contacts load. */
function SkeletonRow({ theme }: { theme: ReturnType<typeof useTheme>['theme'] }) {
  const shimmer = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);
  return (
    <Animated.View style={[styles.row, { opacity: shimmer }]}>
      <View style={[styles.skelCircle, { backgroundColor: theme.surfaceElevated }]} />
      <View style={{ flex: 1, gap: 8 }}>
        <View style={[styles.skelLine, { backgroundColor: theme.surfaceElevated, width: '45%' }]} />
        <View style={[styles.skelLine, { backgroundColor: theme.surfaceElevated, width: '30%' }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerCenter: { flex: 1 },
  title: { fontSize: FontSize.lg, fontFamily: DisplayFont.bold },
  subtitle: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 1 },
  nextBtn: { fontSize: FontSize.md, fontFamily: FontFamily.bold, minWidth: 40, textAlign: 'right' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.xl,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: FontSize.md, fontFamily: FontFamily.regular },

  strip: { gap: spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  stripItem: { alignItems: 'center', width: 52, gap: 4 },
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
  stripName: { fontSize: FontSize.xs, fontFamily: FontFamily.regular, maxWidth: 52 },

  listPad: { paddingTop: spacing.sm },
  listSection: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: 64,
  },
  name: { fontSize: 15, fontFamily: FontFamily.semibold, flexShrink: 1 },
  age: { fontSize: FontSize.sm, fontFamily: FontFamily.regular },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: FontSize.xs, fontFamily: FontFamily.regular },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  skelCircle: { width: 44, height: 44, borderRadius: 22 },
  skelLine: { height: 12, borderRadius: 6 },

  stateWrap: { alignItems: 'center', marginTop: spacing.xxxl * 1.5, gap: spacing.sm, paddingHorizontal: spacing.xl },
  stateTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.semibold, textAlign: 'center' },
  stateSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, textAlign: 'center' },
  stateBtn: { marginTop: spacing.md, height: 44, borderRadius: radius.pill, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  stateBtnText: { fontSize: FontSize.md, fontFamily: DisplayFont.bold, color: '#fff' },

  bottomBar: {
    paddingHorizontal: spacing.xl,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bottomCta: { height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  bottomCtaText: { fontSize: FontSize.md, fontFamily: DisplayFont.bold },
});
