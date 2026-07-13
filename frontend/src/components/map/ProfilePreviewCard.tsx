import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme, FontFamily, DisplayFont } from '../../theme';
import { planBadgeColor } from '../../lib/format';
import { startConversation, ApiError } from '../../services/api';
import { showError } from '../../lib/toast';
import type { UserCard } from '../../types/api';

const CARD_HEIGHT = 200;

export function ProfilePreviewCard({
  card,
  onDismiss,
}: {
  card: UserCard;
  onDismiss: () => void;
}) {
  const { theme } = useTheme();
  const router = useRouter();
  const [messaging, setMessaging] = useState(false);
  const slide = useRef(new Animated.Value(CARD_HEIGHT)).current;
  const badgeColor = planBadgeColor(theme, card.planBadge);
  const online = card.isOnline ?? card.activity?.online ?? false;

  useEffect(() => {
    slide.setValue(CARD_HEIGHT);
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, friction: 9, tension: 60 }).start();
  }, [card.id, slide]);

  const message = async () => {
    if (messaging) return;
    setMessaging(true);
    try {
      const conv = await startConversation(card.id);
      router.push({
        pathname: '/chat/[id]',
        params: { id: conv.id, peerName: card.firstName ?? '', peerPhoto: card.profilePhoto ?? '' },
      });
    } catch (e) {
      showError((e as ApiError).message ?? 'Could not start conversation');
    } finally {
      setMessaging(false);
    }
  };

  const openProfile = () => {
    router.push({ pathname: '/profile/[id]', params: { id: card.id } });
  };

  return (
    <>
      <Pressable style={styles.scrim} onPress={onDismiss} />
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: theme.surface, transform: [{ translateY: slide }] },
        ]}
      >
        <View style={styles.photoWrap}>
          {card.profilePhoto ? (
            <Image source={{ uri: card.profilePhoto }} style={styles.photo} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.photo, styles.noPhoto, { backgroundColor: theme.backgroundTertiary }]}>
              <Ionicons name="person" size={24} color={theme.textTertiary} />
            </View>
          )}
        </View>

        <View style={styles.center}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={[styles.name, { color: theme.textPrimary }]}>
              {card.firstName ?? 'Someone'}
              {card.age ? `, ${card.age}` : ''}
            </Text>
            {card.isVerified && <Ionicons name="checkmark-circle" size={15} color={theme.info} style={styles.tick} />}
            {badgeColor && <View style={[styles.planDot, { backgroundColor: badgeColor }]} />}
          </View>

          <Text numberOfLines={1} style={[styles.distance, { color: theme.textSecondary }]}>
            {card.distanceLabel ?? card.distance}
          </Text>

          <View style={styles.statusRow}>
            {online ? (
              <>
                <View style={[styles.onlineDot, { backgroundColor: theme.online }]} />
                <Text style={[styles.statusText, { color: theme.textTertiary }]}>Online now</Text>
              </>
            ) : (
              <Text style={[styles.statusText, { color: theme.textTertiary }]}>{card.lastActiveAt ?? 'Offline'}</Text>
            )}
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={message} disabled={messaging} style={styles.msgBtn}>
            <LinearGradient colors={theme.gradientWarm} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.msgInner}>
              {messaging ? (
                <ActivityIndicator size="small" color={theme.textInverse} />
              ) : (
                <Text style={[styles.msgText, { color: theme.textInverse }]}>Message</Text>
              )}
            </LinearGradient>
          </Pressable>
          <Pressable onPress={openProfile} style={[styles.profileBtn, { borderColor: theme.brand }]}>
            <Text style={[styles.profileText, { color: theme.brand }]}>Profile</Text>
          </Pressable>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    height: CARD_HEIGHT,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  photoWrap: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: 16, fontFamily: DisplayFont.medium, fontWeight: '600', flexShrink: 1 },
  tick: {},
  planDot: { width: 8, height: 8, borderRadius: 4 },
  distance: { fontSize: 13, fontFamily: FontFamily.medium },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  onlineDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontSize: 12, fontFamily: FontFamily.regular },
  actions: { gap: 8, alignItems: 'stretch' },
  msgBtn: { borderRadius: 999, overflow: 'hidden' },
  msgInner: { height: 36, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  msgText: { fontSize: 13, fontFamily: FontFamily.bold, fontWeight: '700' },
  profileBtn: { height: 32, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  profileText: { fontSize: 12, fontFamily: FontFamily.semibold, fontWeight: '600' },
});
