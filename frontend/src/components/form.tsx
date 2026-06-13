import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { useTheme } from '../theme';
import { labelize } from '../lib/format';

/** Section label + subtle group. */
export function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textTertiary }]}>{title}</Text>
      {children}
    </View>
  );
}

export function FieldLabel({ text, hint }: { text: string; hint?: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.labelRow}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{text}</Text>
      {hint ? <Text style={[styles.hint, { color: theme.textTertiary }]}>{hint}</Text> : null}
    </View>
  );
}

export function TextField({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  maxLength,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad';
  multiline?: boolean;
  maxLength?: number;
}) {
  const { theme } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.textTertiary}
      keyboardType={keyboardType}
      multiline={multiline}
      maxLength={maxLength}
      style={[
        styles.input,
        multiline && { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 },
        { backgroundColor: theme.inputBackground, color: theme.textPrimary },
      ]}
    />
  );
}

/** Single- or multi-select chip group. Generic over a string-union value type. */
export function ChipSelect<T extends string>({
  options,
  selected,
  onChange,
  multi,
  max,
  format = labelize,
}: {
  options: readonly T[];
  selected: T[];
  onChange: (next: T[]) => void;
  multi?: boolean;
  max?: number;
  format?: (v: string) => string;
}) {
  const { theme } = useTheme();
  const toggle = (v: T) => {
    if (!multi) {
      onChange(selected[0] === v ? [] : [v]);
      return;
    }
    if (selected.includes(v)) onChange(selected.filter((x) => x !== v));
    else if (!max || selected.length < max) onChange([...selected, v]);
  };
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <Pressable
            key={o}
            onPress={() => toggle(o)}
            style={[styles.chip, { backgroundColor: on ? theme.brand : theme.inputBackground }]}
          >
            <Text style={{ color: on ? theme.textInverse : theme.textPrimary, fontWeight: '600' }}>
              {format(o)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 12 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12 },
  input: { borderRadius: 12, paddingHorizontal: 14, height: 48, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 14, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
