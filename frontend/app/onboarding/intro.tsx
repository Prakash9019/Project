import { useState, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions, FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme';
import { T } from '../../src/components/ui';
import { NearMeLogo } from '../../src/components/icons';

const SLIDES = [
  {
    icon: 'location',
    title: 'Real People,\nRight Nearby',
    body: 'See who is around you in real time. No swipes, no waiting for a match — just open a chat with anyone nearby.',
  },
  {
    icon: 'chatbubbles',
    title: 'Message\nInstantly',
    body: 'Tap a profile and start talking right away. Calls unlock the moment they reply, so conversations stay real and consensual.',
  },
  {
    icon: 'shield-checkmark',
    title: 'Safety\nBuilt In',
    body: 'Verified profiles, fuzzy distance, instant block, and call gating keep you in control of every interaction.',
  },
  {
    icon: 'sparkles',
    title: 'Find Your\nKind of People',
    body: 'Filter by what matters to you and discover people who want to meet — wherever you are.',
  },
] as const;

export default function Intro() {
  const router = useRouter();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const ref = useRef<FlatList>(null);

  const go = () => router.replace('/onboarding/phone');
  const next = () => {
    if (index < SLIDES.length - 1) ref.current?.scrollToIndex({ index: index + 1 });
    else go();
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.topBar}>
        <NearMeLogo size={28} color={theme.brand} />
        <Pressable onPress={go} hitSlop={12}>
          <T style={[styles.skip, { color: theme.textSecondary }]}>Skip</T>
        </Pressable>
      </View>

      <FlatList
        ref={ref}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={[styles.iconBubble, { backgroundColor: theme.surfaceElevated }]}>
              <Ionicons name={item.icon as any} size={52} color={theme.brand} />
            </View>
            <T style={[styles.title, { color: theme.textPrimary }]}>{item.title}</T>
            <T style={[styles.body, { color: theme.textSecondary }]}>{item.body}</T>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: theme.border },
              i === index && { backgroundColor: theme.brand, width: 22 },
            ]}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={next}
          style={({ pressed }) => [styles.primary, { backgroundColor: theme.brand, opacity: pressed ? 0.85 : 1 }]}
        >
          <T style={[styles.primaryText, { color: theme.textInverse }]}>
            {index === SLIDES.length - 1 ? 'Get Started' : 'Continue'}
          </T>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  skip: { fontSize: 15, fontWeight: '600' },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 20 },
  iconBubble: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center', lineHeight: 36 },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  footer: { padding: 20 },
  primary: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 17, fontWeight: '700' },
});
