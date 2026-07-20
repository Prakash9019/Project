import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ScrollView, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Linking } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, FontSize } from '../../theme';

/** Normalized message shape the panel searches across (both inbox + rooms map to this). */
export interface SearchMessage {
  id: string;
  content: string | null;
  createdAt: string;
  /** 'text' | 'photo' | 'image' | 'voice' | 'video' | ... */
  type: string;
  /** All media URLs on the message (photos/videos). Empty for plain text. */
  mediaUrls: string[];
  senderName: string;
  isDeleted?: boolean;
}

type Tab = 'messages' | 'media' | 'links' | 'documents';
type DateFilter = 'all' | 'today' | 'week' | 'month' | 'pick';

const TABS: { key: Tab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'messages', label: 'Messages', icon: 'chatbubble-outline' },
  { key: 'media', label: 'Media', icon: 'image-outline' },
  { key: 'links', label: 'Links', icon: 'link-outline' },
  { key: 'documents', label: 'Documents', icon: 'document-outline' },
];

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'pick', label: 'Pick date' },
];

const URL_RE = /(https?:\/\/[^\s]+)/i;

function isVideoUrl(url: string): boolean {
  return /\.mp4($|\?)/i.test(url) || url.includes('/video-clips/');
}

function extractUrl(content: string | null): string | null {
  if (!content) return null;
  const m = content.match(URL_RE);
  return m ? m[0] : null;
}

function domainOf(url: string): string {
  try {
    return url.replace(/^https?:\/\//i, '').split('/')[0];
  } catch {
    return url;
  }
}

/**
 * Full search results panel (tabs + date filter). The parent shows this while
 * the search bar is open; it owns tab/date state internally and calls back for
 * navigation. Messages tab jumps to a bubble; Media opens the viewer; Links and
 * Documents open externally.
 */
export function SearchPanel({
  query,
  messages,
  onJumpToMessage,
  onOpenMedia,
}: {
  query: string;
  messages: SearchMessage[];
  onJumpToMessage: (id: string) => void;
  onOpenMedia: (url: string) => void;
}) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>('messages');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [pickedDate, setPickedDate] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const matchesDate = useMemo(() => {
    const now = new Date();
    return (iso: string): boolean => {
      if (dateFilter === 'all') return true;
      const d = new Date(iso);
      if (dateFilter === 'today') return d.toDateString() === now.toDateString();
      if (dateFilter === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return d >= weekAgo;
      }
      if (dateFilter === 'month') {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }
      if (dateFilter === 'pick' && pickedDate) return d.toDateString() === pickedDate.toDateString();
      return true;
    };
  }, [dateFilter, pickedDate]);

  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    const live = messages.filter((m) => !m.isDeleted && matchesDate(m.createdAt));
    switch (tab) {
      case 'messages':
        if (!q) return [];
        return live.filter((m) => m.content?.toLowerCase().includes(q));
      case 'media':
        return live.filter((m) => m.type === 'photo' || m.type === 'image' || m.mediaUrls.some(isVideoUrl));
      case 'links':
        return live.filter((m) => !!extractUrl(m.content));
      case 'documents':
        return live.filter((m) => m.content?.startsWith('📄'));
      default:
        return [];
    }
  }, [messages, tab, q, matchesDate]);

  const mediaUrls = useMemo(() => {
    if (tab !== 'media') return [];
    const out: string[] = [];
    results.forEach((m) => m.mediaUrls.forEach((u) => u && out.push(u)));
    return out;
  }, [results, tab]);

  const onSelectDate = (key: DateFilter) => {
    if (key === 'pick') {
      setPickerOpen(true);
      setDateFilter('pick');
    } else {
      setDateFilter(key);
    }
  };

  return (
    <View style={[styles.panel, { backgroundColor: theme.background }]}>
      {/* Tabs */}
      <View style={[styles.tabRow, { borderBottomColor: theme.border }]}>
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
              <Ionicons name={t.icon} size={16} color={on ? theme.brand : theme.textTertiary} />
              <Text style={[styles.tabLabel, { color: on ? theme.brand : theme.textTertiary }]}>{t.label}</Text>
              {on ? <View style={[styles.tabUnderline, { backgroundColor: theme.brand }]} /> : null}
            </Pressable>
          );
        })}
      </View>

      {/* Date chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
        {DATE_FILTERS.map((f) => {
          const on = dateFilter === f.key;
          const label = f.key === 'pick' && pickedDate && dateFilter === 'pick'
            ? pickedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : f.label;
          return (
            <Pressable
              key={f.key}
              onPress={() => onSelectDate(f.key)}
              style={[styles.chip, { backgroundColor: on ? theme.brand : theme.surfaceElevated }]}
            >
              <Text style={[styles.chipText, { color: on ? theme.textInverse : theme.textSecondary }]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {pickerOpen ? (
        <DateTimePicker
          value={pickedDate ?? new Date()}
          mode="date"
          maximumDate={new Date()}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_e, d) => {
            setPickerOpen(Platform.OS === 'ios');
            if (d) setPickedDate(d);
          }}
        />
      ) : null}

      {/* Results */}
      {tab === 'media' ? (
        <FlatList
          key="media-grid"
          data={mediaUrls}
          keyExtractor={(u, i) => `${u}-${i}`}
          numColumns={3}
          contentContainerStyle={{ padding: 2 }}
          ListEmptyComponent={<EmptyState icon="image-outline" text="No media" />}
          renderItem={({ item }) => (
            <Pressable style={styles.gridCell} onPress={() => onOpenMedia(item)}>
              {isVideoUrl(item) ? (
                <View style={[styles.gridImage, styles.gridVideo, { backgroundColor: theme.backgroundTertiary }]}>
                  <Ionicons name="play-circle" size={28} color={theme.textPrimary} />
                </View>
              ) : (
                <Image source={{ uri: item }} style={styles.gridImage} contentFit="cover" transition={100} cachePolicy="memory-disk" />
              )}
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          key="rows"
          data={results}
          keyExtractor={(m) => m.id}
          ListEmptyComponent={
            <EmptyState
              icon={tab === 'links' ? 'link-outline' : tab === 'documents' ? 'document-outline' : 'search-outline'}
              text={tab === 'messages' && !q ? 'Type to search messages' : 'No results'}
            />
          }
          renderItem={({ item }) => {
            if (tab === 'links') {
              const url = extractUrl(item.content) ?? '';
              return (
                <Pressable style={styles.row} onPress={() => Linking.openURL(url).catch(() => {})}>
                  <View style={[styles.rowIcon, { backgroundColor: theme.brand + '22' }]}>
                    <Ionicons name="link" size={18} color={theme.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={1}>{domainOf(url)}</Text>
                    <Text style={[styles.rowSub, { color: theme.textTertiary }]} numberOfLines={1}>{url}</Text>
                  </View>
                </Pressable>
              );
            }
            if (tab === 'documents') {
              const label = (item.content ?? '').replace(/^📄\s*/, '') || 'Document';
              const url = item.mediaUrls[0];
              return (
                <Pressable style={styles.row} onPress={() => url && Linking.openURL(url).catch(() => {})}>
                  <View style={[styles.rowIcon, { backgroundColor: theme.brand + '22' }]}>
                    <Ionicons name="document-text" size={18} color={theme.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={1}>{label}</Text>
                    <Text style={[styles.rowSub, { color: theme.textTertiary }]}>Tap to open</Text>
                  </View>
                </Pressable>
              );
            }
            // messages
            return (
              <Pressable style={styles.row} onPress={() => onJumpToMessage(item.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: theme.textPrimary }]} numberOfLines={1}>{item.senderName}</Text>
                  <Text style={[styles.rowSub, { color: theme.textSecondary }]} numberOfLines={2}>{item.content}</Text>
                </View>
                <Text style={[styles.rowTime, { color: theme.textTertiary }]}>
                  {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

function EmptyState({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={theme.textTertiary} />
      <Text style={[styles.emptyText, { color: theme.textTertiary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1 },
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 10, flexDirection: 'row' },
  tabLabel: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold },
  tabUnderline: { position: 'absolute', bottom: 0, left: 12, right: 12, height: 2, borderRadius: 2 },
  chipScroll: { flexGrow: 0 },
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  chip: { height: 32, borderRadius: 999, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: FontSize.sm, fontFamily: FontFamily.medium },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
  rowSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, marginTop: 1 },
  rowTime: { fontSize: FontSize.xs, fontFamily: FontFamily.regular },
  gridCell: { flex: 1 / 3, aspectRatio: 1, padding: 2 },
  gridImage: { flex: 1, borderRadius: 6 },
  gridVideo: { alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: FontSize.md, fontFamily: FontFamily.medium },
});
