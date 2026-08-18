import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppBottomSheet, BottomSheetScrollView } from './ui/AppBottomSheet';
import { UpgradeModal } from './UpgradeModal';
import { useTheme, FontFamily, DisplayFont, spacing, radius } from '../theme';
import { getProfileOptimizer, ApiError, ProfileOptimizerSuggestion } from '../services/api';
import { labelize } from '../lib/format';

type LockedReason = 'plan_required' | 'opted_out' | null;

/**
 * Platinum AI — Profile Optimizer. Fetches on open (not on profile-screen mount,
 * so it never delays the edit-profile load) and shows the actual backend
 * profileScore/suggestions. A `plan_required` 403 reuses the existing UpgradeModal
 * pattern; any other 403 means Platinum-but-opted-out, which just explains where
 * to enable it instead of a paywall prompt.
 */
export function ProfileOptimizerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<ProfileOptimizerSuggestion[]>([]);
  const [lockedReason, setLockedReason] = useState<LockedReason>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLockedReason(null);
    setErrorMessage(null);
    getProfileOptimizer()
      .then((res) => {
        setScore(res.profileScore);
        setSuggestions(res.suggestions ?? []);
      })
      .catch((e) => {
        const err = e as ApiError;
        if (err.status === 403 && err.code === 'plan_required') {
          setLockedReason('plan_required');
        } else if (err.status === 403) {
          setLockedReason('opted_out');
        } else {
          setErrorMessage(err.message ?? 'Could not load your profile score. Please try again.');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  return (
    <>
      <AppBottomSheet visible={visible} onClose={onClose} snapPoints={['75%']}>
        <BottomSheetScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>✨ Improve Your Profile</Text>

          {loading ? (
            <View style={styles.stateBlock}>
              <ActivityIndicator color={theme.brand} />
              <Text style={[styles.stateText, { color: theme.textSecondary }]}>Analyzing your profile…</Text>
            </View>
          ) : lockedReason === 'plan_required' ? (
            <Pressable
              style={[styles.lockedCard, { backgroundColor: theme.backgroundTertiary }]}
              onPress={() => setUpgradeOpen(true)}
            >
              <Ionicons name="lock-closed" size={22} color={theme.textTertiary} />
              <Text style={[styles.lockedTitle, { color: theme.textPrimary }]}>Unlock Profile Optimizer</Text>
              <Text style={[styles.lockedSub, { color: theme.textSecondary }]}>Available on Platinum</Text>
            </Pressable>
          ) : lockedReason === 'opted_out' ? (
            <View style={[styles.lockedCard, { backgroundColor: theme.backgroundTertiary }]}>
              <Ionicons name="settings-outline" size={22} color={theme.textTertiary} />
              <Text style={[styles.lockedTitle, { color: theme.textPrimary }]}>Profile Optimizer is off</Text>
              <Text style={[styles.lockedSub, { color: theme.textSecondary }]}>
                Enable it in Settings → AI Features to get your score and suggestions.
              </Text>
            </View>
          ) : errorMessage ? (
            <View style={styles.stateBlock}>
              <Text style={[styles.stateText, { color: theme.textSecondary }]}>{errorMessage}</Text>
              <Pressable onPress={load} style={[styles.retryBtn, { borderColor: theme.border }]}>
                <Text style={[styles.retryText, { color: theme.brand }]}>Try again</Text>
              </Pressable>
            </View>
          ) : score !== null ? (
            <>
              <View style={styles.scoreWrap}>
                <Text style={[styles.scoreLabel, { color: theme.textSecondary }]}>Profile Score</Text>
                <Text style={[styles.scoreValue, { color: theme.brand }]}>{score}/100</Text>
              </View>

              {suggestions.length > 0 ? (
                <View style={styles.suggestions}>
                  <Text style={[styles.suggestionsHeading, { color: theme.textSecondary }]}>Suggestions</Text>
                  {suggestions.map((s, i) => (
                    <View key={i} style={[styles.suggestionRow, { borderColor: theme.border }]}>
                      <Ionicons name="sparkles" size={16} color={theme.brand} style={styles.suggestionIcon} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.suggestionSection, { color: theme.textTertiary }]}>
                          {labelize(s.section)}
                        </Text>
                        <Text style={[styles.suggestionText, { color: theme.textPrimary }]}>{s.recommendation}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.stateText, { color: theme.textSecondary, marginTop: spacing.lg }]}>
                  Your profile looks great — no suggestions right now.
                </Text>
              )}

              <Pressable onPress={load} style={[styles.refreshBtn, { borderColor: theme.border }]}>
                <Ionicons name="refresh" size={15} color={theme.brand} />
                <Text style={[styles.retryText, { color: theme.brand }]}>Refresh</Text>
              </Pressable>
            </>
          ) : null}
        </BottomSheetScrollView>
      </AppBottomSheet>

      <UpgradeModal
        visible={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Unlock Profile Optimizer"
        message="Get an AI-scored profile with actionable suggestions on Platinum."
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 20, fontFamily: DisplayFont.bold, marginBottom: spacing.lg },
  stateBlock: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  stateText: { fontSize: 14, fontFamily: FontFamily.regular, textAlign: 'center' },
  lockedCard: { borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', gap: 6 },
  lockedTitle: { fontSize: 16, fontFamily: FontFamily.semibold, marginTop: 4 },
  lockedSub: { fontSize: 13, fontFamily: FontFamily.regular, textAlign: 'center' },
  scoreWrap: { alignItems: 'center', paddingVertical: spacing.lg },
  scoreLabel: { fontSize: 13, fontFamily: FontFamily.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  scoreValue: { fontSize: 40, fontFamily: DisplayFont.bold, marginTop: 4 },
  suggestions: { marginTop: spacing.md, gap: spacing.sm },
  suggestionsHeading: { fontSize: 13, fontFamily: FontFamily.semibold, marginBottom: 4 },
  suggestionRow: { flexDirection: 'row', gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.md },
  suggestionIcon: { marginTop: 2 },
  suggestionSection: { fontSize: 11, fontFamily: FontFamily.semibold, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  suggestionText: { fontSize: 14, fontFamily: FontFamily.regular, lineHeight: 20 },
  retryBtn: { marginTop: spacing.md, alignSelf: 'center', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xl, alignSelf: 'center', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  retryText: { fontSize: 14, fontFamily: FontFamily.semibold },
});
