import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme, FontFamily, DisplayFont } from '../../src/theme';
import { CustomAlert } from '../../src/components/CustomAlert';
import { useAlert } from '../../src/hooks/useAlert';
import { useAuthStore } from '../../src/store/authStore';
import { PLANS, BILLING_CYCLES, ADD_ONS, planCycleSavings } from '../../src/lib/plans';
import { planBadgeColor, planRank } from '../../src/lib/format';
import {
  createSubscription,
  verifySubscription,
  createAddOnOrder,
  verifyAddOnPurchase,
  getCurrentSubscription,
  cancelSubscription,
  getActiveAddons,
  ApiError,
  type CurrentSubscription,
  type ActiveAddon,
} from '../../src/services/api';
import { showSuccess, toastApiError } from '../../src/lib/toast';
import {
  openRazorpayCheckout,
  isPaymentsAvailable,
  RAZORPAY_KEY_ID,
} from '../../src/services/payments';
import { setTokens } from '../../src/services/auth';
import type { BillingCycle, Plan, AddOnType } from '../../src/types/api';

type CellValue = boolean | string;
interface CompareRow {
  feature: string;
  free: CellValue;
  premium: CellValue;
  gold: CellValue;
  platinum: CellValue;
}
interface CompareCategory {
  category: string;
  rows: CompareRow[];
}

const COMPARE_MATRIX: CompareCategory[] = [
  {
    category: 'Messaging',
    rows: [
      { feature: 'New chats (people)', free: '20 unique', premium: 'Unlimited', gold: 'Unlimited', platinum: 'Unlimited' },
      { feature: 'Read receipts', free: false, premium: true, gold: true, platinum: true },
      { feature: 'Typing indicator', free: false, premium: true, gold: true, platinum: true },
      { feature: 'Unsend (before read)', free: false, premium: true, gold: true, platinum: true },
      { feature: 'Unsend (after read)', free: false, premium: false, gold: true, platinum: true },
      { feature: 'Edit messages', free: false, premium: false, gold: true, platinum: true },
      { feature: 'Expiring photos', free: false, premium: '10/day', gold: 'Unlimited', platinum: 'Unlimited' },
      { feature: 'Message templates', free: '0', premium: '5', gold: '5', platinum: '10' },
      { feature: 'Pin chats', free: '0', premium: '0', gold: '5', platinum: '10' },
      { feature: 'AI icebreakers', free: false, premium: false, gold: false, platinum: true },
      { feature: 'AI reply suggestions', free: false, premium: false, gold: false, platinum: true },
    ],
  },
  {
    category: 'Calls',
    rows: [
      { feature: 'Audio call', free: '5 min/day', premium: 'Unlimited', gold: 'Unlimited', platinum: 'Unlimited' },
      { feature: 'Video call', free: '2 min/day', premium: 'Unlimited', gold: 'Unlimited', platinum: 'Unlimited' },
      { feature: 'Call history', free: false, premium: true, gold: true, platinum: true },
      { feature: 'Schedule calls', free: false, premium: false, gold: true, platinum: true },
    ],
  },
  {
    category: 'Grid & Discovery',
    rows: [
      { feature: 'Profiles visible', free: '100', premium: '600', gold: 'Unlimited', platinum: 'Unlimited' },
      { feature: 'Search radius', free: '25 km', premium: '25 km', gold: '100 km', platinum: '100 km' },
      { feature: 'Verified filter', free: false, premium: true, gold: true, platinum: true },
      { feature: 'Active last 30min', free: false, premium: true, gold: true, platinum: true },
      { feature: 'Active last 5min', free: false, premium: false, gold: true, platinum: true },
      { feature: 'Recently joined', free: false, premium: false, gold: true, platinum: true },
      { feature: 'High reply rate', free: false, premium: false, gold: true, platinum: true },
      { feature: 'Travel mode', free: false, premium: false, gold: true, platinum: true },
      { feature: 'AI compatibility', free: false, premium: false, gold: false, platinum: true },
      { feature: 'AI Daily Top 10', free: false, premium: false, gold: false, platinum: true },
      { feature: '5x algorithm boost', free: false, premium: false, gold: false, platinum: true },
    ],
  },
  {
    category: 'Privacy',
    rows: [
      { feature: 'Incognito mode', free: false, premium: false, gold: true, platinum: true },
      { feature: 'Hide active status', free: false, premium: false, gold: true, platinum: true },
      { feature: 'Hide last seen', free: false, premium: false, gold: true, platinum: true },
      { feature: 'Hide distance', free: false, premium: false, gold: true, platinum: true },
      { feature: 'Who viewed me', free: false, premium: false, gold: true, platinum: true },
    ],
  },
  {
    category: 'Profile',
    rows: [
      { feature: 'Bio length', free: '150 chars', premium: '400 chars', gold: '600 chars', platinum: '600 chars' },
      { feature: 'Verified badge', free: false, premium: false, gold: '✅ Included', platinum: '✅ Included' },
      { feature: 'Voice intro clip', free: false, premium: '30 sec', gold: '60 sec', platinum: '60 sec' },
      { feature: 'Video intro clip', free: false, premium: '15 sec', gold: '30 sec', platinum: '30 sec' },
      { feature: 'Albums', free: '1 (10 photos)', premium: '3 (30 each)', gold: '5 (50 each)', platinum: 'Unlimited' },
      { feature: 'AI profile optimizer', free: false, premium: false, gold: false, platinum: true },
    ],
  },
];

const COMPARE_PLAN_KEYS: Plan[] = ['free', 'premium', 'gold', 'platinum'];

function CompareCell({ value, theme }: { value: CellValue; theme: ReturnType<typeof useTheme>['theme'] }) {
  if (value === true) return <Ionicons name="checkmark-circle" size={18} color={theme.success} />;
  if (value === false) return <Ionicons name="close-circle" size={18} color={theme.textTertiary} />;
  return (
    <Text style={[styles.compareValueText, { color: theme.textPrimary }]} numberOfLines={2}>
      {value}
    </Text>
  );
}

/** Human label for an active add-on's remaining duration / quantity. */
function addonExpiryLabel(a: ActiveAddon): string {
  if (a.chatSlotsAdded) return `+${a.chatSlotsAdded} interaction slots`;
  if (a.audioMinutesAdded) return `${a.audioMinutesAdded} audio minutes remaining`;
  if (a.videoMinutesAdded) return `${a.videoMinutesAdded} video minutes remaining`;
  if (!a.expiresAt) return 'Permanent';
  const ms = new Date(a.expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const hours = Math.ceil(ms / 3600_000);
  if (hours < 24) return `Expires in ${hours} hour${hours === 1 ? '' : 's'}`;
  return `Expires ${fmtDate(a.expiresAt)}`;
}

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** Human "time left" until an expiry date (e.g. "12 days left", "Expires today"). */
const remainingLabel = (iso: string | null): string => {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const days = Math.ceil(ms / 86400_000);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`;
  const hours = Math.ceil(ms / 3600_000);
  return hours <= 1 ? 'Expires soon' : `${hours} hours left`;
};

export default function Store() {
  const { theme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const setUser = useAuthStore((s) => s.setUser);
  const currentPlan: Plan = user?.plan ?? 'free';
  const { alertConfig, hideAlert, alertSuccess, alertError } = useAlert();

  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [busy, setBusy] = useState<string | null>(null);
  const [sub, setSub] = useState<CurrentSubscription | null>(null);
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeAddons, setActiveAddons] = useState<ActiveAddon[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  // Pull the authoritative active subscription (purchase + expiry dates) whenever
  // the Store comes into focus, so it reflects the latest plan after any purchase.
  const loadSub = useCallback(async () => {
    try {
      const s = await getCurrentSubscription();
      setSub(s.plan && s.plan !== 'free' ? s : null);
    } catch {
      setSub(null);
    }
  }, []);

  const loadActiveAddons = useCallback(async () => {
    try {
      const res = await getActiveAddons();
      setActiveAddons(res.active);
    } catch {
      setActiveAddons([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSub();
      loadActiveAddons();
    }, [loadSub, loadActiveAddons])
  );

  const ensurePayments = (): boolean => {
    if (!isPaymentsAvailable) {
      alertError('Payments unavailable', 'Checkout is only available in the mobile app.');
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
      // Optimistic local update, then reconcile with the server (source of truth)
      // so the active-plan card and entitlements reflect the real persisted state.
      if (user) setUser({ ...user, plan: res.plan as Plan, planExpiresAt: res.planExpiresAt });
      if (res.accessToken && res.refreshToken) {
        await setTokens(res.accessToken, res.refreshToken);
      }
      await refreshUser();
      await loadSub();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      alertSuccess('Welcome to ' + plan, 'Your plan is now active.');
    } catch (e) {
      const err = e as ApiError;
      // Razorpay cancel throws a non-API error; only surface real failures.
      if (err.status) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        alertError('Payment failed', err.message ?? 'Please try again.');
      }
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
      await loadActiveAddons();
      alertSuccess('Purchased', 'Your add-on is active.');
    } catch (e) {
      const err = e as ApiError;
      if (err.status) alertError('Purchase failed', err.message ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const confirmCancel = async () => {
    setCancelling(true);
    try {
      const res = await cancelSubscription();
      setCancelSheetOpen(false);
      await loadSub();
      const planName = PLANS.find((p) => p.plan === currentPlan)?.name ?? currentPlan;
      showSuccess(`Subscription cancelled. You'll have ${planName} until ${fmtDate(res.effectiveAt)}.`);
    } catch (e) {
      toastApiError(e, 'Could not cancel subscription');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.head}>
        <Text style={[styles.brand, { color: theme.textPrimary }]}>NearMe Plus</Text>
        <Text style={[styles.headSub, { color: theme.textSecondary }]}>Unlock unlimited connections</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
        {/* Active subscription summary — shown once a paid plan is live. */}
        {currentPlan !== 'free' && (
          <View style={[styles.activeCard, { backgroundColor: theme.surface, borderColor: theme.brand }]}>
            <View style={styles.activeHead}>
              <View style={styles.planTitleRow}>
                {planBadgeColor(theme, currentPlan) && (
                  <View style={[styles.dot, { backgroundColor: planBadgeColor(theme, currentPlan)! }]} />
                )}
                <Text style={[styles.planName, { color: theme.textPrimary }]}>
                  {PLANS.find((p) => p.plan === currentPlan)?.name ?? currentPlan}
                </Text>
              </View>
              <View style={[styles.activeBadge, { backgroundColor: theme.success }]}>
                <Ionicons name="checkmark-circle" size={14} color="#fff" />
                <Text style={styles.activeBadgeText}>Active</Text>
              </View>
            </View>
            <View style={styles.activeRows}>
              <View style={styles.activeRow}>
                <Text style={[styles.activeLabel, { color: theme.textTertiary }]}>Purchased</Text>
                <Text style={[styles.activeValue, { color: theme.textPrimary }]}>
                  {fmtDate(sub?.startedAt ?? null)}
                </Text>
              </View>
              <View style={styles.activeRow}>
                <Text style={[styles.activeLabel, { color: theme.textTertiary }]}>
                  {sub && !sub.autoRenew ? 'Cancels on' : 'Expires'}
                </Text>
                <Text style={[styles.activeValue, { color: theme.textPrimary }]}>
                  {fmtDate(sub?.expiresAt ?? user?.planExpiresAt ?? null)}
                </Text>
              </View>
            </View>
            <Text style={[styles.activeRemaining, { color: theme.brand }]}>
              {remainingLabel(sub?.expiresAt ?? user?.planExpiresAt ?? null)}
            </Text>
            {sub?.autoRenew && (
              <Pressable
                style={[styles.cancelBtn, { borderColor: theme.error }]}
                onPress={() => setCancelSheetOpen(true)}
              >
                <Text style={[styles.cancelBtnText, { color: theme.error }]}>Cancel Subscription</Text>
              </Pressable>
            )}
          </View>
        )}

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
                    {c.tag && <Text style={styles.cycleTag}>{c.tag}</Text>}
                  </LinearGradient>
                ) : (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={[styles.cycleText, { color: theme.textSecondary }]}>{c.label}</Text>
                    {c.tag && <Text style={[styles.cycleTag, { color: theme.textTertiary }]}>{c.tag}</Text>}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {PLANS.map((p) => {
          const isCurrent = p.plan === currentPlan;
          const badge = planBadgeColor(theme, p.plan);
          const canUpgrade = p.plan !== 'free' && planRank(p.plan) > planRank(currentPlan);
          const savings = planCycleSavings(p, cycle);
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
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.price, { color: theme.textPrimary }]}>
                    {p.priceInr[cycle] === 0 ? 'Free' : `₹${p.priceInr[cycle].toLocaleString('en-IN')}`}
                  </Text>
                  {savings > 0 && (
                    <View style={[styles.savingsBadge, { backgroundColor: theme.success }]}>
                      <Text style={styles.savingsText}>Save {savings}%</Text>
                    </View>
                  )}
                </View>
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

        {/* Compare Plans — expandable feature matrix (PDF §8) */}
        <Pressable
          style={[styles.compareToggle, { backgroundColor: theme.surface }]}
          onPress={() => setCompareOpen((v) => !v)}
        >
          <Text style={[styles.compareToggleText, { color: theme.textPrimary }]}>Compare All Features</Text>
          <Ionicons
            name={compareOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={theme.textSecondary}
          />
        </Pressable>

        {compareOpen && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.compareScroll}>
            <View>
              <View style={[styles.compareHeaderRow, { backgroundColor: theme.surface }]}>
                <Text style={[styles.compareFeatureHeaderCell, { color: theme.textTertiary }]}>Feature</Text>
                {COMPARE_PLAN_KEYS.map((key) => (
                  <View
                    key={key}
                    style={[
                      styles.compareHeaderCell,
                      key === currentPlan && { borderColor: theme.brand, borderWidth: 2, borderRadius: 8 },
                    ]}
                  >
                    <Text style={[styles.compareHeaderText, { color: theme.textPrimary }]}>
                      {PLANS.find((p) => p.plan === key)?.name ?? key}
                    </Text>
                  </View>
                ))}
              </View>

              {COMPARE_MATRIX.map((cat) => (
                <View key={cat.category}>
                  <Text style={[styles.compareCategory, { color: theme.brand }]}>{cat.category}</Text>
                  {cat.rows.map((row, i) => (
                    <View
                      key={row.feature}
                      style={[
                        styles.compareRow,
                        { backgroundColor: i % 2 === 0 ? theme.background : theme.surfaceElevated },
                      ]}
                    >
                      <Text style={[styles.compareFeatureCell, { color: theme.textPrimary }]}>{row.feature}</Text>
                      {COMPARE_PLAN_KEYS.map((key) => (
                        <View key={key} style={styles.compareValueCell}>
                          <CompareCell value={row[key]} theme={theme} />
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Active Add-Ons — persistent confirmation of what's currently active */}
        {activeAddons.length > 0 && (
          <>
            <Text style={[styles.section, { color: theme.textTertiary }]}>ACTIVE ADD-ONS</Text>
            {activeAddons.map((a) => (
              <View key={a.id} style={[styles.addOn, { backgroundColor: theme.surface }]}>
                <Ionicons name="flash" size={20} color={theme.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.addOnTitle, { color: theme.textPrimary }]}>
                    {a.addOnType.replace(/_/g, ' ')}
                  </Text>
                  <Text style={[styles.addOnDesc, { color: theme.textSecondary }]}>
                    {addonExpiryLabel(a)}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}

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

      <Modal
        visible={cancelSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCancelSheetOpen(false)}
      >
        <Pressable
          style={[styles.sheetOverlay, { backgroundColor: theme.overlay }]}
          onPress={() => setCancelSheetOpen(false)}
        >
          <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={() => {}}>
            <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>
              Cancel {PLANS.find((p) => p.plan === currentPlan)?.name ?? currentPlan}?
            </Text>
            <Text style={[styles.sheetBody, { color: theme.textSecondary }]}>
              Your {PLANS.find((p) => p.plan === currentPlan)?.name ?? currentPlan} benefits will continue until{' '}
              {fmtDate(sub?.expiresAt ?? user?.planExpiresAt ?? null)}. After that, your account will return to the
              Free plan.
            </Text>
            <Pressable
              style={[styles.keepBtn, { backgroundColor: theme.surfaceElevated }]}
              onPress={() => setCancelSheetOpen(false)}
              disabled={cancelling}
            >
              <Text style={[styles.keepBtnText, { color: theme.textPrimary }]}>Keep My Plan</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmCancelBtn, { backgroundColor: theme.error }]}
              onPress={confirmCancel}
              disabled={cancelling}
            >
              {cancelling ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmCancelBtnText}>Cancel Anyway</Text>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {alertConfig ? <CustomAlert visible onDismiss={hideAlert} {...alertConfig} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  brand: { fontSize: 28, fontFamily: DisplayFont.heavy, fontWeight: '800' },
  headSub: { fontSize: 14, fontFamily: FontFamily.regular, marginTop: 2 },
  activeCard: { borderRadius: 18, padding: 16, borderWidth: 2 },
  activeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  activeBadgeText: { fontSize: 12, color: '#fff', fontFamily: FontFamily.bold, fontWeight: '700' },
  activeRows: { flexDirection: 'row', gap: 24 },
  activeRow: { gap: 2 },
  activeLabel: { fontSize: 12, fontFamily: FontFamily.regular },
  activeValue: { fontSize: 15, fontFamily: DisplayFont.semibold, fontWeight: '700' },
  activeRemaining: { fontSize: 13, fontFamily: DisplayFont.bold, fontWeight: '700', marginTop: 12 },
  cycleTabs: { flexDirection: 'row', borderRadius: 12, padding: 4 },
  cycleTab: { flex: 1, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cycleFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  cycleText: { fontSize: 13, fontFamily: DisplayFont.semibold, fontWeight: '600' },
  cycleTag: { fontSize: 9, fontFamily: FontFamily.bold, fontWeight: '700', color: '#fff', marginTop: 1 },
  savingsBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  savingsText: { fontSize: 11, fontFamily: FontFamily.bold, fontWeight: '700', color: '#fff' },
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
  cancelBtn: { marginTop: 12, height: 38, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: 13, fontFamily: FontFamily.bold, fontWeight: '700' },
  compareToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, padding: 14, marginTop: 4 },
  compareToggleText: { fontSize: 15, fontFamily: DisplayFont.semibold, fontWeight: '700' },
  compareScroll: { marginTop: -2 },
  compareHeaderRow: { flexDirection: 'row', paddingVertical: 10, borderRadius: 10 },
  compareFeatureHeaderCell: { width: 160, fontSize: 11, fontFamily: FontFamily.bold, fontWeight: '700', paddingHorizontal: 8 },
  compareHeaderCell: { width: 90, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  compareHeaderText: { fontSize: 13, fontFamily: DisplayFont.bold, fontWeight: '700' },
  compareCategory: { fontSize: 11, fontFamily: DisplayFont.semibold, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 8, paddingTop: 12, paddingBottom: 4 },
  compareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  compareFeatureCell: { width: 160, fontSize: 13, fontFamily: FontFamily.regular, paddingHorizontal: 8 },
  compareValueCell: { width: 90, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  compareValueText: { fontSize: 12, fontFamily: FontFamily.semibold, fontWeight: '600', textAlign: 'center' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 20, paddingBottom: 32 },
  sheetTitle: { fontSize: 18, fontFamily: DisplayFont.bold, fontWeight: '700', marginBottom: 8 },
  sheetBody: { fontSize: 14, fontFamily: FontFamily.regular, lineHeight: 20, marginBottom: 20 },
  keepBtn: { height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  keepBtnText: { fontSize: 15, fontFamily: DisplayFont.bold, fontWeight: '700' },
  confirmCancelBtn: { height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  confirmCancelBtnText: { color: '#fff', fontSize: 15, fontFamily: DisplayFont.bold, fontWeight: '700' },
});
