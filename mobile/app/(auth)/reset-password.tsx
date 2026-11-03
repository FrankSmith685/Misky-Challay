import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AuthScaffold } from '../../src/components/AuthScaffold';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { authApi } from '../../src/services/api/auth.service';
import { colors, radius, spacing } from '../../src/theme/tokens';

const passwordChecks = [
  { label: '8 caracteres', test: (value: string) => value.length >= 8 },
  { label: 'una mayúscula', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'un número', test: (value: string) => /\d/.test(value) },
] as const;

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const checks = useMemo(
    () => passwordChecks.map((check) => ({ ...check, valid: check.test(password) })),
    [password],
  );

  const submit = async () => {
    if (!token) {
      setError('El enlace no contiene un token válido. Solicita uno nuevo.');
      return;
    }
    if (!checks.every((check) => check.valid)) {
      setError('Crea una contraseña que cumpla los requisitos indicados.');
      return;
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await authApi.resetPassword(token, password);
      setComplete(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScaffold
      eyebrow={complete ? 'Acceso recuperado' : 'Seguridad de cuenta'}
      title={complete ? 'Contraseña actualizada' : 'Crea una contraseña nueva'}
      description={
        complete
          ? 'Ya puedes volver a iniciar sesión en Misky Challay.'
          : 'El cambio se aplicará tanto en la app como en la web porque ambas usan la misma cuenta.'
      }
    >
      {complete ? (
        <View style={styles.complete}>
          <View style={styles.completeIcon}>
            <MaterialCommunityIcons name="shield-check" size={36} color={colors.brand700} />
          </View>
          <Text style={styles.completeTitle}>Tu cuenta vuelve a estar protegida</Text>
          <PrimaryButton
            label="Iniciar sesión"
            onPress={() => router.replace('/(auth)/login')}
            style={styles.button}
          />
        </View>
      ) : (
        <>
          {!token ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>Este enlace está incompleto o fue abierto incorrectamente.</Text>
            </View>
          ) : null}
          <FormField
            label="Nueva contraseña"
            icon="lock-outline"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            value={password}
            onChangeText={setPassword}
            placeholder="Tu nueva contraseña"
          />
          <View style={styles.checks}>
            {checks.map((check) => (
              <View key={check.label} style={styles.checkRow}>
                <MaterialCommunityIcons
                  name={check.valid ? 'check-circle' : 'circle-outline'}
                  size={17}
                  color={check.valid ? colors.success : colors.inkMuted}
                />
                <Text style={[styles.checkText, check.valid && styles.checkValid]}>{check.label}</Text>
              </View>
            ))}
          </View>
          <FormField
            label="Repite la contraseña"
            icon="lock-check-outline"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            value={confirmation}
            onChangeText={setConfirmation}
            error={confirmation && confirmation !== password ? 'Las contraseñas no coinciden.' : undefined}
            placeholder="Confirma tu nueva contraseña"
          />
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          <PrimaryButton
            label="Guardar nueva contraseña"
            loading={loading}
            disabled={!token}
            onPress={() => void submit()}
            style={styles.button}
          />
          {!token ? (
            <PrimaryButton
              label="Solicitar otro enlace"
              variant="secondary"
              onPress={() => router.replace('/(auth)/forgot-password')}
              style={styles.secondaryButton}
            />
          ) : null}
        </>
      )}
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  checks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  checkText: { color: colors.inkMuted, fontSize: 12, fontWeight: '600' },
  checkValid: { color: colors.success },
  errorBox: { borderRadius: radius.md, backgroundColor: '#fff0f0', padding: 13, marginBottom: spacing.md },
  errorText: { color: colors.danger, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  complete: { alignItems: 'center' },
  completeIcon: { width: 70, height: 70, borderRadius: 24, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  completeTitle: { color: colors.ink, fontSize: 18, lineHeight: 25, fontWeight: '900', textAlign: 'center', marginTop: spacing.md },
  button: { width: '100%', marginTop: spacing.md },
  secondaryButton: { width: '100%', marginTop: spacing.sm },
});
