import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { AppBottomSheet, BottomSheetScrollView, BottomSheetTextInput } from '../ui/AppBottomSheet';
import { useTheme, FontFamily, DisplayFont, spacing, radius } from '../../theme';
import { ROOM_SORTS, MEMBER_FLOORS, type RoomSort } from '../../lib/rooms';

export interface DiscoverFilters {
  city: string;
  sort: RoomSort;
  memberFloor: number;
}

export const DEFAULT_DISCOVER_FILTERS: DiscoverFilters = {
  city: '',
  sort: 'trending',
  memberFloor: 0,
};

/** Secondary Discover filters — bottom sheet (City / Sort / Member count). */
export function RoomFilterSheet({
  visible,
  value,
  onClose,
  onApply,
}: {
  visible: boolean;
  value: DiscoverFilters;
  onClose: () => void;
  onApply: (next: DiscoverFilters) => void;
}) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState<DiscoverFilters>(value);

  // Re-seed the draft each time the sheet opens. (The old Modal did this via
  // `onShow`, which AppBottomSheet has no equivalent of.)
  useEffect(() => {
    if (visible) setDraft(value);
    // Only re-seed on open — edits while open must not be clobbered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <AppBottomSheet visible={visible} onClose={onClose} snapPoints={['80%']}>
          <BottomSheetScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Filters</Text>

            {/* City */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>City</Text>
            <View style={[styles.input, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
              <BottomSheetTextInput
                value={draft.city}
                onChangeText={(city: string) => setDraft((d) => ({ ...d, city }))}
                placeholder="Any city"
                placeholderTextColor={theme.textTertiary}
                style={[styles.inputText, { color: theme.textPrimary }]}
              />
            </View>

            {/* Sort */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>Sort by</Text>
            <View style={styles.chipWrap}>
              {ROOM_SORTS.map((s) => {
                const active = draft.sort === s.value;
                return (
                  <Pressable
                    key={s.value}
                    onPress={() => setDraft((d) => ({ ...d, sort: s.value }))}
                    style={[
                      styles.chip,
                      { backgroundColor: active ? theme.brand : theme.surfaceElevated, borderColor: theme.border },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? '#fff' : theme.textSecondary }]}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Member floor */}
            <Text style={[styles.label, { color: theme.textSecondary }]}>Member count</Text>
            <View style={styles.chipWrap}>
              {MEMBER_FLOORS.map((m) => {
                const active = draft.memberFloor === m.value;
                return (
                  <Pressable
                    key={m.value}
                    onPress={() => setDraft((d) => ({ ...d, memberFloor: m.value }))}
                    style={[
                      styles.chip,
                      { backgroundColor: active ? theme.brand : theme.surfaceElevated, borderColor: theme.border },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? '#fff' : theme.textSecondary }]}>{m.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.actions}>
              <Pressable
                onPress={() => setDraft(DEFAULT_DISCOVER_FILTERS)}
                style={[styles.resetBtn, { borderColor: theme.border }]}
              >
                <Text style={[styles.resetText, { color: theme.textSecondary }]}>Reset</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onApply(draft);
                  onClose();
                }}
                style={[styles.applyBtn, { backgroundColor: theme.brand }]}
              >
                <Text style={styles.applyText}>Apply</Text>
              </Pressable>
            </View>
          </BottomSheetScrollView>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  // Sheet chrome (surface, rounded top, grabber, backdrop) is AppBottomSheet's.
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 20, fontFamily: DisplayFont.bold, marginBottom: spacing.lg },
  label: { fontSize: 13, fontFamily: FontFamily.semibold, marginTop: spacing.lg, marginBottom: spacing.sm },
  input: { height: 46, borderRadius: radius.lg, paddingHorizontal: spacing.md, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  inputText: { fontSize: 15, fontFamily: FontFamily.regular },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  chipText: { fontSize: 13, fontFamily: FontFamily.semibold },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xxl },
  resetBtn: { flex: 1, height: 50, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  resetText: { fontSize: 15, fontFamily: FontFamily.semibold },
  applyBtn: { flex: 2, height: 50, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  applyText: { color: '#fff', fontSize: 15, fontFamily: FontFamily.bold },
});
