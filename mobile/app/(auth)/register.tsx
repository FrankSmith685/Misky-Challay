import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthScaffold } from '../../src/components/AuthScaffold';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { useSession } from '../../src/providers/SessionProvider';
import { colors, radius, spacing, type } from '../../src/theme/tokens';

type Fields = { firstName: string; lastName: string; email: string; phone: string; password: string; confirmation: string };
type Errors = Partial<Record<keyof Fields | 'terms' | 'submit', string>>;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const { signUp, isBusy } = useSession();
  const [fields, setFields] = useState<Fields>({ firstName: '', lastName: '', email: '', phone: '', password: '', confirmation: '' });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const update = (key: keyof Fields) => (value: string) => setFields((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    const next: Errors = {};
    if (fields.firstName.trim().length < 2) next.firstName = 'Escribe al menos 2 caracteres.';
    if (fields.lastName.trim().length < 2) next.lastName = 'Escribe al menos 2 caracteres.';
    if (!emailPattern.test(fields.email.trim())) next.email = 'Ingresa un correo válido.';
    if (fields.phone && fields.phone.replace(/\D/g, '').length < 6) next.phone = 'Ingresa un teléfono válido.';
    if (fields.password.length < 8) next.password = 'Usa al menos 8 caracteres.';
    if (!/[A-Z]/.test(fields.password) || !/\d/.test(fields.password)) next.password = 'Incluye una mayúscula y un número.';
    if (fields.confirmation !== fields.password) next.confirmation = 'Las contraseñas no coinciden.';
    if (!acceptedTerms) next.terms = 'Debes aceptar los términos y la política de privacidad.';
    setErrors(next);
    if (Object.keys(next).length) return;

    try {
      await signUp({
        firstName: fields.firstName.trim(),
        lastName: fields.lastName.trim(),
        email: fields.email.trim(),
        phone: fields.phone.trim() || undefined,
        password: fields.password,
        acceptedTerms: true,
      });
      router.replace('/(tabs)/account');
    } catch (error) {
      setErrors({ submit: error instanceof Error ? error.message : 'No pudimos crear tu cuenta.' });
    }
  };

  return (
    <AuthScaffold eyebrow="Únete a Verde Bowl" title="Crea tu cuenta" description="Guarda tus datos una vez y disfruta pedidos más rápidos y personalizados.">
      {errors.submit && <View style={styles.alert}><Text style={styles.alertTitle}>No pudimos crear tu cuenta</Text><Text style={styles.alertCopy}>{errors.submit}</Text></View>}
      <View style={styles.row}>
        <View style={styles.half}><FormField label="Nombre" icon="account-outline" value={fields.firstName} onChangeText={update('firstName')} error={errors.firstName} autoComplete="given-name" /></View>
        <View style={styles.half}><FormField label="Apellido" value={fields.lastName} onChangeText={update('lastName')} error={errors.lastName} autoComplete="family-name" /></View>
      </View>
      <FormField label="Correo electrónico" icon="email-outline" value={fields.email} onChangeText={update('email')} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <FormField label="Teléfono" icon="phone-outline" value={fields.phone} onChangeText={update('phone')} error={errors.phone} keyboardType="phone-pad" autoComplete="tel" hint="Opcional · para coordinar tus pedidos" />
      <FormField label="Contraseña" icon="lock-outline" secureTextEntry value={fields.password} onChangeText={update('password')} error={errors.password} hint="8 caracteres, una mayúscula y un número" autoComplete="new-password" />
      <FormField label="Confirma tu contraseña" icon="lock-check-outline" secureTextEntry value={fields.confirmation} onChangeText={update('confirmation')} error={errors.confirmation} autoComplete="new-password" />

      <Pressable style={styles.terms} onPress={() => setAcceptedTerms((value) => !value)}>
        <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>{acceptedTerms && <MaterialCommunityIcons name="check" size={16} color={colors.surface} />}</View>
        {/* Los dos documentos viven dentro de la app: abrir el navegador sacaba
            al cliente del formulario a medio llenar y, sin EXPO_PUBLIC_WEB_URL,
            el enlace acababa en el host del API. */}
        <Text style={styles.termsCopy}>
          Acepto los{' '}
          <Text style={styles.link} onPress={() => router.push('/legal/terminos' as Href)}>
            Términos
          </Text>{' '}
          y la{' '}
          <Text style={styles.link} onPress={() => router.push('/legal/privacidad' as Href)}>
            Política de Privacidad
          </Text>
          .
        </Text>
      </Pressable>
      {errors.terms && <Text style={styles.termsError}>{errors.terms}</Text>}

      <PrimaryButton label="Crear mi cuenta" loading={isBusy} onPress={submit} style={styles.submit} />
      <View style={styles.footer}><Text style={styles.footerCopy}>¿Ya tienes una cuenta?</Text><Pressable onPress={() => router.replace('/(auth)/login')}><Text style={styles.link}>Inicia sesión</Text></Pressable></View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  alert: { backgroundColor: '#fff2f2', borderLeftWidth: 3, borderLeftColor: colors.danger, borderRadius: 10, padding: 12, marginBottom: spacing.md },
  alertTitle: { ...type.bodySm, color: colors.danger, fontWeight: '900' },
  alertCopy: { ...type.caption, color: colors.inkMuted, marginTop: 3 },
  terms: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 52, backgroundColor: colors.brand50, borderRadius: radius.md, padding: 12 },
  checkbox: { width: 23, height: 23, borderRadius: 7, borderWidth: 2, borderColor: '#8ab89f', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.brand600, borderColor: colors.brand600 },
  termsCopy: { ...type.bodySm, flex: 1, color: colors.inkMuted },
  link: { color: colors.brand700, fontWeight: '900' },
  termsError: { ...type.caption, color: colors.danger, marginTop: 6 },
  submit: { marginTop: spacing.lg },
  footer: { alignItems: 'center', gap: 7, marginTop: spacing.lg },
  footerCopy: { ...type.bodySm, color: colors.inkMuted },
});
