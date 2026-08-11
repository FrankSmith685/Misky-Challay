import { useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Chip } from '../../src/components/Chip';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { env } from '../../src/config/env';
import { invalidateResource, useResource } from '../../src/hooks/useResource';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { accountApi } from '../../src/services/api/account.service';
import { plansApi } from '../../src/services/api/plans.service';
import { colors, layout, radius, spacing, type } from '../../src/theme/tokens';
import type { WalletSummary } from '../../src/types/domain';

type Step = 'consequences' | 'confirm';

/**
 * Motivos de baja. Es opcional y solo va a la bitácora: nunca se guarda en el
 * perfil, que para entonces ya está anonimizado. Sirve al negocio para saber
 * por qué se va la gente, no para retenerla con un formulario.
 */
const REASONS: readonly string[] = [
  'Ya no pido comida a domicilio',
  'Encontré otra opción que me convence más',
  'Tuve un problema con un pedido',
  'Recibo demasiados correos o avisos',
  'Prefiero no dejar mis datos guardados',
];

/**
 * Lo que de verdad ocurre al dar de baja la cuenta, tal como lo ejecuta
 * accountService.deleteAccount en el backend. Se enumera antes de pedir la
 * contraseña: nadie debería descubrir después que perdió su saldo.
 */
const CONSEQUENCES: Array<{
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  copy: string;
}> = [
  {
    icon: 'map-marker-off-outline',
    title: 'Se borran tus direcciones y preferencias',
    copy: 'Direcciones, bowls guardados, favoritos, alertas de disponibilidad y boletín desaparecen sin copia.',
  },
  {
    icon: 'wallet-outline',
    title: 'El saldo de tu billetera se pierde',
    copy: 'Los créditos y bonos de tus planes no son transferibles ni reembolsables. Úsalos antes si te quedan.',
  },
  {
    icon: 'file-document-outline',
    title: 'Tus pedidos se conservan',
    copy: 'La ley peruana obliga a guardar las boletas y facturas electrónicas emitidas ante SUNAT. Quedan sin tus datos personales asociados.',
  },
  {
    icon: 'login-variant',
    title: 'No podrás volver a entrar',
    copy: 'El acceso se cierra al instante y este correo queda liberado. Si algún día vuelves, tendrás que crear una cuenta nueva.',
  },
];

export default function DeleteAccountScreen() {
  const { status, signOut } = useSession();
  const toast = useToast();

  const [step, setStep] = useState<Step>('consequences');
  const [understood, setUnderstood] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const wallet = useResource<WalletSummary>({
    key: status === 'authenticated' ? 'plans:wallet' : null,
    fetcher: () => plansApi.wallet(),
  });

  useEffect(() => {
    if (status === 'anonymous') router.replace('/(tabs)');
  }, [status]);

  const balance = wallet.data?.balance ?? 0;

  const goToConfirm = () => {
    if (!understood) {
      toast.show({
        message: 'Marca que entiendes las consecuencias para continuar.',
        tone: 'warning',
      });
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep('confirm');
  };

  const runDeletion = async () => {
    setDeleting(true);
    setError('');
    try {
      const summary = await accountApi.deleteAccount(password, reason ?? undefined);

      /*
       * La caché de proceso guarda perfil, direcciones y saldo del titular: se
       * vacía entera antes de soltar la sesión. `signOut` purga además el
       * carrito, el contexto de compra y el token push guardado; no hace falta
       * llamar a DELETE /account/mobile-devices porque el servidor ya desactivó
       * todos los dispositivos de esta cuenta.
       */
      invalidateResource();
      await signOut();

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({
        // Decir cuántos comprobantes quedan evita que el cliente crea que se
        // guardó algo suyo a escondidas.
        message: summary.keptOrders
          ? `Tu cuenta fue eliminada. Guardamos ${summary.keptOrders} ${summary.keptOrders === 1 ? 'comprobante' : 'comprobantes'} sin tus datos, por obligación tributaria.`
          : 'Tu cuenta fue eliminada. Gracias por acompañarnos.',
        tone: 'info',
        durationMs: 8_000,
      });
      router.replace('/(tabs)');
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'No pudimos eliminar tu cuenta.';
      setError(message);
      toast.show({ message, tone: 'error', placement: 'top' });
      setDeleting(false);
    }
  };

  // Único Alert de la pantalla: es la decisión destructiva que sí exige confirmar.
  const confirmDeletion = () => {
    Keyboard.dismiss();
    if (password.length === 0) {
      setError('Escribe tu contraseña para confirmar.');
      return;
    }

    Alert.alert(
      'Eliminar tu cuenta',
      'Esta acción no se puede deshacer. Perderás tu saldo, tus direcciones y tus bowls guardados.',
      [
        { text: 'Mejor no', style: 'cancel' },
        {
          text: 'Eliminar cuenta',
          style: 'destructive',
          onPress: () => void runDeletion(),
        },
      ],
    );
  };

  const footer =
    step === 'consequences' ? (
      <View style={styles.footer}>
        <PrimaryButton label="Continuar" variant="danger" onPress={goToConfirm} />
        <PrimaryButton
          label="Conservar mi cuenta"
          variant="ghost"
          onPress={() => router.back()}
        />
      </View>
    ) : (
      <View style={styles.footer}>
        <PrimaryButton
          label="Eliminar mi cuenta definitivamente"
          variant="danger"
          loading={deleting}
          disabled={password.length === 0}
          onPress={confirmDeletion}
        />
        <PrimaryButton
          label="Volver atrás"
          variant="ghost"
          disabled={deleting}
          onPress={() => setStep('consequences')}
        />
      </View>
    );

  return (
    <ScreenScaffold
      title="Eliminar mi cuenta"
      subtitle={step === 'consequences' ? 'Paso 1 de 2 · Qué ocurre' : 'Paso 2 de 2 · Confirmación'}
      onBack={() => (step === 'confirm' ? setStep('consequences') : router.back())}
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
          <View style={styles.progress}>
            <View style={styles.progressStepDone} />
            <View style={step === 'confirm' ? styles.progressStepDone : styles.progressStepIdle} />
          </View>

          {step === 'consequences' ? (
            <>
              <View style={styles.warning}>
                <MaterialCommunityIcons name="alert-outline" size={24} color={colors.danger} />
                <Text style={styles.warningText}>
                  Antes de seguir, lee qué pasa con tu información. No hay forma de recuperar la
                  cuenta después.
                </Text>
              </View>

              {balance > 0 && (
                <View style={styles.balanceCard}>
                  <MaterialCommunityIcons
                    name="cash-remove"
                    size={24}
                    color={colors.warning}
                  />
                  <View style={styles.balanceCopy}>
                    <Text style={styles.balanceTitle}>
                      Tienes S/ {balance.toFixed(2)} de saldo sin usar
                    </Text>
                    <Text style={styles.balanceText}>
                      Ese dinero se pierde al eliminar la cuenta. Puedes pedir algo antes y volver
                      luego.
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.list}>
                {CONSEQUENCES.map((item) => (
                  <View key={item.title} style={styles.item}>
                    <View style={styles.itemIcon}>
                      <MaterialCommunityIcons
                        name={item.icon}
                        size={21}
                        color={colors.brand700}
                      />
                    </View>

                    <View style={styles.itemCopy}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      <Text style={styles.itemText}>{item.copy}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: understood }}
                accessibilityLabel="Entiendo que la eliminación es definitiva"
                onPress={() => {
                  void Haptics.selectionAsync();
                  setUnderstood((current) => !current);
                }}
                style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}
              >
                <View style={[styles.checkBox, understood && styles.checkBoxOn]}>
                  {understood && (
                    <MaterialCommunityIcons name="check" size={18} color={colors.surface} />
                  )}
                </View>
                <Text style={styles.checkText}>
                  Entiendo que la eliminación es definitiva y que perderé mi saldo, mis direcciones
                  y mis bowls guardados.
                </Text>
              </Pressable>

              <View style={styles.reasonBlock}>
                <Text style={styles.reasonTitle}>¿Nos cuentas por qué te vas?</Text>
                <Text style={styles.reasonHint}>
                  Es opcional y no cambia nada de lo anterior. Nos ayuda a mejorar.
                </Text>

                <View style={styles.reasonChips}>
                  {REASONS.map((option) => (
                    <Chip
                      key={option}
                      label={option}
                      selected={reason === option}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setReason((current) => (current === option ? null : option));
                      }}
                    />
                  ))}
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={styles.warning}>
                <MaterialCommunityIcons name="shield-lock-outline" size={24} color={colors.danger} />
                <Text style={styles.warningText}>
                  Escribe tu contraseña para comprobar que eres tú. Una sesión abierta en un
                  teléfono prestado no basta para cerrar tu cuenta.
                </Text>
              </View>

              <View style={styles.card}>
                <FormField
                  label="Tu contraseña"
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    setError('');
                  }}
                  error={error || undefined}
                  secureTextEntry
                  autoComplete="current-password"
                  textContentType="password"
                  autoCapitalize="none"
                  returnKeyType="done"
                  icon="lock-outline"
                  placeholder="La contraseña de tu cuenta"
                  onSubmitEditing={confirmDeletion}
                />
              </View>

              <View style={styles.legalNote}>
                <MaterialCommunityIcons
                  name="file-certificate-outline"
                  size={20}
                  color={colors.brand700}
                />
                <Text style={styles.legalText}>
                  Conservamos los comprobantes de tus pedidos porque SUNAT nos obliga a
                  guardarlos. Ya no estarán vinculados a un cliente con nombre, correo ni
                  dirección.
                </Text>
              </View>

              <View style={styles.legalNote}>
                <MaterialCommunityIcons
                  name="progress-clock"
                  size={20}
                  color={colors.brand700}
                />
                <Text style={styles.legalText}>
                  Si tienes un pedido en curso, primero espera a recibirlo o cancélalo: hasta
                  entonces no podemos dar de baja la cuenta.
                </Text>
              </View>

              {/* La misma baja existe en la web y no exige instalar nada: las
                  tiendas piden que ese camino sea visible desde la app. */}
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Abrir la página web para eliminar la cuenta"
                onPress={() =>
                  void Linking.openURL(`${env.webUrl}/eliminar-cuenta`).catch(() => undefined)
                }
                style={({ pressed }) => [styles.webNote, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="web" size={20} color={colors.inkMuted} />
                <Text style={styles.webText}>
                  También puedes pedir la baja desde la web, sin la aplicación.
                </Text>
                <MaterialCommunityIcons name="open-in-new" size={18} color={colors.inkMuted} />
              </Pressable>
            </>
          )}
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
  progress: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  progressStepDone: {
    flex: 1,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
  },
  progressStepIdle: {
    flex: 1,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    backgroundColor: '#fff3f3',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#f4cccc',
    padding: spacing.md,
  },
  warningText: {
    ...type.body,
    flex: 1,
    color: '#8f2f2f',
  },
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    backgroundColor: '#fff8e8',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#f0dcae',
    padding: spacing.md,
    marginTop: spacing.sm + spacing.xs,
  },
  balanceCopy: {
    flex: 1,
  },
  balanceTitle: {
    ...type.body,
    fontWeight: '800',
    color: '#7a5410',
  },
  balanceText: {
    ...type.bodySm,
    color: '#8a6a30',
    marginTop: 3,
  },
  list: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.md,
  },
  itemIcon: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
  },
  itemCopy: {
    flex: 1,
  },
  itemTitle: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  itemText: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 3,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    minHeight: 64,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
    marginTop: spacing.md,
  },
  checkBox: {
    width: 28,
    height: 28,
    borderRadius: radius.sm - 2,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  checkText: {
    ...type.bodySm,
    flex: 1,
    color: colors.ink,
  },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  legalNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.brand50,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm + spacing.xs,
  },
  legalText: {
    ...type.bodySm,
    flex: 1,
    color: colors.brand700,
  },
  reasonBlock: {
    marginTop: spacing.lg,
  },
  reasonTitle: {
    ...type.heading,
    color: colors.ink,
  },
  reasonHint: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 3,
  },
  reasonChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm + spacing.xs,
  },
  webNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
    marginTop: spacing.sm + spacing.xs,
  },
  webText: {
    ...type.bodySm,
    flex: 1,
    color: colors.inkMuted,
  },
  footer: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
});
