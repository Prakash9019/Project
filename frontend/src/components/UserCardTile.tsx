import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { planBadgeColor, labelize } from '../lib/format';
import type { UserCard } from '../types/api';

/**
 * Discovery grid tile bound to the spec's UserCard. Shows every card field:
 * photo, name/age, distance, lastActive, verified tick, plan badge, boosted
 * bolt, body type / tribes chips, and like/shortlist state.
 * Memoized for FlatList performance.
 */
function UserCardTileBase({
  card,
  size,
  onPress,
  onLongPress,
}: {
  card: UserCard;
  size: number;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { theme } = useTheme();
  const badge = planBadgeColor(theme, card.planBadge);
  const online = card.lastActiveAt?.toLowerCase() === 'online';
  const chips = [card.bodyType ? labelize(card.bodyType) : null, ...card.tribes.slice(0, 2)]
    .filter(Boolean)
    .slice(0, 2) as string[];

  return (
    <Pressable
      style={[styles.tile, { width: size, height: size, backgroundColor: theme.backgroundTertiary }]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {card.profilePhoto ? (
        <Image
          source={{ uri: card.profilePhoto }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={120}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noPhoto, { backgroundColor: theme.backgroundTertiary }]}>
          <Ionicons name="person" size={size * 0.3} color={theme.textTertiary} />
        </View>
      )}

      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.shade} />

      {/* Top-right indicators */}
      <View style={styles.topRight}>
        {card.boosted && (
          <View style={[styles.iconBadge, { backgroundColor: theme.online }]}>
            <Ionicons name="flash" size={11} color="#000" />
          </View>
        )}
        {badge && (
          <View style={[styles.iconBadge, { backgroundColor: badge }]}>
            <Ionicons name="diamond" size={10} color="#000" />
          </View>
        )}
      </View>

      {/* Top-left like/shortlist state */}
      {(card.isLiked || card.isShortlisted) && (
        <View style={styles.topLeft}>
          {card.isLiked && <Ionicons name="heart" size={14} color={theme.brand} />}
          {card.isShortlisted && <Ionicons name="star" size={14} color={theme.planGold} />}
        </View>
      )}

      <View style={styles.bottom}>
        <View style={styles.nameRow}>
          {online && <View style={[styles.dot, { backgroundColor: theme.online }]} />}
          <Text numberOfLines={1} style={styles.name}>
            {card.firstName ?? 'Someone'}
            {card.age ? `, ${card.age}` : ''}
          </Text>
          {card.isVerified && <Ionicons name="checkmark-circle" size={13} color={theme.info} style={styles.tick} />}
        </View>
        <View style={styles.metaRow}>
          <Text numberOfLines={1} style={styles.meta}>
            {card.distance}
            {!online && card.lastActiveAt ? ` · ${card.lastActiveAt}` : ''}
          </Text>
        </View>
        {chips.length > 0 && (
          <View style={styles.chips}>
            {chips.map((c) => (
              <View key={c} style={styles.chip}>
                <Text numberOfLines={1} style={styles.chipText}>
                  {c}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

export const UserCardTile = React.memo(UserCardTileBase);

const styles = StyleSheet.create({
  tile: { overflow: 'hidden' },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  topRight: { position: 'absolute', top: 6, right: 6, flexDirection: 'row', gap: 4 },
  topLeft: { position: 'absolute', top: 6, left: 6, flexDirection: 'row', gap: 4 },
  iconBadge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 6, right: 6, bottom: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  name: { color: '#fff', fontSize: 13, fontWeight: '700', flexShrink: 1, textShadowColor: '#000', textShadowRadius: 4 },
  tick: { marginLeft: 3 },
  metaRow: { marginTop: 1 },
  meta: { color: '#E0E0E0', fontSize: 10, textShadowColor: '#000', textShadowRadius: 3 },
  chips: { flexDirection: 'row', gap: 3, marginTop: 4 },
  chip: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, maxWidth: '60%' },
  chipText: { color: '#fff', fontSize: 9, fontWeight: '600' },
});
