import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, DisplayFont } from '../../theme';
import { planBadgeColor } from '../../lib/format';
import type { UserCard } from '../../types/api';

const SIZE = 48;
const BORDER = 3;

function ProfileMarkerBase({ user, onImageSettled }: { user: UserCard; onImageSettled?: () => void }) {
  const { theme } = useTheme();
  const badgeColor = planBadgeColor(theme, user.planBadge);
  const online = user.isOnline ?? user.activity?.online ?? false;
  const initial = (user.firstName ?? '?').charAt(0).toUpperCase();

  // No photo means nothing to wait on — the letter fallback renders synchronously.
  useEffect(() => {
    if (!user.profilePhoto) onImageSettled?.();
  }, [user.profilePhoto, onImageSettled]);

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.circle,
          { borderColor: theme.surface, backgroundColor: theme.backgroundTertiary },
        ]}
      >
        {user.profilePhoto ? (
          <Image
            source={{ uri: user.profilePhoto }}
            style={styles.photo}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            onLoadEnd={onImageSettled}
          />
        ) : (
          <View style={[styles.photo, styles.initialWrap, { backgroundColor: theme.brand }]}>
            <Text style={styles.initialText}>{initial}</Text>
          </View>
        )}
      </View>

      {badgeColor && (
        <View style={[styles.planDot, { backgroundColor: badgeColor, borderColor: theme.surface }]} />
      )}

      {user.isVerified && (
        <View style={[styles.verifiedBadge, { borderColor: theme.surface }]}>
          <Ionicons name="checkmark-circle" size={12} color={theme.info} />
        </View>
      )}

      {online && <View style={[styles.onlineDot, { backgroundColor: theme.online, borderColor: theme.surface }]} />}
    </View>
  );
}

function areEqual(
  prev: { user: UserCard; onImageSettled?: () => void },
  next: { user: UserCard; onImageSettled?: () => void },
): boolean {
  return (
    prev.user.id === next.user.id &&
    (prev.user.isOnline ?? prev.user.activity?.online) === (next.user.isOnline ?? next.user.activity?.online) &&
    prev.user.profilePhoto === next.user.profilePhoto &&
    prev.user.planBadge === next.user.planBadge &&
    prev.user.isVerified === next.user.isVerified &&
    prev.onImageSettled === next.onImageSettled
  );
}

export const ProfileMarker = React.memo(ProfileMarkerBase, areEqual);

const styles = StyleSheet.create({
  wrap: { width: SIZE + 6, height: SIZE + 6, alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: BORDER,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  photo: { width: '100%', height: '100%' },
  initialWrap: { alignItems: 'center', justifyContent: 'center' },
  initialText: { color: '#fff', fontSize: 18, fontFamily: DisplayFont.bold, fontWeight: '700' },
  planDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
});
