import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, FontFamily, DisplayFont, spacing } from '../../src/theme';
import { listRoomMessages } from '../../src/services/api';
import { toastApiError } from '../../src/lib/toast';
import type { RoomMessageCard } from '../../src/types/api';

const GAP = 2;

export default function RoomMedia() {
  const { theme } = useTheme();
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { width } = useWindowDimensions();
  const cols = 3;
  const size = (width - GAP * (cols - 1)) / cols;

  const [media, setMedia] = useState<RoomMessageCard[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await listRoomMessages(String(roomId), { limit: 100 });
      setMedia(res.messages.filter((m) => m.type === 'image' && m.mediaUrl && !m.isDeleted));
    } catch (e) {
      toastApiError(e, 'Could not load media');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={theme.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Media</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      ) : (
        <FlashList
          data={media}
          numColumns={cols}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <Image
              source={{ uri: item.mediaUrl ?? undefined }}
              style={{ width: size, height: size, margin: GAP / 2, backgroundColor: theme.surfaceElevated }}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textTertiary }]}>No media shared yet</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  title: { fontSize: 18, fontFamily: DisplayFont.bold },
  empty: { textAlign: 'center', marginTop: spacing.xxxl, fontFamily: FontFamily.regular, fontSize: 15 },
});
