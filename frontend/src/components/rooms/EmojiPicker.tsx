import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily } from '../../theme';

type EmojiItem = { e: string; k: string };

const CATEGORIES: { id: string; icon: string; emojis: EmojiItem[] }[] = [
  {
    id: 'smileys',
    icon: '😀',
    emojis: [
      { e: '😀', k: 'grin happy' }, { e: '😁', k: 'grin' }, { e: '😂', k: 'laugh cry joy' },
      { e: '🤣', k: 'rofl laugh' }, { e: '😊', k: 'smile blush' }, { e: '😍', k: 'love heart eyes' },
      { e: '😘', k: 'kiss' }, { e: '😜', k: 'wink tongue' }, { e: '🤔', k: 'think' },
      { e: '😐', k: 'neutral' }, { e: '😴', k: 'sleep' }, { e: '😢', k: 'sad cry' },
      { e: '😭', k: 'sob cry' }, { e: '😡', k: 'angry mad' }, { e: '🥳', k: 'party celebrate' },
      { e: '😎', k: 'cool sunglasses' }, { e: '🤗', k: 'hug' }, { e: '😇', k: 'angel' },
      { e: '🙃', k: 'upside' }, { e: '😅', k: 'sweat laugh' }, { e: '🥰', k: 'love smile' },
      { e: '😳', k: 'flushed' }, { e: '🤩', k: 'star struck' }, { e: '😏', k: 'smirk' },
    ],
  },
  {
    id: 'gestures',
    icon: '👍',
    emojis: [
      { e: '👍', k: 'thumbs up like' }, { e: '👎', k: 'thumbs down' }, { e: '👏', k: 'clap' },
      { e: '🙌', k: 'raise hands' }, { e: '🙏', k: 'pray thanks' }, { e: '🤝', k: 'handshake' },
      { e: '✌️', k: 'peace' }, { e: '🤞', k: 'fingers crossed' }, { e: '👌', k: 'ok' },
      { e: '🤙', k: 'call' }, { e: '💪', k: 'strong muscle' }, { e: '👋', k: 'wave hi' },
      { e: '🤟', k: 'love you' }, { e: '✋', k: 'stop hand' }, { e: '🫶', k: 'heart hands' },
      { e: '👊', k: 'fist bump' }, { e: '🤚', k: 'hand' }, { e: '☝️', k: 'point up' },
    ],
  },
  {
    id: 'hearts',
    icon: '❤️',
    emojis: [
      { e: '❤️', k: 'heart love red' }, { e: '🧡', k: 'orange heart' }, { e: '💛', k: 'yellow heart' },
      { e: '💚', k: 'green heart' }, { e: '💙', k: 'blue heart' }, { e: '💜', k: 'purple heart' },
      { e: '🖤', k: 'black heart' }, { e: '🤍', k: 'white heart' }, { e: '💕', k: 'hearts love' },
      { e: '💞', k: 'hearts' }, { e: '💓', k: 'beating heart' }, { e: '💗', k: 'growing heart' },
      { e: '💖', k: 'sparkle heart' }, { e: '💘', k: 'cupid' }, { e: '💝', k: 'gift heart' },
      { e: '❣️', k: 'heart exclaim' }, { e: '💔', k: 'broken heart' }, { e: '🔥', k: 'fire hot' },
    ],
  },
  {
    id: 'animals',
    icon: '🐶',
    emojis: [
      { e: '🐶', k: 'dog' }, { e: '🐱', k: 'cat' }, { e: '🦊', k: 'fox' }, { e: '🐻', k: 'bear' },
      { e: '🐼', k: 'panda' }, { e: '🐨', k: 'koala' }, { e: '🦁', k: 'lion' }, { e: '🐯', k: 'tiger' },
      { e: '🦄', k: 'unicorn' }, { e: '🐷', k: 'pig' }, { e: '🐸', k: 'frog' }, { e: '🐵', k: 'monkey' },
      { e: '🐔', k: 'chicken' }, { e: '🦋', k: 'butterfly' }, { e: '🐢', k: 'turtle' }, { e: '🐝', k: 'bee' },
    ],
  },
  {
    id: 'food',
    icon: '🍕',
    emojis: [
      { e: '🍕', k: 'pizza' }, { e: '🍔', k: 'burger' }, { e: '🍟', k: 'fries' }, { e: '🌮', k: 'taco' },
      { e: '🍣', k: 'sushi' }, { e: '🍦', k: 'ice cream' }, { e: '🍩', k: 'donut' }, { e: '🍪', k: 'cookie' },
      { e: '🎂', k: 'cake birthday' }, { e: '☕', k: 'coffee' }, { e: '🍺', k: 'beer' }, { e: '🍷', k: 'wine' },
      { e: '🥂', k: 'cheers champagne' }, { e: '🍎', k: 'apple' }, { e: '🍓', k: 'strawberry' }, { e: '🥑', k: 'avocado' },
    ],
  },
  {
    id: 'activities',
    icon: '⚽',
    emojis: [
      { e: '⚽', k: 'soccer football' }, { e: '🏀', k: 'basketball' }, { e: '🎾', k: 'tennis' },
      { e: '🏆', k: 'trophy win' }, { e: '🎯', k: 'target' }, { e: '🎮', k: 'game' }, { e: '🎸', k: 'guitar music' },
      { e: '🎉', k: 'party tada' }, { e: '🎊', k: 'confetti' }, { e: '✈️', k: 'plane travel' },
      { e: '🚗', k: 'car' }, { e: '🏖️', k: 'beach' }, { e: '🎁', k: 'gift present' }, { e: '💰', k: 'money' },
      { e: '💯', k: 'hundred perfect' }, { e: '⭐', k: 'star' },
    ],
  },
];

const ALL: EmojiItem[] = CATEGORIES.flatMap((c) => c.emojis);
const DEFAULT_RECENT = ['❤️', '😂', '👍', '🔥', '😍', '🙏', '😮', '😢'];

/** Lightweight emoji picker: recent + categories + search grid. No heavy deps. */
export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const { theme } = useTheme();
  const [cat, setCat] = useState(CATEGORIES[0].id);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>(DEFAULT_RECENT);

  const pick = (e: string) => {
    setRecent((prev) => [e, ...prev.filter((x) => x !== e)].slice(0, 8));
    onSelect(e);
  };

  const grid = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) return ALL.filter((it) => it.k.includes(q)).map((it) => it.e);
    return (CATEGORIES.find((c) => c.id === cat) ?? CATEGORIES[0]).emojis.map((it) => it.e);
  }, [query, cat]);

  return (
    <View style={[styles.wrap, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
      <View style={[styles.search, { backgroundColor: theme.surfaceElevated }]}>
        <Ionicons name="search" size={16} color={theme.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search emoji"
          placeholderTextColor={theme.textTertiary}
          style={[styles.searchInput, { color: theme.textPrimary }]}
        />
      </View>

      {!query.trim() && recent.length > 0 ? (
        <>
          <Text style={[styles.label, { color: theme.textTertiary }]}>Recent</Text>
          <View style={styles.recentRow}>
            {recent.map((e) => (
              <Pressable key={e} onPress={() => pick(e)} style={styles.cell} hitSlop={4}>
                <Text style={styles.emoji}>{e}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <FlatList
        data={grid}
        keyExtractor={(e, i) => e + i}
        numColumns={8}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable onPress={() => pick(item)} style={styles.cell} hitSlop={4}>
            <Text style={styles.emoji}>{item}</Text>
          </Pressable>
        )}
        style={{ flex: 1 }}
        ListEmptyComponent={<Text style={[styles.label, { color: theme.textTertiary }]}>No emoji found</Text>}
      />

      {!query.trim() ? (
        <View style={[styles.catBar, { borderTopColor: theme.border }]}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setCat(c.id)}
              style={[styles.catBtn, cat === c.id && { backgroundColor: theme.surfaceElevated }]}
            >
              <Text style={styles.catIcon}>{c.icon}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 280, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, borderRadius: 10, paddingHorizontal: 10, marginHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: FontFamily.regular },
  label: { fontSize: 12, fontFamily: FontFamily.semibold, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 2 },
  recentRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  cell: { width: `${100 / 8}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 26 },
  catBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 4, paddingHorizontal: 6, justifyContent: 'space-around' },
  catBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  catIcon: { fontSize: 20 },
});
