import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, DisplayFont } from '../theme';
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
  const online = card.activity?.online ?? card.lastActiveAt?.toLowerCase() === 'online';
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

      <LinearGradient colors={theme.scrim} style={styles.shade} />

      {/* Top-right indicators */}
      <View style={styles.topRight}>
        {!!card.rightNowStatus && (
          <LinearGradient colors={theme.gradientWarm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.iconBadge}>
            <Ionicons name="flame" size={11} color="#fff" />
          </LinearGradient>
        )}
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

      {/* Top-left like/shortlist state + "open to groups" hint */}
      {(card.isLiked || card.isShortlisted || card.groupsAvailable) && (
        <View style={styles.topLeft}>
          {card.isLiked && <Ionicons name="heart" size={14} color={theme.brand} />}
          {card.isShortlisted && <Ionicons name="star" size={14} color={theme.planGold} />}
          {card.groupsAvailable && <Ionicons name="people" size={14} color="#fff" />}
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
  tile: { overflow: 'hidden', borderRadius: 16 },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%' },
  topRight: { position: 'absolute', top: 7, right: 7, flexDirection: 'row', gap: 4 },
  topLeft: { position: 'absolute', top: 7, left: 7, flexDirection: 'row', gap: 4 },
  iconBadge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 8, right: 8, bottom: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  name: { color: '#fff', fontSize: 14, fontFamily: DisplayFont.bold, fontWeight: '700', flexShrink: 1, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 5 },
  tick: { marginLeft: 3 },
  metaRow: { marginTop: 1 },
  meta: { color: '#F2E6DC', fontSize: 11, fontFamily: FontFamily.medium, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  chips: { flexDirection: 'row', gap: 3, marginTop: 5 },
  chip: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, maxWidth: '60%' },
  chipText: { color: '#fff', fontSize: 10, fontFamily: FontFamily.semibold, fontWeight: '600' },
});
