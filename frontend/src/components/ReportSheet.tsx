import { useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme';
import { reportUser, ApiError } from '../services/api';
import { showSuccess } from '../lib/toast';
import { labelize } from '../lib/format';
import type { ReportReason } from '../types/api';

const REASONS: ReportReason[] = [
  'spam',
  'harassment',
  'fake_profile',
  'inappropriate_content',
  'lgbtq_hate',
  'other',
];

export function ReportSheet({
  visible,
  userId,
  onClose,
  onReported,
}: {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onReported?: () => void;
}) {
  const { theme } = useTheme();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await reportUser(userId, { reason, details: details.trim() || undefined });
      setReason(null);
      setDetails('');
      onReported?.();
      onClose();
      showSuccess('Report submitted', 'Thanks for letting us know.');
    } catch (e) {
      setError((e as ApiError).message ?? 'Could not submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={() => {}}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Report user</Text>
          {REASONS.map((r) => (
            <Pressable key={r} style={styles.reasonRow} onPress={() => setReason(r)}>
              <Text style={[styles.reason, { color: theme.textPrimary }]}>{labelize(r)}</Text>
              <View style={[styles.radio, { borderColor: reason === r ? theme.brand : theme.border }]}>
                {reason === r && <View style={[styles.radioDot, { backgroundColor: theme.brand }]} />}
              </View>
            </Pressable>
          ))}
          <TextInput
            value={details}
            onChangeText={setDetails}
            placeholder="Add details (optional)"
            placeholderTextColor={theme.textTertiary}
            multiline
            maxLength={500}
            style={[styles.input, { backgroundColor: theme.inputBackground, color: theme.textPrimary }]}
          />
          {error && <Text style={[styles.error, { color: theme.error }]}>{error}</Text>}
          <Pressable
            disabled={!reason || submitting}
            style={[styles.submit, { backgroundColor: reason ? theme.error : theme.callDisabled }]}
            onPress={submit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Submit report</Text>
            )}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  reason: { fontSize: 15 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  input: { borderRadius: 12, padding: 12, minHeight: 70, marginTop: 12, fontSize: 14, textAlignVertical: 'top' },
  error: { fontSize: 13, marginTop: 10 },
  submit: { height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
