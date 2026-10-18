import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, FontSize, spacing, radius } from '../../theme';

interface LiveLocationCardProps {
  content: string;
  messageId: string;
  mine: boolean;
  streamedCoords?: { lat: number; lng: number; updatedAt?: string; isEnded?: boolean };
  onStopSharing?: () => void;
  onLongPress?: () => void;
}

export function parseLiveLocation(content: string) {
  // Format: 📍LIVE label|lat|lng|expiresAt|status|optionalComment
  const raw = content.replace(/^📍LIVE\s*/, '');
  const [label, latStr, lngStr, expiresAt, status, comment] = raw.split('|');
  return {
    label: label || 'Live Location',
    lat: Number(latStr) || 0,
    lng: Number(lngStr) || 0,
    expiresAt: expiresAt || '',
    status: (status || 'active') as 'active' | 'ended',
    comment: comment || '',
  };
}

export function isLiveLocationContent(content?: string | null): boolean {
  return typeof content === 'string' && content.startsWith('📍LIVE ') && content.includes('|');
}

export function LiveLocationCard({
  content,
  mine,
  streamedCoords,
  onStopSharing,
  onLongPress,
}: LiveLocationCardProps) {
  const { theme } = useTheme();
  const parsed = parseLiveLocation(content);

  // Use latest streamed coordinates if available, otherwise fallback to message coords
  const currentLat = streamedCoords?.lat ?? parsed.lat;
  const currentLng = streamedCoords?.lng ?? parsed.lng;

  // Determine if still live
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const expireTime = parsed.expiresAt ? new Date(parsed.expiresAt).getTime() : 0;
  const isExpired = expireTime > 0 && expireTime <= now;
  const isLive = parsed.status === 'active' && !streamedCoords?.isEnded && !isExpired;

  const fg = mine ? theme.textInverse : theme.textPrimary;
  const sub = mine ? 'rgba(255,255,255,0.75)' : theme.textTertiary;

  const formatExpiryTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const openInMaps = () => {
    Linking.openURL(`https://maps.google.com/?q=${currentLat},${currentLng}`).catch(() => {});
  };

  return (
    <Pressable
      style={[
        styles.card,
        {
          backgroundColor: mine ? 'rgba(255,255,255,0.12)' : theme.backgroundTertiary,
          borderColor: isLive ? (mine ? 'rgba(255,255,255,0.25)' : '#00D26A40') : theme.border,
        },
      ]}
      onPress={openInMaps}
      onLongPress={onLongPress}
      delayLongPress={220}
    >
      {/* Header row */}
      <View style={styles.topRow}>
        <View style={[styles.iconWrap, { backgroundColor: isLive ? '#00D26A25' : (mine ? 'rgba(255,255,255,0.15)' : theme.surfaceElevated) }]}>
          <Ionicons
            name={isLive ? 'radio' : 'radio-outline'}
            size={22}
            color={isLive ? '#00D26A' : (mine ? '#fff' : theme.textTertiary)}
          />
        </View>
        <View style={styles.headerText}>
          <View style={styles.badgeRow}>
            <Text style={[styles.title, { color: fg }]} numberOfLines={1}>
              {parsed.comment || parsed.label || 'Live Location'}
            </Text>
            {isLive ? (
              <View style={styles.liveIndicator}>
                <View style={styles.greenDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            ) : (
              <View style={[styles.liveIndicator, { backgroundColor: 'rgba(128,128,128,0.2)' }]}>
                <Text style={[styles.liveText, { color: mine ? 'rgba(255,255,255,0.7)' : theme.textTertiary }]}>ENDED</Text>
              </View>
            )}
          </View>
          <Text style={[styles.subText, { color: sub }]} numberOfLines={1}>
            {isLive
              ? `Live until ${formatExpiryTime(parsed.expiresAt)} • Updates in real-time`
              : 'Live location ended'}
          </Text>
        </View>
      </View>

      {/* Coordinates / Map preview footer */}
      <View style={[styles.footerRow, { borderTopColor: mine ? 'rgba(255,255,255,0.15)' : theme.border }]}>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: mine ? 'rgba(255,255,255,0.2)' : theme.surfaceElevated }]}
          onPress={openInMaps}
        >
          <Ionicons name="map-outline" size={15} color={fg} />
          <Text style={[styles.actionBtnText, { color: fg }]}>View on Map</Text>
        </Pressable>

        {mine && isLive && onStopSharing ? (
          <Pressable
            style={[styles.stopBtn, { backgroundColor: '#FF3B3015', borderColor: '#FF3B3050' }]}
            onPress={onStopSharing}
          >
            <Ionicons name="stop-circle-outline" size={15} color="#FF3B30" />
            <Text style={styles.stopBtnText}>Stop Sharing</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    width: 260,
    marginTop: 2,
    marginBottom: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  title: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    flex: 1,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,210,106,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00D26A',
  },
  liveText: {
    fontSize: 10,
    fontFamily: FontFamily.bold,
    color: '#00D26A',
    letterSpacing: 0.5,
  },
  subText: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    marginTop: 2,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  actionBtnText: {
    fontSize: 12,
    fontFamily: FontFamily.semibold,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stopBtnText: {
    fontSize: 12,
    fontFamily: FontFamily.semibold,
    color: '#FF3B30',
  },
});
