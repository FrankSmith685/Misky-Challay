import { env } from '../../src/config/env';
import { useResource } from '../../src/hooks/useResource';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { subscriptionsApi, type CustomerSubscription, type PickupBranch, type PickupSlot, type SubscriptionCycle, type SubscriptionPlan } from '../../src/services/api/subscriptions.service';
import { colors, radius, spacing, type } from '../../src/theme/tokens';

const money = (value: number) => `S/ ${Number(value).toFixed(2)}`;
const date = (value: string) => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function PlansScreen() {
  const params = useLocalSearchParams<{ suscripcion?: string }>();
  const linkedSubscription = Number(params.suscripcion);
  const { status, user } = useSession();
  const toast = useToast();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [mine, setMine] = useState<CustomerSubscription[]>([]);
  const [branches, setBranches] = useState<PickupBranch[]>([]);
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [termsVersion, setTermsVersion] = useState('');
  const [available, setAvailable] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const resource = useResource({
    key: status === 'bootstrapping' ? null : `subscriptions:plans:${user?.id ?? 'public'}`,
    fetcher: () => Promise.all([subscriptionsApi.plans(), subscriptionsApi.branches(), subscriptionsApi.config(), status === 'authenticated' ? subscriptionsApi.mine() : Promise.resolve([])]),
    pollIntervalMs: 30000,
  });
  useEffect(() => {
    if (resource.data) {
      const [planRows, locations, config, own] = resource.data;
      setPlans(planRows); setBranches(locations); setTermsVersion(config.termsVersion); setAvailable(config.available); setMine(own); setLoading(false);
    }
    if (resource.error) { setLoading(false); toast.show({ message: resource.error.message, tone: 'error' }); }
  }, [resource.data, resource.error, toast]);
  useEffect(() => { setSelectedCycle(null); setSelectedSlot(null); }, [user?.id]);
  const refresh = async () => { await resource.refresh(); };

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try { await action(); toast.show({ message, tone: 'success' }); await refresh(); }
    catch (error) { toast.show({ message: error instanceof Error ? error.message : 'No se pudo completar la acción.', tone: 'error' }); }
    finally { setBusy(false); }
  };

  const start = async () => {
    const plan = plans.find((entry) => entry.id === selectedPlan);
    if (!plan || plan.remainingSubscriptions <= 0 || !branchId || !accepted || !branches.some((branch) => branch.id === branchId && branch.acceptsPickup && plan.branchIds.includes(branch.id))) return;
    setBusy(true);
    try {
      const response = await subscriptionsApi.subscribe(plan.id, branchId, termsVersion);
      await Linking.openURL(response.checkoutUrl);
      setSelectedPlan(null); setAccepted(false);
      await refresh();
    } catch (error) {
      toast.show({ message: error instanceof Error ? error.message : 'No pudimos abrir Mercado Pago.', tone: 'error' });
    } finally { setBusy(false); }
  };

  const openCycle = async (cycle: SubscriptionCycle, row: CustomerSubscription) => {
    setBusy(true);
    try {
      const rows = await subscriptionsApi.slots(row.branchId);
      setSlots(rows.filter((slot) => slot.available > 0 && new Date(slot.startsAt).getTime() >= Date.now() + row.leadDays * 86_400_000 && new Date(slot.startsAt).getTime() <= new Date(cycle.expiresAt).getTime()));
      setSelectedCycle(cycle.id); setSelectedSlot(null);
    } catch (error) {
      toast.show({ message: error instanceof Error ? error.message : 'No pudimos cargar los horarios.', tone: 'error' });
    } finally { setBusy(false); }
  };

  return <ScreenScaffold title="Suscripciones" subtitle="Una caja de postres cada mes">
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}><MaterialCommunityIcons name="gift-outline" size={31} color={colors.surface} /><Text style={styles.heroTitle}>Postres para compartir</Text><Text style={styles.heroCopy}>Cada pago mensual confirmado habilita una caja. Programa el recojo desde aquí y cancela los próximos cobros cuando quieras.</Text></View>
      {loading && <Text style={styles.muted}>Cargando suscripciones…</Text>}
      {!loading && plans.length === 0 && <Text style={styles.muted}>Aún no hay cajas mensuales publicadas.</Text>}
      {plans.map((plan) => {
        const allowed = branches.filter((branch) => branch.acceptsPickup && plan.branchIds.includes(branch.id));
        return <View key={plan.id} style={styles.card}>
          <View style={styles.cardHeader}><MaterialCommunityIcons name="gift-outline" size={22} color={colors.brand700} /><Text style={styles.capacity}>{plan.remainingSubscriptions > 0 ? `${plan.remainingSubscriptions} cupos disponibles` : 'Cupos agotados'}</Text></View>
          <Text style={styles.name}>{plan.name}</Text><Text style={styles.muted}>{plan.description}</Text>
          <View style={styles.pricePanel}><Text style={styles.muted}>Precio mensual</Text><Text style={styles.price}>{money(plan.monthlyPrice)} <Text style={styles.priceSuffix}>/ mes</Text></Text></View>
          {plan.items.map((item) => <Text key={item.variantId} style={styles.item}>✓ {item.quantity} × {item.productName} · {item.variantName}</Text>)}
          <Text style={styles.muted}>Recojo con {plan.leadDays} días de anticipación.</Text>
          {selectedPlan === plan.id ? <View style={styles.selection}>
            <Text style={styles.label}>Sucursal de recojo</Text>
            {allowed.map((branch) => <Pressable key={branch.id} accessibilityRole="radio" accessibilityState={{ checked: branchId === branch.id }} onPress={() => setBranchId(branch.id)} style={[styles.choice, branchId === branch.id && styles.choiceActive]}><Text style={styles.item}>{branchId === branch.id ? '◉' : '○'} {branch.name}</Text><Text style={styles.muted}>{branch.addressLine}</Text></Pressable>)}
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={() => setAccepted(!accepted)} style={styles.terms}><MaterialCommunityIcons name={accepted ? 'checkbox-marked' : 'checkbox-blank-outline'} size={23} color={colors.brand700} /><Text style={styles.item}>Autorizo el cobro recurrente de {money(plan.monthlyPrice)} cada mes. Cada cobro pagado habilita una caja; puedo cancelar las siguientes renovaciones aquí.</Text></Pressable>
            <Pressable onPress={() => void Linking.openURL(env.webUrl + '/terminos?documento=suscripcion')}><Text style={[styles.item, { color: colors.brand700, fontWeight: '700' }]}>Leer las condiciones de suscripción</Text></Pressable>
            <PrimaryButton label="Continuar a Mercado Pago" disabled={!branchId || !accepted || !available || plan.remainingSubscriptions <= 0} loading={busy} onPress={() => void start()} />
            <PrimaryButton label="Volver" variant="ghost" onPress={() => setSelectedPlan(null)} />
          </View> : <PrimaryButton label={plan.remainingSubscriptions <= 0 ? 'Cupos agotados' : status === 'authenticated' ? 'Elegir suscripción' : 'Ingresar para elegir'} disabled={!available || allowed.length === 0 || plan.remainingSubscriptions <= 0} onPress={() => {
            if (status !== 'authenticated') { router.push({ pathname: '/(auth)/login', params: { returnTo: '/plans' } }); return; }
            setSelectedPlan(plan.id); setBranchId(allowed[0]?.id ?? null); setAccepted(false);
          }} />}
          {!available && <Text style={styles.muted}>Contratación disponible al configurar el cobro recurrente.</Text>}
        </View>;
      })}
      {status === 'authenticated' && <><Text style={styles.section}>Mis suscripciones</Text>
        {mine.length === 0 && <Text style={styles.muted}>Aún no tienes cajas mensuales contratadas.</Text>}
        {[...mine].sort((a, b) => Number(b.id === linkedSubscription) - Number(a.id === linkedSubscription)).map((row) => <View key={row.id} style={styles.card}>
          <Text style={styles.name}>{row.name}</Text><Text style={styles.item}>{money(row.price)} / mes · {branches.find((branch) => branch.id === row.branchId)?.name ?? 'Recojo en sucursal'}</Text>
          <Text style={styles.muted}>Estado: {row.status === 'ACTIVE' ? 'Activa' : row.status === 'CANCELED' ? 'Renovación cancelada' : row.status === 'PAST_DUE' ? 'Cobro pendiente' : 'Esperando autorización'}</Text>
          {row.nextChargeAt && row.status !== 'CANCELED' && <Text style={styles.muted}>Próximo cobro: {date(row.nextChargeAt)}</Text>}
          {row.termsAcceptance && <View><Text style={styles.label}>Condiciones aceptadas · Versión {row.termsAcceptance.version}</Text><Text style={styles.muted}>{row.termsAcceptance.content}</Text></View>}
          {row.cycles.map((cycle) => <View key={cycle.id} style={styles.cycle}>
            <Text style={styles.item}>Caja pagada el {date(cycle.paidAt)}</Text>
            <Text style={styles.muted}>{cycle.orderId ? `Recojo programado: ${cycle.scheduledAt ? date(cycle.scheduledAt) : 'ver en pedidos'}` : `Programa antes del ${date(cycle.expiresAt)}`}</Text>
            {!cycle.orderId && new Date(cycle.expiresAt).getTime() > Date.now() && <PrimaryButton label="Programar recojo" variant="secondary" disabled={busy} onPress={() => void openCycle(cycle, row)} />}
            {!cycle.orderId && new Date(cycle.expiresAt).getTime() <= Date.now() && <Text style={styles.muted}>El plazo para programar esta caja terminó.</Text>}
            {selectedCycle === cycle.id && !cycle.orderId && new Date(cycle.expiresAt).getTime() > Date.now() && <View style={styles.selection}>
              <Text style={styles.label}>Elige fecha y horario</Text>
              {slots.map((slot) => <Pressable key={slot.id} accessibilityRole="radio" accessibilityState={{ checked: selectedSlot === slot.id }} onPress={() => setSelectedSlot(slot.id)} style={[styles.choice, selectedSlot === slot.id && styles.choiceActive]}><Text style={styles.item}>{selectedSlot === slot.id ? '◉' : '○'} {date(slot.startsAt)}</Text></Pressable>)}
              {slots.length === 0 && <Text style={styles.muted}>No hay horarios disponibles. Intenta más tarde.</Text>}
              <PrimaryButton label="Confirmar recojo" disabled={!selectedSlot || busy} loading={busy} onPress={() => void run(() => subscriptionsApi.redeem(cycle.id, selectedSlot!), 'Caja programada. Revisa Mis pedidos.')} />
            </View>}
          </View>)}
          {row.status === 'PENDING' && <PrimaryButton label="Continuar autorización" disabled={busy} onPress={() => void run(async () => { const link = await subscriptionsApi.checkout(row.id); await Linking.openURL(link.checkoutUrl); }, 'Abriendo autorización')} />}
          <PrimaryButton label="Actualizar pagos" variant="secondary" disabled={busy} onPress={() => void run(() => subscriptionsApi.sync(row.id), 'Estado actualizado')} />
          {row.status !== 'CANCELED' && <PrimaryButton label="Cancelar próximos cobros" variant="ghost" disabled={busy} onPress={() => Alert.alert('Cancelar suscripción', 'No habrá nuevos cobros. Tus cajas pagadas se mantienen disponibles hasta su vencimiento.', [{ text: 'Volver', style: 'cancel' }, { text: 'Cancelar renovación', style: 'destructive', onPress: () => void run(() => subscriptionsApi.cancel(row.id), 'Renovación cancelada') }])} />}
        </View>)}
        <PrimaryButton label="Ver saldo de compras anteriores" variant="ghost" onPress={() => router.push('/wallet' as Href)} />
      </>}
    </ScrollView>
  </ScreenScaffold>;
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  hero: { backgroundColor: colors.surfaceDark, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  heroTitle: { ...type.title, color: colors.onDark },
  heroCopy: { ...type.body, color: colors.onDarkMuted },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  capacity: { ...type.bodySm, color: colors.brand700, fontWeight: '700' },
  name: { ...type.heading, color: colors.ink },
  price: { ...type.title, color: colors.brand700 },
  pricePanel: { backgroundColor: colors.brand50, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  priceSuffix: { ...type.bodySm, color: colors.inkMuted },
  section: { ...type.title, color: colors.ink, marginTop: spacing.md },
  item: { ...type.bodySm, color: colors.ink, flexShrink: 1 },
  muted: { ...type.bodySm, color: colors.inkMuted },
  label: { ...type.label, color: colors.ink },
  selection: { gap: spacing.sm, marginTop: spacing.sm },
  choice: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.sm },
  choiceActive: { borderColor: colors.brand600, backgroundColor: colors.brand50 },
  terms: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginVertical: spacing.sm },
  cycle: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
});
