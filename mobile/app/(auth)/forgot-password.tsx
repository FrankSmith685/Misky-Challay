import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AuthScaffold } from '../../src/components/AuthScaffold';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { useSession } from '../../src/providers/SessionProvider';
import { colors, radius, spacing } from '../../src/theme/tokens';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const { requestPasswordReset } = useSession();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!emailPattern.test(email.trim())) { setError('Ingresa un correo válido.'); return; }
    setLoading(true);
    setError('');
    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos procesar la solicitud.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScaffold eyebrow={sent ? 'Solicitud completada' : 'Recuperar acceso'} title={sent ? 'Revisa tu correo' : 'Recupera tu contraseña'} description={sent ? 'Si existe una cuenta con ese correo, recibirás instrucciones en unos minutos.' : 'Te enviaremos un enlace seguro para crear una contraseña nueva.'}>
      {sent ? (
        <View style={styles.sent}>
          <View style={styles.sentIcon}><MaterialCommunityIcons name="email-check-outline" size={34} color={colors.brand700} /></View>
          <Text style={styles.sentTitle}>Enlace solicitado</Text>
          <Text style={styles.sentCopy}>Por seguridad mostramos este resultado exista o no una cuenta. El enlace vence en 60 minutos y abrirá directamente Verde Bowl para que cambies tu contraseña.</Text>
          <PrimaryButton label="Volver a iniciar sesión" onPress={() => router.replace('/(auth)/login')} style={styles.button} />
        </View>
      ) : (
        <>
          <View style={styles.notice}><MaterialCommunityIcons name="shield-check-outline" size={21} color={colors.brand700} /><Text style={styles.noticeCopy}>Nunca te pediremos tu contraseña actual por correo.</Text></View>
          <FormField label="Correo electrónico" icon="email-outline" keyboardType="email-address" autoCapitalize="none" autoComplete="email" value={email} onChangeText={setEmail} error={error} placeholder="tu@email.com" />
          <PrimaryButton label="Enviarme el enlace" loading={loading} onPress={submit} style={styles.button} />
        </>
      )}
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.brand50, borderRadius: radius.md, padding: 13, marginBottom: spacing.lg },
  noticeCopy: { flex: 1, color: colors.brand800, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  button: { marginTop: spacing.md },
  sent: { alignItems: 'center' },
  sentIcon: { width: 66, height: 66, borderRadius: 22, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  sentTitle: { color: colors.ink, fontSize: 20, fontWeight: '900', marginTop: spacing.md },
  sentCopy: { color: colors.inkMuted, fontSize: 13, lineHeight: 21, textAlign: 'center', marginTop: 8 },
});
