import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

/** Thin top banner shown whenever the device is offline. */
export function OfflineBanner() {
  const online = useNetworkStatus();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View style={[styles.banner, { backgroundColor: theme.warning, paddingTop: insets.top + 6 }]}>
      <Text style={styles.text}>Offline — showing cached data</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 6, alignItems: 'center', zIndex: 1000 },
  text: { color: '#000', fontSize: 12, fontWeight: '700' },
});
