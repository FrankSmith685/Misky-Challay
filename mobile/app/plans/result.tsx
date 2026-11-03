import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { primeResource } from '../../src/hooks/useResource';
import { plansApi } from '../../src/services/api/plans.service';
import { subscriptionsApi } from '../../src/services/api/subscriptions.service';
import { colors, radius, spacing, type } from '../../src/theme/tokens';
import type { WalletSummary } from '../../src/types/domain';

type State = 'checking' | 'confirmed' | 'cancelled' | 'pending';

/** Diez comprobaciones cada segundo y medio: quince segundos de cortesía al webhook. */
const MAX_ATTEMPTS = 10;
const POLL_MS = 1_500;

const COPY: Record<State, { eyebrow: string; title: string; copy: string }> = {
  checking: {
    eyebrow: 'VALIDANDO CON EL PROVEEDOR',
    title: 'Estamos confirmando…',
    copy: 'Consultamos tu billetera real: volver de la pasarela no acredita saldo por sí solo.',
  },
  confirmed: {
    eyebrow: 'PLAN ACTIVADO',
    title: 'Tu saldo ya está listo',
    copy: 'El saldo y los beneficios pueden utilizarse en tus pedidos desde ahora.',
  },
  cancelled: {
    eyebrow: 'PAGO NO COMPLETADO',
    title: 'No activamos el plan',
    copy: 'No se cobró nada ni se acreditó saldo. Puedes volver a intentarlo cuando quieras.',
  },
  pending: {
    eyebrow: 'PAGO EN VALIDACIÓN',
    title: 'Puede tardar unos segundos',
    copy: 'Si el proveedor aprobó el cobro, el aviso del servidor activará el plan sin que tengas que pagar de nuevo.',
  },
};

const ICON: Record<State, keyof typeof MaterialCommunityIcons.glyphMap> = {
  checking: 'progress-clock',
  confirmed: 'wallet-outline',
  cancelled: 'credit-card-remove-outline',
  pending: 'clock-alert-outline',
};

function LegacyPlanResultScreen() {
  const { planId = '', payment = '' } = useLocalSearchParams<{
    planId: string;
    payment: string;
  }>();

  const target = /^\d+$/.test(planId) ? Number(planId) : null;

  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [state, setState] = useState<State>(payment === 'cancelado' ? 'cancelled' : 'checking');
  /** Cambiarlo relanza la comprobación: es el botón «Comprobar de nuevo». */
  const [attemptId, setAttemptId] = useState(0);

  useEffect(() => {
    if (payment === 'cancelado') return;

    let active = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async (): Promise<void> => {
      try {
        const summary = await plansApi.wallet();
        if (!active) return;

        setWallet(summary);
        // La billetera recién leída vale para la pantalla de saldo: se la dejamos
        // en caché para que no vuelva a pedirla al entrar.
        primeResource('plans:wallet', summary);
        attempts += 1;

        if (target !== null && summary.activePlans.some((plan) => plan.id === target)) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setState('confirmed');
          return;
        }

        // Sin un plan que vigilar no hay nada que esperar: mostramos el saldo
        // consultado y dejamos que el cliente revise su billetera.
        if (target === null || attempts >= MAX_ATTEMPTS) {
          setState('pending');
          return;
        }

        timer = setTimeout(() => void poll(), POLL_MS);
      } catch {
        if (active) setState('pending');
      }
    };

    setState('checking');
    void poll();

    return () => {
      active = false;
      if (timer !== null) clearTimeout(timer);
    };
  }, [attemptId, payment, target]);

  const copy = COPY[state];
  const confirmed = state === 'confirmed';
  const warning = state === 'cancelled' || state === 'pending';

  return (
    <ScreenScaffold tone="dark" showBack={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.icon, warning && styles.iconWarning]}>
          <MaterialCommunityIcons name={ICON[state]} size={46} color={colors.surface} />
        </View>

        <Text style={styles.eyebrow}>{copy.eyebrow}</Text>

        <Text style={styles.title}>{copy.title}</Text>

        <Text style={styles.copy}>{copy.copy}</Text>

        <View style={styles.receipt}>
          <View style={styles.row}>
            <Text style={styles.label}>Activación</Text>

            <Text style={styles.value}>{target ?? '—'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Estado</Text>

            <Text style={styles.value}>
              {confirmed
                ? 'Activa'
                : state === 'checking'
                  ? 'Comprobando'
                  : state === 'cancelled'
                    ? 'Cancelada'
                    : 'Pendiente'}
            </Text>
          </View>

          {wallet ? (
            <>
              <View style={styles.divider} />

              <View style={styles.row}>
                <Text style={styles.totalLabel}>Saldo disponible</Text>

                <Text style={styles.total}>S/ {Number(wallet.balance).toFixed(2)}</Text>
              </View>
            </>
          ) : null}
        </View>

        <PrimaryButton
          label={confirmed ? 'Ver mi billetera' : 'Revisar mi saldo'}
          onPress={() => router.replace('/wallet' as Href)}
          style={styles.button}
        />

        {state === 'pending' ? (
          <PrimaryButton
            label="Comprobar de nuevo"
            variant="secondary"
            onPress={() => setAttemptId((value) => value + 1)}
            style={styles.secondary}
          />
        ) : (
          <PrimaryButton
            label="Volver a los planes"
            variant="secondary"
            onPress={() => router.replace('/plans' as Href)}
            style={styles.secondary}
          />
        )}

        <View style={styles.note}>
          <MaterialCommunityIcons name="shield-check-outline" size={19} color={colors.brand100} />

          <Text style={styles.noteText}>
            La activación y cada movimiento quedan registrados en el servidor con una clave
            idempotente: reintentar nunca cobra dos veces.
          </Text>
        </View>
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  icon: {
    width: 88,
    height: 88,
    borderRadius: radius.lg + 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand600,
  },
  iconWarning: {
    backgroundColor: colors.warning,
  },
  eyebrow: {
    ...type.label,
    color: colors.onDarkMuted,
    marginTop: spacing.lg,
  },
  title: {
    ...type.display,
    color: colors.onDark,
    textAlign: 'center',
    marginTop: spacing.xs + 2,
  },
  copy: {
    ...type.body,
    color: colors.onDarkMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  receipt: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.xs,
  },
  label: {
    ...type.bodySm,
    color: colors.inkMuted,
  },
  value: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: spacing.md,
  },
  totalLabel: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  total: {
    ...type.title,
    color: colors.brand700,
  },
  button: {
    width: '100%',
    marginTop: spacing.lg,
  },
  secondary: {
    width: '100%',
    marginTop: spacing.sm + spacing.xs,
  },
  note: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    width: '100%',
    backgroundColor: colors.surfaceDarkRaised,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  noteText: {
    ...type.bodySm,
    flex: 1,
    color: colors.onDarkMuted,
  },
});

function SubscriptionResultScreen({ subscriptionId }: { subscriptionId: number }) {
  const [state, setState] = useState<'checking' | 'active' | 'pending'>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let count = 0;
    const check = async () => {
      try {
        await subscriptionsApi.sync(subscriptionId);
        const rows = await subscriptionsApi.mine();
        if (!active) return;
        const current = rows.find((row) => row.id === subscriptionId);
        if (current?.cycles.length) {
          setState('active');
          return;
        }
      } catch { /* El cliente puede volver a comprobar cuando la red se recupere. */ }
      if (!active) return;
      count += 1;
      if (count >= 8) { setState('pending'); return; }
      timer = setTimeout(() => void check(), 2_000);
    };
    setState('checking');
    void check();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [subscriptionId, attempt]);

  return <ScreenScaffold tone="dark" showBack={false}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.icon}><MaterialCommunityIcons name={state === 'active' ? 'check-circle-outline' : 'calendar-clock'} size={46} color={colors.surface} /></View>
      <Text style={styles.eyebrow}>SUSCRIPCIÓN MENSUAL</Text>
      <Text style={styles.title}>{state === 'active' ? 'Tu caja está pagada' : state === 'checking' ? 'Verificando el primer cobro…' : 'La activación sigue pendiente'}</Text>
      <Text style={styles.copy}>{state === 'active' ? 'Ya puedes programar el recojo de tu primera caja.' : 'Solo un cobro confirmado habilita una caja. Puedes revisar el estado en Mis suscripciones.'}</Text>
      <PrimaryButton label="Ver mis suscripciones" onPress={() => router.replace('/plans' as Href)} style={styles.button} />
      {state === 'pending' && <PrimaryButton label="Comprobar de nuevo" variant="secondary" onPress={() => setAttempt((value) => value + 1)} style={styles.secondary} />}
    </ScrollView>
  </ScreenScaffold>;
}

export default function PlanResultScreen() {
  const { subscriptionId } = useLocalSearchParams<{ subscriptionId?: string }>();
  return subscriptionId && /^\d+$/.test(subscriptionId)
    ? <SubscriptionResultScreen subscriptionId={Number(subscriptionId)} />
    : <LegacyPlanResultScreen />;
}
