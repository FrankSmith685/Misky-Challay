import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { BottomSheet } from '../BottomSheet';
import { Chip } from '../Chip';
import { FormField } from '../FormField';
import { PrimaryButton } from '../PrimaryButton';
import { colors, radius, spacing, type } from '../../theme/tokens';

export type StaffFormValue = string | boolean | string[];

export interface StaffFormField {
  key: string;
  label: string;
  value?: StaffFormValue | null;
  hint?: string;
  placeholder?: string;
  kind?: 'text' | 'number' | 'email' | 'url' | 'password' | 'multiline' | 'boolean' | 'choice' | 'multiChoice';
  choices?: Array<{ label: string; value: string }>;
  required?: boolean;
}

interface StaffFormSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  fields: StaffFormField[];
  submitLabel?: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, StaffFormValue>) => void | Promise<void>;
}

export function StaffFormSheet({
  visible,
  title,
  subtitle,
  fields,
  submitLabel = 'Guardar cambios',
  loading = false,
  onClose,
  onSubmit,
}: StaffFormSheetProps) {
  const initial = useMemo(
    () => Object.fromEntries(fields.map((field) => [field.key, field.value ?? (field.kind === 'boolean' ? false : '')])) as Record<string, StaffFormValue>,
    [fields],
  );
  const [values, setValues] = useState<Record<string, StaffFormValue>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) {
      setValues(initial);
      setErrors({});
    }
  }, [initial, visible]);

  const submit = async () => {
    const nextErrors: Record<string, string> = {};
    fields.forEach((field) => {
      if (field.required && String(values[field.key] ?? '').trim() === '') {
        nextErrors[field.key] = 'Este dato es obligatorio.';
      }
    });
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    await onSubmit(values);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      maxHeightRatio={0.94}
      dismissible={!loading}
      footer={
        <PrimaryButton
          label={submitLabel}
          icon="content-save-outline"
          loading={loading}
          onPress={() => void submit()}
        />
      }
    >
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {fields.map((field) => {
          if (field.kind === 'boolean') {
            return (
              <View key={field.key} style={styles.switchRow}>
                <View style={styles.switchCopy}>
                  <Text style={styles.switchLabel}>{field.label}</Text>
                  {field.hint ? <Text style={styles.switchHint}>{field.hint}</Text> : null}
                </View>
                <Switch
                  value={Boolean(values[field.key])}
                  onValueChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
                  trackColor={{ false: colors.line, true: colors.brand100 }}
                  thumbColor={Boolean(values[field.key]) ? colors.brand600 : colors.inkMuted}
                />
              </View>
            );
          }
          if (field.kind === 'choice' || field.kind === 'multiChoice') {
            const selectedValues = Array.isArray(values[field.key]) ? values[field.key] as string[] : [];
            return (
              <View key={field.key} style={styles.choiceBlock}>
                <Text style={styles.switchLabel}>{field.label}</Text>
                {field.hint ? <Text style={styles.switchHint}>{field.hint}</Text> : null}
                <View style={styles.choices}>
                  {(field.choices ?? []).map((choice) => (
                    <Chip
                      key={choice.value}
                      label={choice.label}
                      selected={field.kind === 'multiChoice' ? selectedValues.includes(choice.value) : values[field.key] === choice.value}
                      onPress={() => setValues((current) => {
                        if (field.kind !== 'multiChoice') return { ...current, [field.key]: choice.value };
                        const currentValues = Array.isArray(current[field.key]) ? current[field.key] as string[] : [];
                        return { ...current, [field.key]: currentValues.includes(choice.value) ? currentValues.filter((entry) => entry !== choice.value) : [...currentValues, choice.value] };
                      })}
                    />
                  ))}
                </View>
                {errors[field.key] ? <Text style={styles.error}>{errors[field.key]}</Text> : null}
              </View>
            );
          }
          return (
            <FormField
              key={field.key}
              label={field.label}
              value={String(values[field.key] ?? '')}
              onChangeText={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
              placeholder={field.placeholder}
              hint={field.hint}
              error={errors[field.key]}
              keyboardType={field.kind === 'number' ? 'decimal-pad' : field.kind === 'email' ? 'email-address' : field.kind === 'url' ? 'url' : 'default'}
              autoCapitalize={field.kind === 'email' || field.kind === 'password' || field.kind === 'url' ? 'none' : 'sentences'}
              autoCorrect={field.kind !== 'email' && field.kind !== 'password' && field.kind !== 'url'}
              secureTextEntry={field.kind === 'password'}
              multiline={field.kind === 'multiline'}
              numberOfLines={field.kind === 'multiline' ? 4 : 1}
              style={field.kind === 'multiline' ? styles.multiline : undefined}
            />
          );
        })}
        <View style={styles.syncNote}>
          <Text style={styles.syncNoteText}>El cambio se reflejará también en el panel web.</Text>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.md },
  switchRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.md },
  switchCopy: { flex: 1 },
  switchLabel: { ...type.bodySm, color: colors.ink, fontWeight: '900' },
  switchHint: { ...type.caption, color: colors.inkMuted, marginTop: 3 },
  choiceBlock: { gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: spacing.md },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  error: { ...type.caption, color: colors.danger, fontWeight: '700' },
  multiline: { minHeight: 92, textAlignVertical: 'top' },
  syncNote: { borderRadius: radius.md, backgroundColor: colors.brand50, padding: spacing.sm + 2 },
  syncNoteText: { ...type.caption, color: colors.brand700, textAlign: 'center' },
});
