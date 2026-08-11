import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Chip } from '../../src/components/Chip';
import { EmptyState } from '../../src/components/EmptyState';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { useResource } from '../../src/hooks/useResource';
import { useSession } from '../../src/providers/SessionProvider';
import { plansApi } from '../../src/services/api/plans.service';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type { WalletSummary, WalletTransaction } from '../../src/types/domain';

type Filter = 'ALL' | 'IN' | 'OUT';

const PAGE_SIZE = 20;

/** Los movimientos que SUMAN saldo. El resto lo consume. */
const CREDIT_TYPES = new Set<WalletTransaction['type']>(['CREDIT', 'REFUND']);

const money = (value: number): string => `S/ ${Number(value).toFixed(2)}`;

const shortDate = (value: string | null): string =>
  value
    ? new Date(value).toLocaleDateString('es-PE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : 'Sin vencimiento';

const movementDate = (value: string): string =>
  new Date(value).toLocaleString('es-PE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const RULES: ReadonlyArray<{
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  copy: string;
}> = [
  {
    icon: 'numeric-1-circle',
    title: 'Vigencias separadas',
    copy: 'Cada compra y cada bono conserva su propia fecha.',
  },
  {
    icon: 'numeric-2-circle',
    title: 'Primero el que vence',
    copy: 'El servidor consume antes el lote con menor vigencia.',
  },
  {
    icon: 'numeric-3-circle',
    title: 'Sin cargos automáticos',
    copy: 'Comprar un plan no crea pagos recurrentes.',
  },
];

export default function WalletScreen() {
  const { status } = useSession();
  const authenticated = status === 'authenticated';

  const wallet = useResource<WalletSummary>({
    key: authenticated ? 'plans:wallet' : null,
    fetcher: () => plansApi.wallet(),
  });

  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loadedPages, setLoadedPages] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');

  /** Corta las llamadas que dispara `onEndReached` mientras ya hay una en vuelo. */
  const busy = useRef(false);

  const loadPage = useCallback(
    async (page: number) => {
      if (!authenticated || busy.current) return;

      busy.current = true;
      setLoadingHistory(true);
      setHistoryError(null);
      try {
        const rows = await plansApi.transactions(page, PAGE_SIZE);
        setTransactions((current) => (page === 1 ? rows : [...current, ...rows]));
        setLoadedPages(page);
        // El servicio entrega solo la lista: una página incompleta significa
        // que ya no queda historial por detrás.
        setHasMore(rows.length === PAGE_SIZE);
      } catch (caught) {
        setHistoryError(
          caught instanceof Error ? caught.message : 'No pudimos cargar tus movimientos.',
        );
      } finally {
        busy.current = false;
        setLoadingHistory(false);
      }
    },
    [authenticated],
  );

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace({ pathname: '/(auth)/login', params: { returnTo: '/wallet' } });
      return;
    }
    if (authenticated) void loadPage(1);
  }, [authenticated, loadPage, status]);

  const refresh = useCallback(() => {
    void wallet.refresh();
    void loadPage(1);
  }, [loadPage, wallet]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingHistory || historyError !== null) return;
    void loadPage(loadedPages + 1);
  }, [hasMore, historyError, loadedPages, loadPage, loadingHistory]);

  const visible = useMemo(
    () =>
      transactions.filter((row) => {
        if (filter === 'ALL') return true;
        return filter === 'IN' ? CREDIT_TYPES.has(row.type) : !CREDIT_TYPES.has(row.type);
      }),
    [filter, transactions],
  );

  const summary = wallet.data;

  if (status === 'bootstrapping' || (wallet.loading && !summary)) {
    return (
      <ScreenScaffold title="Mi saldo" padded>
        <Skeleton height={188} rounded="lg" style={styles.skeletonTop} />

        <Skeleton height={72} rounded="md" count={4} gap={spacing.sm + spacing.xs} />
      </ScreenScaffold>
    );
  }

  if (!summary) {
    return (
      <ScreenScaffold title="Mi saldo">
        <EmptyState
          icon="cloud-alert-outline"
          title="No pudimos consultar tu billetera"
          message={wallet.error?.message ?? 'Vuelve a intentarlo en unos segundos.'}
          actionLabel="Reintentar"
          onAction={() => void wallet.refetch()}
        />
      </ScreenScaffold>
    );
  }

  const paidShare =
    summary.balance > 0
      ? Math.min(100, Math.max(0, (summary.paidBalance / summary.balance) * 100))
      : 0;

  const header = (
    <View>
      <View style={styles.balance}>
        <View style={styles.balanceIcon}>
          <MaterialCommunityIcons name="wallet-outline" size={26} color={colors.surface} />
        </View>

        <Text style={styles.balanceLabel}>SALDO DISPONIBLE</Text>

        <Text style={styles.balanceAmount}>{money(summary.balance)}</Text>

        <Text style={styles.balanceCopy}>
          Puedes aplicarlo en uno o varios pedidos desde el checkout.
        </Text>

        <View style={styles.expiry}>
          <MaterialCommunityIcons name="calendar-clock" size={17} color={colors.brand100} />

          <Text style={styles.expiryText}>Próximo vencimiento: {shortDate(summary.nextExpiry)}</Text>
        </View>
      </View>

      <View style={styles.composition}>
        <View style={[styles.compositionCard, shadow.sm]}>
          <MaterialCommunityIcons name="cash-check" size={22} color={colors.brand700} />

          <Text style={styles.compositionLabel}>Pagado y devuelto</Text>

          <Text style={styles.compositionAmount}>{money(summary.paidBalance)}</Text>
        </View>

        <View style={[styles.compositionCard, styles.bonusCard, shadow.sm]}>
          <MaterialCommunityIcons name="gift-outline" size={22} color={colors.accent500} />

          <Text style={styles.compositionLabel}>Bonos</Text>

          <Text style={styles.compositionAmount}>{money(summary.bonusBalance)}</Text>
        </View>
      </View>

      {summary.balance > 0 ? (
        <View style={styles.share}>
          <View style={styles.shareLabels}>
            <Text style={styles.shareText}>{Math.round(paidShare)}% pagado</Text>

            <Text style={styles.shareText}>{Math.round(100 - paidShare)}% bono</Text>
          </View>

          <View style={styles.shareBar}>
            <View style={[styles.sharePaid, { width: `${paidShare}%` }]} />
          </View>
        </View>
      ) : null}

      <PrimaryButton
        label="Usar mi saldo en un pedido"
        onPress={() => router.push('/(tabs)/menu')}
        style={styles.useButton}
      />

      <View style={styles.rules}>
        <Text style={styles.rulesTitle}>Cómo funciona</Text>

        {RULES.map((rule) => (
          <View key={rule.title} style={styles.rule}>
            <MaterialCommunityIcons name={rule.icon} size={22} color={colors.brand600} />

            <View style={styles.ruleText}>
              <Text style={styles.ruleTitle}>{rule.title}</Text>

              <Text style={styles.ruleCopy}>{rule.copy}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.sectionTop}>
        <View style={styles.sectionText}>
          <Text style={styles.sectionEyebrow}>BENEFICIOS VIGENTES</Text>

          <Text style={styles.sectionTitle}>Planes activos</Text>
        </View>

        <Text style={styles.sectionCount}>{summary.activePlans.length}</Text>
      </View>

      {summary.activePlans.length > 0 ? (
        summary.activePlans.map((plan) => (
          <View key={plan.id} style={[styles.card, shadow.sm]}>
            <View style={styles.planHead}>
              <View style={styles.planText}>
                <Text style={styles.planName}>{plan.name}</Text>

                <Text style={styles.planExpiry}>Hasta {shortDate(plan.expiresAt)}</Text>
              </View>

              <MaterialCommunityIcons name="shield-check" size={24} color={colors.success} />
            </View>

            <View style={styles.planAmounts}>
              <Text style={styles.planAmount}>Pagado {money(plan.paidRemaining)}</Text>

              <Text style={styles.planAmount}>Bono {money(plan.bonusRemaining)}</Text>
            </View>

            {plan.benefits.map((benefit) => (
              <View key={benefit.type} style={styles.planBenefit}>
                <MaterialCommunityIcons
                  name="check-circle-outline"
                  size={16}
                  color={colors.brand600}
                />

                <Text style={styles.planBenefitText}>{benefit.description}</Text>
              </View>
            ))}
          </View>
        ))
      ) : (
        <View style={[styles.card, styles.centered]}>
          <Text style={styles.cardTitle}>No tienes beneficios activos</Text>

          <Text style={styles.cardCopy}>Tu saldo pagado vigente puede seguir utilizándose.</Text>

          <PrimaryButton
            label="Comparar planes"
            variant="secondary"
            onPress={() => router.push('/plans' as Href)}
            style={styles.cardButton}
          />
        </View>
      )}

      {summary.lots.length > 0 ? (
        <>
          <View style={styles.sectionTop}>
            <View style={styles.sectionText}>
              <Text style={styles.sectionEyebrow}>ORDEN DE CONSUMO</Text>

              <Text style={styles.sectionTitle}>Vigencia de cada saldo</Text>
            </View>
          </View>

          <View style={[styles.lots, shadow.sm]}>
            {summary.lots.map((lot, index) => (
              <View key={lot.id} style={[styles.lot, index > 0 && styles.lotDivided]}>
                <View style={[styles.lotIcon, lot.kind === 'BONUS' && styles.lotIconBonus]}>
                  <MaterialCommunityIcons
                    name={lot.kind === 'BONUS' ? 'gift-outline' : 'cash-clock'}
                    size={20}
                    color={lot.kind === 'BONUS' ? colors.accent500 : colors.brand700}
                  />
                </View>

                <View style={styles.lotText}>
                  <Text style={styles.lotName}>
                    {lot.planName || (lot.kind === 'REFUND' ? 'Devolución' : 'Saldo Verde Bowl')}
                  </Text>

                  <Text style={styles.lotDate}>
                    {index === 0 ? 'Se usará primero · ' : ''}
                    {shortDate(lot.expiresAt)}
                  </Text>
                </View>

                <Text style={styles.lotAmount}>{money(lot.remainingAmount)}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.sectionTop}>
        <View style={styles.sectionText}>
          <Text style={styles.sectionEyebrow}>HISTORIAL VERIFICABLE</Text>

          <Text style={styles.sectionTitle}>Movimientos</Text>
        </View>
      </View>

      <View style={styles.filters}>
        <Chip label="Todos" selected={filter === 'ALL'} onPress={() => setFilter('ALL')} />

        <Chip label="Ingresos" selected={filter === 'IN'} onPress={() => setFilter('IN')} />

        <Chip label="Usos" selected={filter === 'OUT'} onPress={() => setFilter('OUT')} />
      </View>
    </View>
  );

  return (
    <ScreenScaffold
      title="Mi saldo"
      subtitle="Movimientos y beneficios"
      headerRight={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver los planes"
          onPress={() => router.push('/plans' as Href)}
          style={({ pressed }) => [styles.plansLink, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons
            name="star-four-points-outline"
            size={20}
            color={colors.brand700}
          />
        </Pressable>
      }
    >
      <FlatList
        data={visible}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        refreshControl={
          <RefreshControl
            refreshing={wallet.refreshing}
            onRefresh={refresh}
            tintColor={colors.brand600}
          />
        }
        renderItem={({ item }) => {
          const credit = CREDIT_TYPES.has(item.type);

          return (
            <View style={[styles.movement, shadow.sm]}>
              <View style={[styles.movementIcon, credit && styles.movementIconCredit]}>
                <MaterialCommunityIcons
                  name={credit ? 'arrow-down-left' : 'arrow-up-right'}
                  size={20}
                  color={credit ? colors.success : colors.inkMuted}
                />
              </View>

              <View style={styles.movementText}>
                <Text style={styles.movementName}>{item.description}</Text>

                <Text style={styles.movementDate}>{movementDate(item.createdAt)}</Text>
              </View>

              <View style={styles.movementAmounts}>
                <Text style={[styles.movementAmount, credit && styles.movementCredit]}>
                  {credit ? '+' : '−'}
                  {money(item.amount)}
                </Text>

                <Text style={styles.movementAfter}>Saldo {money(item.balanceAfter)}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          loadingHistory ? null : (
            <View style={[styles.card, styles.centered]}>
              <Text style={styles.cardTitle}>
                {filter === 'ALL'
                  ? 'Todavía no tienes movimientos'
                  : 'No hay movimientos de este tipo'}
              </Text>

              <Text style={styles.cardCopy}>
                Aquí aparecerá cada recarga y cada uso de tu saldo.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          <View style={styles.historyFooter}>
            {loadingHistory ? (
              <Skeleton height={68} rounded="md" count={2} gap={spacing.sm} />
            ) : historyError !== null ? (
              <View style={[styles.card, styles.centered]}>
                <Text style={styles.cardTitle}>No pudimos traer más movimientos</Text>

                <Text style={styles.cardCopy}>{historyError}</Text>

                <PrimaryButton
                  label="Reintentar"
                  variant="secondary"
                  onPress={() => void loadPage(loadedPages === 0 ? 1 : loadedPages + 1)}
                  style={styles.cardButton}
                />
              </View>
            ) : hasMore && transactions.length > 0 ? (
              <PrimaryButton label="Ver más movimientos" variant="secondary" onPress={loadMore} />
            ) : transactions.length > 0 ? (
              <Text style={styles.historyEnd}>Ese es todo tu historial.</Text>
            ) : null}
          </View>
        }
      />
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
  plansLink: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
  },
  balance: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  balanceIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand600,
  },
  balanceLabel: {
    ...type.label,
    color: colors.brand100,
    marginTop: spacing.md,
  },
  balanceAmount: {
    ...type.display,
    fontSize: 38,
    lineHeight: 44,
    color: colors.onDark,
    marginTop: 3,
  },
  balanceCopy: {
    ...type.bodySm,
    color: colors.onDarkMuted,
    marginTop: spacing.xs,
  },
  expiry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
    paddingTop: spacing.sm + spacing.xs,
    marginTop: spacing.md,
  },
  expiryText: {
    ...type.caption,
    color: colors.brand100,
  },
  composition: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    marginTop: spacing.sm + spacing.xs,
  },
  compositionCard: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.sm + spacing.xs,
  },
  bonusCard: {
    backgroundColor: '#fffaf0',
  },
  compositionLabel: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  compositionAmount: {
    ...type.heading,
    color: colors.ink,
    marginTop: 2,
  },
  share: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.sm + spacing.xs,
    marginTop: spacing.sm + spacing.xs,
  },
  shareLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  shareText: {
    ...type.caption,
    color: colors.inkMuted,
  },
  shareBar: {
    height: 8,
    backgroundColor: '#f2c66f',
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  sharePaid: {
    height: '100%',
    backgroundColor: colors.brand600,
  },
  useButton: {
    marginTop: spacing.sm + spacing.xs,
  },
  rules: {
    backgroundColor: colors.brand50,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  rulesTitle: {
    ...type.heading,
    color: colors.brand900,
    marginBottom: spacing.xs,
  },
  rule: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    marginTop: spacing.sm + spacing.xs,
  },
  ruleText: {
    flex: 1,
  },
  ruleTitle: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  ruleCopy: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },
  sectionTop: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm + spacing.xs,
  },
  sectionText: {
    flex: 1,
  },
  sectionEyebrow: {
    ...type.label,
    color: colors.brand600,
  },
  sectionTitle: {
    ...type.heading,
    color: colors.ink,
    marginTop: 3,
  },
  sectionCount: {
    ...type.heading,
    color: colors.brand700,
  },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.md,
    marginBottom: spacing.sm + spacing.xs,
  },
  centered: {
    alignItems: 'center',
  },
  cardTitle: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  cardCopy: {
    ...type.bodySm,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  cardButton: {
    marginTop: spacing.sm + spacing.xs,
    minWidth: 200,
  },
  planHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  planText: {
    flex: 1,
  },
  planName: {
    ...type.heading,
    color: colors.ink,
  },
  planExpiry: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },
  planAmounts: {
    flexDirection: 'row',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm + spacing.xs,
    marginTop: spacing.sm + spacing.xs,
  },
  planAmount: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.brand700,
  },
  planBenefit: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  planBenefitText: {
    ...type.bodySm,
    flex: 1,
    color: colors.ink,
  },
  lots: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    overflow: 'hidden',
  },
  lot: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    padding: spacing.sm + spacing.xs,
  },
  lotDivided: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  lotIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm + 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
  },
  lotIconBonus: {
    backgroundColor: '#fff7e5',
  },
  lotText: {
    flex: 1,
  },
  lotName: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  lotDate: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: 2,
  },
  lotAmount: {
    ...type.body,
    fontWeight: '800',
    color: colors.brand700,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm + spacing.xs,
  },
  movement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.sm + spacing.xs,
    marginBottom: spacing.sm,
  },
  movementIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm + 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  movementIconCredit: {
    backgroundColor: colors.brand50,
  },
  movementText: {
    flex: 1,
  },
  movementName: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.ink,
  },
  movementDate: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: 2,
  },
  movementAmounts: {
    alignItems: 'flex-end',
  },
  movementAmount: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  movementCredit: {
    color: colors.success,
  },
  movementAfter: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: 2,
  },
  historyFooter: {
    marginTop: spacing.xs,
  },
  historyEnd: {
    ...type.caption,
    color: colors.inkMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  pressed: {
    opacity: 0.75,
  },
});
