import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, DisplayFont } from '../../src/theme';

export default function Groups() {
  const { theme } = useTheme();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <Text style={[styles.header, { color: theme.textPrimary }]}>NearMe</Text>
      <View style={styles.center}>
        <Ionicons name="people-outline" size={64} color={theme.textTertiary} />
        <Text style={[styles.title, { color: theme.textPrimary }]}>Groups</Text>
        <Text style={[styles.subtitle, { color: theme.textTertiary }]}>Coming soon</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { fontSize: 26, fontFamily: DisplayFont.bold, fontWeight: '800', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  title: { fontSize: 24, fontFamily: DisplayFont.bold },
  subtitle: { fontSize: 15, fontFamily: FontFamily.regular },
});
