import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { RemoteImage } from './RemoteImage';

/**
 * Reusable profile avatar. Falls back to an Ionicons `person-circle` placeholder
 * when no photo is set. Optionally shows an online dot, a camera affordance, and
 * a loading overlay (during photo upload). All colors come from the theme.
 */
export function Avatar({
  uri,
  size = 40,
  online,
  editable,
  uploading,
  onPress,
}: {
  uri?: string | null;
  size?: number;
  online?: boolean;
  editable?: boolean;
  uploading?: boolean;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const r = size / 2;
  const dot = Math.max(10, Math.round(size * 0.28));

  // Treat null / undefined / empty / whitespace-only as "no photo" so we never
  // hand expo-image an unloadable source (which would render a blank box).
  const photo = typeof uri === 'string' ? uri.trim() : uri;

  const inner = (
    <View style={{ width: size, height: size }}>
      {photo ? (
        <RemoteImage
          source={{ uri: photo }}
          style={{ width: size, height: size, borderRadius: r, backgroundColor: theme.backgroundTertiary }}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View style={[styles.center, { width: size, height: size, borderRadius: r, backgroundColor: theme.backgroundTertiary }]}>
          <Ionicons name="person" size={Math.round(size * 0.58)} color={theme.textTertiary} />
        </View>
      )}

      {online && (
        <View
          style={[
            styles.dot,
            { width: dot, height: dot, borderRadius: dot / 2, backgroundColor: theme.online, borderColor: theme.background },
          ]}
        />
      )}

      {editable && !uploading && (
        <View style={[styles.camera, { backgroundColor: theme.brand, borderColor: theme.background }]}>
          <Ionicons name="camera" size={Math.max(11, Math.round(size * 0.28))} color="#fff" />
        </View>
      )}

      {uploading && (
        <View style={[styles.fill, styles.center, { borderRadius: r, backgroundColor: 'rgba(0,0,0,0.45)' }]}>
          <ActivityIndicator color="#fff" />
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} disabled={uploading} hitSlop={6}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  dot: { position: 'absolute', right: 0, bottom: 0, borderWidth: 2 },
  camera: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
});
