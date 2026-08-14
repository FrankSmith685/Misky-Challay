import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthScaffold } from '../../src/components/AuthScaffold';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { useSession } from '../../src/providers/SessionProvider';
import { colors, spacing } from '../../src/theme/tokens';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { signIn, isBusy } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; submit?: string }>({});

  const submit = async () => {
    const next: typeof errors = {};
    if (!emailPattern.test(email.trim())) next.email = 'Ingresa un correo válido.';
    if (!password) next.password = 'Ingresa tu contraseña.';
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      await signIn(email, password);
      router.replace((returnTo && returnTo.startsWith('/') ? returnTo : '/(tabs)/account') as Href);
    } catch (error) {
      setErrors({ submit: error instanceof Error ? error.message : 'No pudimos iniciar sesión.' });
    }
  };

  return (
    <AuthScaffold eyebrow="Bienvenido de vuelta" title="Ingresa a tu cuenta" description="Recupera tus datos, preferencias y pedidos desde cualquier dispositivo.">
      {errors.submit && <View style={styles.alert}><Text style={styles.alertTitle}>No pudimos ingresar</Text><Text style={styles.alertCopy}>{errors.submit}</Text></View>}
      <View style={styles.fields}>
        <FormField label="Correo electrónico" icon="email-outline" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" returnKeyType="next" value={email} onChangeText={setEmail} error={errors.email} placeholder="tu@email.com" />
        <FormField label="Contraseña" icon="lock-outline" secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" returnKeyType="done" onSubmitEditing={() => void submit()} value={password} onChangeText={setPassword} error={errors.password} hint="Distingue mayúsculas y minúsculas" />
      </View>
      <Pressable onPress={() => router.push('/(auth)/forgot-password')} style={styles.forgot}><Text style={styles.link}>¿Olvidaste tu contraseña?</Text></Pressable>
      <PrimaryButton label="Ingresar a mi cuenta" loading={isBusy} onPress={submit} />
      <View style={styles.footer}><Text style={styles.footerCopy}>¿Primera vez en Verde Bowl?</Text><Pressable onPress={() => router.replace('/(auth)/register')}><Text style={styles.link}>Crear cuenta gratis</Text></Pressable></View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 3 },
  alert: { backgroundColor: '#fff2f2', borderLeftWidth: 3, borderLeftColor: colors.danger, borderRadius: 10, padding: 12, marginBottom: spacing.md },
  alertTitle: { color: colors.danger, fontSize: 13, fontWeight: '900' },
  alertCopy: { color: colors.inkMuted, fontSize: 12, marginTop: 3 },
  forgot: { alignSelf: 'flex-end', paddingVertical: 4, marginBottom: spacing.md },
  link: { color: colors.brand700, fontSize: 13, fontWeight: '900' },
  footer: { alignItems: 'center', gap: 7, marginTop: spacing.lg },
  footerCopy: { color: colors.inkMuted, fontSize: 13 },
});
