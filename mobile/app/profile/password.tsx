import { useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { useToast } from '../../src/providers/ToastProvider';
import { accountApi } from '../../src/services/api/account.service';
import { colors, radius, spacing, type } from '../../src/theme/tokens';

/** Mínimo que exige el backend (changePasswordSchema). */
const MIN_LENGTH = 8;

/**
 * Mismas cuatro señales que la web muestra en el registro. Solo la longitud es
 * obligatoria; las otras tres son consejo, no barrera, para no dejar fuera a
 * quien usa un gestor de contraseñas con su propio criterio.
 */
const RULES: Array<{ label: string; matches: (value: string) => boolean }> = [
  { label: '8 caracteres', matches: (value) => value.length >= MIN_LENGTH },
  { label: 'Una mayúscula', matches: (value) => /[A-Z]/.test(value) },
  { label: 'Un número', matches: (value) => /\d/.test(value) },
  { label: 'Un símbolo', matches: (value) => /[^\w]/.test(value) },
];

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

type PasswordErrors = Partial<Record<keyof PasswordForm, string>>;

const EMPTY_FORM: PasswordForm = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

const validate = (form: PasswordForm): PasswordErrors => {
  const errors: PasswordErrors = {};

  if (form.currentPassword.length === 0) {
    errors.currentPassword = 'Escribe tu contraseña actual.';
  }
  if (form.newPassword.length < MIN_LENGTH) {
    errors.newPassword = `La nueva contraseña necesita al menos ${MIN_LENGTH} caracteres.`;
  } else if (form.newPassword === form.currentPassword) {
    errors.newPassword = 'La nueva contraseña debe ser distinta de la actual.';
  }
  if (form.confirmPassword !== form.newPassword) {
    errors.confirmPassword = 'Las contraseñas no coinciden.';
  }

  return errors;
};

export default function ChangePasswordScreen() {
  const toast = useToast();

  const [form, setForm] = useState<PasswordForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [saving, setSaving] = useState(false);

  const passed = useMemo(
    () => RULES.filter((rule) => rule.matches(form.newPassword)).length,
    [form.newPassword],
  );

  const strengthLabel = passed === RULES.length ? 'Segura' : passed >= 2 ? 'Puede mejorar' : 'Débil';
  const strengthColor =
    passed === RULES.length ? colors.success : passed >= 2 ? colors.warning : colors.danger;

  const change = (field: keyof PasswordForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async () => {
    Keyboard.dismiss();
    const found = validate(form);
    setErrors(found);

    if (Object.keys(found).length > 0) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      toast.show({ message: 'Revisa los campos marcados en rojo.', tone: 'warning' });
      return;
    }

    setSaving(true);
    try {
      await accountApi.changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });

      setForm(EMPTY_FORM);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({ message: 'Tu contraseña quedó actualizada.', tone: 'success' });

      if (router.canGoBack()) router.back();
    } catch (caught) {
      toast.show({
        message:
          caught instanceof Error ? caught.message : 'No pudimos actualizar tu contraseña.',
        tone: 'error',
        placement: 'top',
      });
    } finally {
      setSaving(false);
    }
  };

  const ready =
    form.currentPassword.length > 0 &&
    form.newPassword.length > 0 &&
    form.confirmPassword.length > 0;

  const footer = (
    <View style={styles.footer}>
      <PrimaryButton
        label="Actualizar contraseña"
        loading={saving}
        disabled={!ready}
        onPress={() => void submit()}
      />
    </View>
  );

  return (
    <ScreenScaffold
      title="Cambiar contraseña"
      subtitle="Tu sesión sigue abierta después de cambiarla"
      footer={footer}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.card}>
            <FormField
              label="Contraseña actual"
              value={form.currentPassword}
              onChangeText={(value) => change('currentPassword', value)}
              error={errors.currentPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              autoCapitalize="none"
              returnKeyType="next"
              icon="lock-outline"
              placeholder="La que usas hoy"
            />

            <FormField
              label="Nueva contraseña"
              value={form.newPassword}
              onChangeText={(value) => change('newPassword', value)}
              error={errors.newPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              autoCapitalize="none"
              returnKeyType="next"
              icon="lock-plus-outline"
              placeholder={`Mínimo ${MIN_LENGTH} caracteres`}
            />

            {form.newPassword.length > 0 && (
              <View accessibilityLiveRegion="polite" style={styles.strength}>
                <View style={styles.strengthHead}>
                  <View style={styles.track}>
                    <View
                      style={[
                        styles.fill,
                        {
                          width: `${(passed / RULES.length) * 100}%`,
                          backgroundColor: strengthColor,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.strengthLabel, { color: strengthColor }]}>
                    {strengthLabel}
                  </Text>
                </View>

                <View style={styles.rules}>
                  {RULES.map((rule) => {
                    const done = rule.matches(form.newPassword);
                    return (
                      <View key={rule.label} style={styles.rule}>
                        <MaterialCommunityIcons
                          name={done ? 'check-circle' : 'circle-outline'}
                          size={15}
                          color={done ? colors.success : colors.inkMuted}
                        />
                        <Text style={[styles.ruleText, done && styles.ruleTextDone]}>
                          {rule.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            <FormField
              label="Repite la nueva contraseña"
              value={form.confirmPassword}
              onChangeText={(value) => change('confirmPassword', value)}
              error={errors.confirmPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              autoCapitalize="none"
              returnKeyType="done"
              icon="lock-check-outline"
              placeholder="Debe coincidir"
              onSubmitEditing={() => void submit()}
            />
          </View>

          <View style={styles.note}>
            <MaterialCommunityIcons name="shield-key-outline" size={20} color={colors.brand700} />
            <Text style={styles.noteText}>
              Si no recuerdas la actual, cierra sesión y usa «Olvidé mi contraseña» en la pantalla
              de acceso: te enviaremos un enlace a tu correo.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    gap: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.md,
  },
  strength: {
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm + spacing.xs,
    marginTop: -spacing.xs,
  },
  strengthHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.line,
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  strengthLabel: {
    ...type.label,
  },
  rules: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm + spacing.xs,
  },
  rule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    minWidth: '44%',
  },
  ruleText: {
    ...type.caption,
    color: colors.inkMuted,
  },
  ruleTextDone: {
    color: colors.success,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.brand50,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  noteText: {
    ...type.bodySm,
    flex: 1,
    color: colors.brand700,
  },
  footer: {
    paddingBottom: spacing.sm,
  },
});
