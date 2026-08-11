import { useCallback, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { BottomSheet } from '../../src/components/BottomSheet';
import { EmptyState } from '../../src/components/EmptyState';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { useResource } from '../../src/hooks/useResource';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { plansApi } from '../../src/services/api/plans.service';
import { colors, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type { Plan, WalletSummary } from '../../src/types/domain';

const money = (value: number | string): string => `S/ ${Number(value).toFixed(2)}`;

/**
 * Clave de idempotencia de la compra. Nace al elegir el plan, no al pulsar
 * «pagar»: si la pasarela tarda y el cliente reintenta, el backend reconoce el
 * mismo intento y devuelve el enlace ya creado en vez de cobrar dos veces.
 */
const buildKey = (): string =>
  `mobile-plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export default function PlansScreen() {
  const { status } = useSession();
  const toast = useToast();

  const plans = useResource<Plan[]>({
    key: 'plans:list',
    fetcher: () => plansApi.list(),
  });

  const wallet = useResource<WalletSummary>({
    key: status === 'authenticated' ? 'plans:wallet' : null,
    fetcher: () => plansApi.wallet(),
  });

  const [selected, setSelected] = useState<Plan | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [buying, setBuying] = useState(false);

  const idempotency = useRef('');

  const choose = useCallback(
    (plan: Plan) => {
      if (status !== 'authenticated') {
        router.push({ pathname: '/(auth)/login', params: { returnTo: '/plans' } });
        return;
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      idempotency.current = buildKey();
      setAccepted(false);
      setSelected(plan);
    },
    [status],
  );

  const close = useCallback(() => {
    if (buying) return;
    setSelected(null);
  }, [buying]);

  const confirm = async () => {
    if (!selected || !accepted || buying) return;

    setBuying(true);
    try {
      const purchase = await plansApi.purchase(selected.code, idempotency.current || buildKey());
      if (!purchase.checkoutUrl) throw new Error('La pasarela no devolvió un enlace de pago.');

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSelected(null);
      await Linking.openURL(purchase.checkoutUrl);
    } catch (caught) {
      toast.show({
        message: caught instanceof Error ? caught.message : 'No pudimos iniciar la compra.',
        tone: 'error',
        placement: 'top',
      });
    } finally {
      setBuying(false);
    }
  };

  const refresh = useCallback(() => {
    void plans.refresh();
    void wallet.refresh();
  }, [plans, wallet]);

  const summary = wallet.data;

  const header = (
    <View>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <MaterialCommunityIcons name="wallet-giftcard" size={30} color={colors.surface} />
        </View>

        <Text style={styles.heroTitle}>Recarga con beneficio</Text>

        <Text style={styles.heroCopy}>
          Pagas una vez, recibes saldo y disfrutas beneficios durante la vigencia del plan. No es
          una suscripción: no se renueva sola ni guarda tu tarjeta.
        </Text>
      </View>

      {summary && summary.balance > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Tu saldo disponible es ${money(summary.balance)}. Ver la billetera`}
          onPress={() => router.push('/wallet' as Href)}
          style={({ pressed }) => [styles.walletBanner, pressed && styles.pressed]}
        >
          <View style={styles.walletText}>
            <Text style={styles.walletLabel}>MI SALDO DISPONIBLE</Text>

            <Text style={styles.walletAmount}>{money(summary.balance)}</Text>

            <Text style={styles.walletDetail}>
              {money(summary.paidBalance)} pagados · {money(summary.bonusBalance)} de bono
            </Text>
          </View>

          <MaterialCommunityIcons name="chevron-right" size={26} color={colors.brand700} />
        </Pressable>
      ) : null}
    </View>
  );

  if (plans.loading && !plans.data) {
    return (
      <ScreenScaffold title="Planes Verde Bowl" padded>
        <Skeleton height={168} rounded="lg" style={styles.skeletonTop} />

        <Skeleton height={230} rounded="lg" count={2} gap={spacing.md} />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold title="Planes Verde Bowl" subtitle="Más saldo, mejores pedidos">
      <FlatList
        data={plans.data ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={plans.refreshing}
            onRefresh={refresh}
            tintColor={colors.brand600}
          />
        }
        renderItem={({ item }) => {
          const price = Number(item.price);
          const credit = Number(item.grantedCredit);
          const bonus = Math.max(0, credit - price);
          const percent = price > 0 ? Math.round((bonus / price) * 100) : 0;

          return (
            <View style={[styles.plan, shadow.sm, item.isFeatured && styles.planFeatured]}>
              {item.isFeatured ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>MÁS ELEGIDO</Text>
                </View>
              ) : null}

              <View style={styles.planTop}>
                <View style={styles.planMark}>
                  <MaterialCommunityIcons name="sprout" size={22} color={colors.brand700} />
                </View>

                <View style={styles.planText}>
                  <Text style={styles.planName}>{item.name}</Text>

                  <Text style={styles.planDescription}>
                    {item.description || `Beneficios por ${item.validityDays} días`}
                  </Text>
                </View>
              </View>

              <View style={styles.amounts}>
                <View>
                  <Text style={styles.amountLabel}>PAGAS</Text>

                  <Text style={styles.price}>{money(price)}</Text>
                </View>

                <MaterialCommunityIcons name="arrow-right" size={20} color={colors.inkMuted} />

                <View>
                  <Text style={styles.amountLabel}>RECIBES</Text>

                  <Text style={styles.credit}>{money(credit)}</Text>
                </View>
              </View>

              {bonus > 0 ? (
                <View style={styles.bonus}>
                  <MaterialCommunityIcons name="gift-outline" size={17} color={colors.accent500} />

                  <Text style={styles.bonusText}>
                    Ganas {money(bonus)} extra{percent > 0 ? ` (${percent}%)` : ''}
                  </Text>
                </View>
              ) : null}

              <View style={styles.benefits}>
                {item.benefits.map((benefit) => (
                  <View key={benefit.id} style={styles.benefit}>
                    <MaterialCommunityIcons name="check-circle" size={17} color={colors.success} />

                    <Text style={styles.benefitText}>{benefit.description}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.validity}>
                Beneficios vigentes por {item.validityDays} días
              </Text>

              <PrimaryButton
                label={status === 'authenticated' ? `Elegir ${item.name}` : 'Ingresar para elegir'}
                onPress={() => choose(item)}
                style={styles.planButton}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          plans.error ? (
            <EmptyState
              icon="cloud-alert-outline"
              title="No pudimos cargar los planes"
              message={plans.error.message}
              actionLabel="Reintentar"
              onAction={() => void plans.refetch()}
            />
          ) : (
            <EmptyState
              icon="calendar-clock"
              title="No hay planes disponibles"
              message="Puedes seguir pidiendo desde el menú mientras preparamos nuevas opciones."
              actionLabel="Ver el menú"
              onAction={() => router.push('/(tabs)/menu')}
            />
          )
        }
        ListFooterComponent={
          <View style={styles.info}>
            <MaterialCommunityIcons name="information-outline" size={21} color={colors.brand700} />

            <Text style={styles.infoText}>
              El dinero pagado y el bono conservan fechas separadas. Al pedir se usa primero el
              lote que vence antes.
            </Text>
          </View>
        }
      />

      <BottomSheet
        visible={selected !== null}
        onClose={close}
        title="Confirma tu plan"
        subtitle={selected?.name}
        dismissible={!buying}
      >
        <View style={styles.sheetIcon}>
          <MaterialCommunityIcons name="shield-check-outline" size={26} color={colors.brand700} />
        </View>

        <Text style={styles.sheetCopy}>
          Pagarás {money(selected?.price ?? 0)} y, cuando el proveedor confirme el cobro, recibirás{' '}
          {money(selected?.grantedCredit ?? 0)} de saldo en tu billetera.
        </Text>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel="Acepto las condiciones del plan"
          accessibilityState={{ checked: accepted }}
          onPress={() => setAccepted((value) => !value)}
          style={({ pressed }) => [styles.terms, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons
            name={accepted ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={24}
            color={accepted ? colors.brand600 : colors.inkMuted}
          />

          <Text style={styles.termsText}>
            Acepto las condiciones, vigencias y beneficios mostrados para este plan.
          </Text>
        </Pressable>

        <PrimaryButton
          label="Continuar al pago seguro"
          loading={buying}
          disabled={!accepted}
          onPress={() => void confirm()}
          style={styles.confirm}
        />

        <PrimaryButton label="Ahora no" variant="ghost" disabled={buying} onPress={close} />
      </BottomSheet>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  skeletonTop: {
    marginBottom: spacing.md,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  hero: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand600,
  },
  heroTitle: {
    ...type.title,
    color: colors.onDark,
    marginTop: spacing.md,
  },
  heroCopy: {
    ...type.body,
    color: colors.onDarkMuted,
    marginTop: spacing.sm,
  },
  walletBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.brand50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brand100,
    padding: spacing.md,
    marginTop: spacing.sm + spacing.xs,
  },
  walletText: {
    flex: 1,
  },
  walletLabel: {
    ...type.label,
    color: colors.brand700,
  },
  walletAmount: {
    ...type.title,
    color: colors.brand900,
    marginTop: 3,
  },
  walletDetail: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 3,
  },
  plan: {
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  planFeatured: {
    borderColor: '#e9b04e',
    borderWidth: 2,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: colors.accent500,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomLeftRadius: radius.md,
  },
  badgeText: {
    ...type.label,
    color: colors.surface,
  },
  planTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    paddingRight: 96,
  },
  planMark: {
    width: 44,
    height: 44,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
  },
  planText: {
    flex: 1,
  },
  planName: {
    ...type.heading,
    color: colors.ink,
  },
  planDescription: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 3,
  },
  amounts: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  amountLabel: {
    ...type.label,
    color: colors.inkMuted,
  },
  price: {
    ...type.heading,
    color: colors.ink,
    marginTop: 3,
  },
  credit: {
    ...type.title,
    color: colors.brand700,
    marginTop: 3,
  },
  bonus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#fff8e8',
    borderRadius: radius.sm,
    padding: spacing.sm + spacing.xs,
    marginTop: spacing.sm + spacing.xs,
  },
  bonusText: {
    ...type.bodySm,
    fontWeight: '800',
    color: '#7d5400',
  },
  benefits: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  benefitText: {
    ...type.bodySm,
    flex: 1,
    fontWeight: '700',
    color: colors.ink,
  },
  validity: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: spacing.md,
  },
  planButton: {
    marginTop: spacing.sm + spacing.xs,
  },
  info: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.brand50,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  infoText: {
    ...type.bodySm,
    flex: 1,
    color: colors.brand700,
  },
  sheetIcon: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
  },
  sheetCopy: {
    ...type.body,
    color: colors.inkMuted,
    marginTop: spacing.md,
  },
  terms: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  termsText: {
    ...type.bodySm,
    flex: 1,
    color: colors.ink,
  },
  confirm: {
    marginTop: spacing.md,
  },
  pressed: {
    opacity: 0.85,
  },
});
