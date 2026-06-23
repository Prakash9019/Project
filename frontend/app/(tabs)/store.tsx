import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, DisplayFont } from '../../src/theme';
import { useAuthStore } from '../../src/store/authStore';
import { PLANS, BILLING_CYCLES, ADD_ONS } from '../../src/lib/plans';
import { planBadgeColor, planRank } from '../../src/lib/format';
import {
  createSubscription,
  verifySubscription,
  createAddOnOrder,
  verifyAddOnPurchase,
  ApiError,
} from '../../src/services/api';
import {
  openRazorpayCheckout,
  isPaymentsAvailable,
  RAZORPAY_KEY_ID,
} from '../../src/services/payments';
import type { BillingCycle, Plan, AddOnType } from '../../src/types/api';

export default function Store() {
  const { theme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const setUser = useAuthStore((s) => s.setUser);
  const currentPlan: Plan = user?.plan ?? 'free';

  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [busy, setBusy] = useState<string | null>(null);

  const ensurePayments = (): boolean => {
    if (!isPaymentsAvailable) {
      Alert.alert('Payments unavailable', 'Checkout is only available in the mobile app.');
      return false;
    }
    return true;
  };

  const upgrade = async (plan: Exclude<Plan, 'free'>) => {
    if (!ensurePayments() || busy) return;
    setBusy(plan);
    try {
      const order = await createSubscription({ plan, billingCycle: cycle, paymentProvider: 'razorpay' });
      const pay = await openRazorpayCheckout({
        key: order.key ?? RAZORPAY_KEY_ID,
        amount: order.amount,
        orderId: order.orderId,
        currency: order.currency,
        name: 'NearMe',
        description: `${plan} · ${cycle}`,
        prefillContact: undefined,
      });
      const res = await verifySubscription({
        orderId: pay.razorpay_order_id,
        paymentId: pay.razorpay_payment_id,
        signature: pay.razorpay_signature,
      });
      if (user) setUser({ ...user, plan: res.plan as Plan, planExpiresAt: res.planExpiresAt });
      else refreshUser();
      Alert.alert('Welcome to ' + plan, 'Your plan is now active.');
    } catch (e) {
      const err = e as ApiError;
      // Razorpay cancel throws a non-API error; only surface real failures.
      if (err.status) Alert.alert('Payment failed', err.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const buyAddOn = async (addOnType: AddOnType) => {
    if (!ensurePayments() || busy) return;
    setBusy(addOnType);
    try {
      const order = await createAddOnOrder(addOnType);
      const pay = await openRazorpayCheckout({
        key: order.key ?? RAZORPAY_KEY_ID,
        amount: order.amount,
        orderId: order.orderId,
        currency: order.currency,
        name: 'NearMe',
        description: addOnType,
      });
      await verifyAddOnPurchase({
        orderId: pay.razorpay_order_id,
        paymentId: pay.razorpay_payment_id,
        signature: pay.razorpay_signature,
        addonType: addOnType,
      });
      refreshUser();
      Alert.alert('Purchased', 'Your add-on is active.');
    } catch (e) {
      const err = e as ApiError;
      if (err.status) Alert.alert('Purchase failed', err.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.head}>
        <Text style={[styles.brand, { color: theme.textPrimary }]}>NearMe Plus</Text>
        <Text style={[styles.headSub, { color: theme.textSecondary }]}>Unlock unlimited connections</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
        {/* Billing cycle tabs */}
        <View style={[styles.cycleTabs, { backgroundColor: theme.surfaceElevated }]}>
          {BILLING_CYCLES.map((c) => {
            const on = cycle === c.value;
            return (
              <Pressable key={c.value} style={styles.cycleTab} onPress={() => setCycle(c.value)}>
                {on ? (
                  <LinearGradient
                    colors={theme.gradientWarm}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cycleFill}
                  >
                    <Text style={[styles.cycleText, { color: '#fff' }]}>{c.label}</Text>
                  </LinearGradient>
                ) : (
                  <Text style={[styles.cycleText, { color: theme.textSecondary }]}>{c.label}</Text>
                )}
              </Pressable>
            );
          })}
        </View>

        {PLANS.map((p) => {
          const isCurrent = p.plan === currentPlan;
          const badge = planBadgeColor(theme, p.plan);
          const canUpgrade = p.plan !== 'free' && planRank(p.plan) > planRank(currentPlan);
          return (
            <View
              key={p.plan}
              style={[
                styles.planCard,
                { backgroundColor: theme.surface, borderColor: isCurrent ? theme.brand : 'transparent' },
              ]}
            >
              <View style={styles.planHead}>
                <View style={styles.planTitleRow}>
                  {badge && <View style={[styles.dot, { backgroundColor: badge }]} />}
                  <Text style={[styles.planName, { color: theme.textPrimary }]}>{p.name}</Text>
                  {isCurrent && (
                    <View style={[styles.currentTag, { backgroundColor: theme.brand }]}>
                      <Text style={[styles.currentText, { color: theme.textInverse }]}>Current</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.price, { color: theme.textPrimary }]}>
                  {p.priceInr[cycle] === 0 ? 'Free' : `₹${p.priceInr[cycle].toLocaleString('en-IN')}`}
                </Text>
              </View>
              {p.perks.map((perk) => (
                <View key={perk} style={styles.perkRow}>
                  <Ionicons name="checkmark-circle" size={16} color={theme.success} />
                  <Text style={[styles.perk, { color: theme.textSecondary }]}>{perk}</Text>
                </View>
              ))}
              {canUpgrade && (
                <Pressable
                  onPress={() => upgrade(p.plan as Exclude<Plan, 'free'>)}
                  disabled={busy != null}
                  style={styles.upgradeWrap}
                >
                  <LinearGradient
                    colors={theme.gradientWarm}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.upgradeBtn}
                  >
                    {busy === p.plan ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={[styles.upgradeText, { color: '#fff' }]}>Upgrade to {p.name}</Text>
                    )}
                  </LinearGradient>
                </Pressable>
              )}
            </View>
          );
        })}

        <Text style={[styles.section, { color: theme.textTertiary }]}>ADD-ONS</Text>
        {ADD_ONS.map((a) => (
          <View key={a.id} style={[styles.addOn, { backgroundColor: theme.surface }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.addOnTitle, { color: theme.textPrimary }]}>
                {a.id.replace(/_/g, ' ')} <Text style={{ color: theme.textTertiary }}>· {a.meta}</Text>
              </Text>
              <Text style={[styles.addOnDesc, { color: theme.textSecondary }]}>{a.description}</Text>
            </View>
            <Pressable onPress={() => buyAddOn(a.id)} disabled={busy != null}>
              <LinearGradient
                colors={theme.gradientWarm}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.buyBtn}
              >
                {busy === a.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.buyText, { color: '#fff' }]}>₹{a.priceInr}</Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  brand: { fontSize: 28, fontFamily: DisplayFont.heavy, fontWeight: '800' },
  headSub: { fontSize: 14, fontFamily: FontFamily.regular, marginTop: 2 },
  cycleTabs: { flexDirection: 'row', borderRadius: 12, padding: 4 },
  cycleTab: { flex: 1, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cycleFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  cycleText: { fontSize: 13, fontFamily: DisplayFont.semibold, fontWeight: '600' },
  planCard: { borderRadius: 18, padding: 16, borderWidth: 2 },
  planHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  planName: { fontSize: 18, fontFamily: DisplayFont.heavy, fontWeight: '800' },
  currentTag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  currentText: { fontSize: 11, fontFamily: FontFamily.bold, fontWeight: '700' },
  price: { fontSize: 18, fontFamily: DisplayFont.heavy, fontWeight: '800' },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  perk: { fontSize: 14, fontFamily: FontFamily.regular, flex: 1 },
  upgradeWrap: { marginTop: 14, borderRadius: 999 },
  upgradeBtn: { height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  upgradeText: { fontSize: 15, fontFamily: DisplayFont.bold, fontWeight: '700' },
  section: { fontSize: 12, fontFamily: DisplayFont.bold, fontWeight: '700', letterSpacing: 0.8, marginTop: 12 },
  addOn: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14 },
  addOnTitle: { fontSize: 15, fontFamily: DisplayFont.semibold, fontWeight: '700', textTransform: 'capitalize' },
  addOnDesc: { fontSize: 13, fontFamily: FontFamily.regular, marginTop: 2 },
  buyBtn: { minWidth: 64, height: 38, borderRadius: 999, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  buyText: { fontSize: 14, fontFamily: DisplayFont.bold, fontWeight: '700' },
});
