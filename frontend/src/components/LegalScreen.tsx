import React from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, font, radius } from '../theme';
import { T, PillButton } from './ui';

/** Reusable Terms / Privacy style screen: header, scrollable body, sticky Agree CTA. */
export function LegalScreen({
  title,
  sections,
  cta,
  onAgree,
  showBack = true,
}: {
  title: string;
  sections: { heading?: string; body: string }[];
  cta: string;
  onAgree: () => void;
  showBack?: boolean;
}) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        {showBack && (
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        )}
        <T style={styles.title}>{title}</T>
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator>
        {sections.map((s, i) => (
          <View key={i} style={{ marginBottom: spacing.xl }}>
            {s.heading ? <T style={styles.heading}>{s.heading}</T> : null}
            <T dim style={styles.para}>{s.body}</T>
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <PillButton label={cta} onPress={onAgree} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { fontSize: font.size.xl, fontWeight: font.weight.bold as any },
  body: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
  heading: { fontSize: font.size.lg, fontWeight: '700', marginBottom: spacing.sm },
  para: { fontSize: font.size.md, lineHeight: 22 },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.black,
  },
});
