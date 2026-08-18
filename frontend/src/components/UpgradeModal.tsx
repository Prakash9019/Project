import { Modal, View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme';
import { T } from './ui';
import { PLANS } from '../lib/plans';

const PLAN_PERKS: Record<string, string> = {
  premium: 'Unlimited people · 400-char bio',
  gold: 'Incognito · Travel · Who viewed me',
  platinum: 'AI features · 5× boost · everything',
};

const PLAN_ROWS = PLANS.filter((p) => p.plan !== 'free').map((p) => ({
  plan: p.name,
  price: `₹${p.priceInr.monthly}/mo`,
  perk: PLAN_PERKS[p.plan] ?? p.perks.slice(0, 2).join(' · '),
}));

/**
 * Reusable upgrade prompt. Shown on 403 `interaction_limit_reached`,
 * plan-gated filters, and other paywall touch-points.
 */
export function UpgradeModal({
  visible,
  onClose,
  title = 'Upgrade to keep going',
  message,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
}) {
  const { theme } = useTheme();
  const router = useRouter();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: theme.surface }]} onPress={() => {}}>
          <Pressable style={styles.close} onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color={theme.textSecondary} />
          </Pressable>
          <View style={[styles.iconWrap, { backgroundColor: theme.brand + '22' }]}>
            <Ionicons name="lock-open" size={28} color={theme.brand} />
          </View>
          <T style={[styles.title, { color: theme.textPrimary }]}>{title}</T>
          <T style={[styles.message, { color: theme.textSecondary }]}>
            {message ??
              "You've reached the free limit of 20 unique people. Upgrade to message and tap as many people as you like."}
          </T>

          <View style={styles.plans}>
            {PLAN_ROWS.map((p) => (
              <View key={p.plan} style={[styles.planRow, { borderColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <T style={[styles.planName, { color: theme.textPrimary }]}>{p.plan}</T>
                  <T style={[styles.planPerk, { color: theme.textTertiary }]}>{p.perk}</T>
                </View>
                <T style={[styles.planPrice, { color: theme.brand }]}>{p.price}</T>
              </View>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [styles.cta, { backgroundColor: theme.brand, opacity: pressed ? 0.85 : 1 }]}
            onPress={() => {
              onClose();
              router.push('/(tabs)/store');
            }}
          >
            <T style={[styles.ctaText, { color: theme.textInverse }]}>See all plans</T>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', borderRadius: 20, padding: 24, alignItems: 'center' },
  close: { position: 'absolute', top: 14, right: 14, zIndex: 2 },
  iconWrap: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  message: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  plans: { width: '100%', marginTop: 18, gap: 10 },
  planRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 12 },
  planName: { fontSize: 15, fontWeight: '700' },
  planPerk: { fontSize: 12, marginTop: 2 },
  planPrice: { fontSize: 15, fontWeight: '800' },
  cta: { width: '100%', height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  ctaText: { fontSize: 16, fontWeight: '700' },
});
