import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../src/components/EmptyState';
import { CoverageSummaryCard } from '../src/components/CoverageSummaryCard';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { ScreenScaffold } from '../src/components/ScreenScaffold';
import { Skeleton } from '../src/components/Skeleton';
import { useResource } from '../src/hooks/useResource';
import { usePurchase } from '../src/providers/PurchaseProvider';
import { useSession } from '../src/providers/SessionProvider';
import { useToast } from '../src/providers/ToastProvider';
import { accountApi } from '../src/services/api/account.service';
import { geoApi } from '../src/services/api/geo.service';
import { colors, layout, radius, shadow, spacing, type } from '../src/theme/tokens';
import type { Address, Branch, CoverageResult, ServiceMode } from '../src/types/domain';

interface ModeOption {
  value: ServiceMode;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  copy: string;
}

const MODES: ModeOption[] = [
  {
    value: 'DELIVERY',
    icon: 'bike-fast',
    title: 'Delivery',
    copy: 'Te lo llevamos',
  },
  {
    value: 'PICKUP',
    icon: 'shopping-outline',
    title: 'Recojo',
    copy: 'Retiras en el local',
  },
  {
    value: 'DINE_IN',
    icon: 'silverware-fork-knife',
    title: 'En salón',
    copy: 'Comes con nosotros',
  },
];

/**
 * Contexto del pedido: modalidad y destino.
 *
 * En delivery la sede la decide la cobertura de la dirección elegida, no el
 * cliente: aquí se consulta y se muestra antes de guardar, para que el menú y el
 * carrito trabajen desde el primer momento con la cocina correcta. Nada se
 * aplica hasta pulsar el botón: mirar no cambia el pedido.
 */
export default function LocationScreen() {
  const purchase = usePurchase();
  const { status } = useSession();
  const toast = useToast();

  const [mode, setMode] = useState<ServiceMode>(purchase.serviceMode);
  const [branchId, setBranchId] = useState<number | null>(purchase.branch?.id ?? null);
  const [addressId, setAddressId] = useState<number | null>(purchase.address?.id ?? null);
  const [coverage, setCoverage] = useState<CoverageResult | null>(purchase.coverage);
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [coverageError, setCoverageError] = useState('');

  /** La última cobertura pedida manda: una respuesta lenta no pisa otra dirección. */
  const coverageTurn = useRef(0);

  const isAuthenticated = status === 'authenticated';

  const addresses = useResource<Address[]>({
    key: isAuthenticated ? 'account:addresses' : null,
    fetcher: () => accountApi.addresses(),
  });

  const addressRows = useMemo(() => addresses.data ?? [], [addresses.data]);

  const branchRows = useMemo(
    () => (mode === 'PICKUP' ? purchase.branches.filter((row) => row.acceptsPickup) : purchase.branches),
    [mode, purchase.branches],
  );

  const checkCoverage = useCallback(
    async (row: Address) => {
      coverageTurn.current += 1;
      const turn = coverageTurn.current;

      setCheckingId(row.id);
      setCoverage(null);
      setCoverageError('');

      try {
        const result = await geoApi.coverage({
          districtId: row.districtId ?? undefined,
          latitude: row.latitude ?? undefined,
          longitude: row.longitude ?? undefined,
        });
        if (turn !== coverageTurn.current) return;

        setCoverage(result);
        if (!result.covered) {
          setCoverageError(result.reason ?? 'Todavía no llegamos a esta dirección.');
        }
      } catch (caught) {
        if (turn !== coverageTurn.current) return;
        setCoverageError(
          caught instanceof Error ? caught.message : 'No pudimos validar la cobertura.',
        );
      } finally {
        if (turn === coverageTurn.current) setCheckingId(null);
      }
    },
    [],
  );

  const chooseMode = (next: ServiceMode) => {
    if (next === mode) return;
    void Haptics.selectionAsync();
    setMode(next);
    setCoverageError('');
  };

  const chooseAddress = (row: Address) => {
    void Haptics.selectionAsync();
    setAddressId(row.id);
    void checkCoverage(row);
  };

  const chooseBranch = (row: Branch) => {
    void Haptics.selectionAsync();
    setBranchId(row.id);
    setCoverageError('');
  };

  const selectedAddress = useMemo(
    () => addressRows.find((row) => row.id === addressId) ?? null,
    [addressId, addressRows],
  );

  const save = async () => {
    if (mode === 'DELIVERY') {
      if (!isAuthenticated) {
        router.push({ pathname: '/(auth)/login', params: { returnTo: '/location' } });
        return;
      }
      if (!selectedAddress) {
        toast.show({ message: 'Elige la dirección donde recibirás el pedido.', tone: 'warning' });
        return;
      }
      if (checkingId !== null) {
        toast.show({ message: 'Estamos comprobando la cobertura…', tone: 'info' });
        return;
      }
      if (!coverage?.covered) {
        toast.show({
          message: coverageError || 'Esa dirección todavía no tiene cobertura.',
          tone: 'error',
        });
        return;
      }

      // La cobertura ya está resuelta: se entrega hecha para no repetir la consulta.
      await purchase.selectDeliveryAddress(selectedAddress, coverage);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({
        message: `Te atiende ${coverage.branch?.name ?? 'la cocina más cercana'}.`,
        tone: 'success',
      });
      router.back();
      return;
    }

    if (!branchId) {
      toast.show({
        message: mode === 'PICKUP' ? 'Elige dónde recogerás.' : 'Elige el restaurante.',
        tone: 'warning',
      });
      return;
    }

    purchase.setServiceMode(mode);
    purchase.selectBranch(branchId);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (mode === 'DINE_IN') {
      router.replace('/scan-table' as Href);
      return;
    }
    router.back();
  };

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.modeGrid}>
        {MODES.map((item) => {
          const active = mode === item.value;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${item.title}. ${item.copy}`}
              onPress={() => chooseMode(item.value)}
              style={({ pressed }) => [
                styles.mode,
                active && styles.modeActive,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.modeIcon, active && styles.modeIconActive]}>
                <MaterialCommunityIcons
                  name={item.icon}
                  size={22}
                  color={active ? colors.surface : colors.brand700}
                />
              </View>

              <Text style={[styles.modeTitle, active && styles.modeTitleActive]}>{item.title}</Text>

              <Text style={[styles.modeCopy, active && styles.modeCopyActive]}>{item.copy}</Text>

              {active ? (
                <View style={styles.check}>
                  <MaterialCommunityIcons name="check" size={14} color={colors.surface} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {mode === 'DELIVERY'
            ? '¿A dónde lo llevamos?'
            : mode === 'PICKUP'
              ? 'Elige dónde recoger'
              : 'Elige el restaurante'}
        </Text>

        <Text style={styles.sectionCopy}>
          {mode === 'DELIVERY'
            ? 'Validamos la cobertura de la dirección para asignar la cocina que te atiende.'
            : `${branchRows.length} ${branchRows.length === 1 ? 'local disponible' : 'locales disponibles'}`}
        </Text>
      </View>

      {mode !== 'DELIVERY' && purchase.error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{purchase.error}</Text>

          <Pressable
            accessibilityRole="button"
            hitSlop={layout.iconHitSlop}
            onPress={() => void purchase.reloadBranches()}
          >
            <Text style={styles.retry}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const coverageCard = (
    <View style={styles.coverageSlot}>
      {checkingId !== null ? (
        <View style={styles.coverageChecking}>
          <ActivityIndicator color={colors.brand600} />

          <Text style={styles.coverageCheckingText}>Comprobando cobertura…</Text>
        </View>
      ) : coverage ? (
        <CoverageSummaryCard
          result={coverage}
          onSelectPickup={(pickup) => {
            setMode('PICKUP');
            setBranchId(pickup.id);
            setCoverageError('');
            toast.show({ message: `Recojo seleccionado en ${pickup.name}.`, tone: 'success' });
          }}
        />
      ) : coverageError ? (
        <View style={[styles.coverageCard, styles.coverageBad]}>
          <MaterialCommunityIcons name="map-marker-off-outline" size={26} color={colors.danger} />

          <View style={styles.coverageCopy}>
            <Text style={styles.coverageTitle}>Fuera de cobertura</Text>

            <Text style={styles.coverageDetail}>{coverageError}</Text>

          </View>
        </View>
      ) : null}
    </View>
  );

  const deliveryFooterLinks = (
    <View style={styles.links}>
      <PrimaryButton
        label="Agregar una dirección"
        variant="secondary"
        onPress={() => router.push('/addresses/new' as Href)}
      />

      <PrimaryButton
        label="Ver hasta dónde llegamos"
        variant="ghost"
        onPress={() => router.push('/cobertura' as Href)}
      />
    </View>
  );

  const renderAddress = ({ item }: { item: Address }) => {
    const active = addressId === item.id;
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${item.label}. ${item.line1}`}
        onPress={() => chooseAddress(item)}
        style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && styles.pressed]}
      >
        <View style={[styles.rowIcon, active && styles.rowIconActive]}>
          <MaterialCommunityIcons
            name={item.label.toLowerCase().includes('trab') ? 'office-building-outline' : 'home-outline'}
            size={21}
            color={active ? colors.surface : colors.brand700}
          />
        </View>

        <View style={styles.rowCopy}>
          <View style={styles.rowLabelLine}>
            <Text style={styles.rowTitle}>{item.label}</Text>

            {item.isDefault ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>PRINCIPAL</Text>
              </View>
            ) : null}
          </View>

          <Text numberOfLines={2} style={styles.rowText}>
            {item.line1}
          </Text>

          <Text style={styles.rowMeta}>
            {[item.districtName, item.provinceName].filter(Boolean).join(' · ')}
          </Text>
        </View>

        <MaterialCommunityIcons
          name={active ? 'radiobox-marked' : 'radiobox-blank'}
          size={22}
          color={active ? colors.brand600 : '#9aa59f'}
        />
      </Pressable>
    );
  };

  const renderBranch = ({ item }: { item: Branch }) => {
    const active = branchId === item.id;
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${item.name}. ${item.addressLine}`}
        onPress={() => chooseBranch(item)}
        style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && styles.pressed]}
      >
        <View style={[styles.rowIcon, active && styles.rowIconActive]}>
          <MaterialCommunityIcons
            name="storefront-outline"
            size={21}
            color={active ? colors.surface : colors.brand700}
          />
        </View>

        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>{item.name}</Text>

          <Text numberOfLines={2} style={styles.rowText}>
            {item.addressLine}
          </Text>

          <Text style={styles.rowMeta}>Preparación aproximada: {item.prepMinutes} min</Text>
        </View>

        <MaterialCommunityIcons
          name={active ? 'radiobox-marked' : 'radiobox-blank'}
          size={22}
          color={active ? colors.brand600 : '#9aa59f'}
        />
      </Pressable>
    );
  };

  const deliveryEmpty = (): ReactElement => {
    if (!isAuthenticated) {
      return (
        <EmptyState
          icon="account-arrow-right-outline"
          title="Entra para usar tus direcciones"
          message="Tus direcciones guardadas son privadas. También puedes comprobar la cobertura sin cuenta."
          actionLabel="Iniciar sesión"
          onAction={() =>
            router.push({ pathname: '/(auth)/login', params: { returnTo: '/location' } })
          }
          secondaryLabel="Ver hasta dónde llegamos"
          onSecondary={() => router.push('/cobertura' as Href)}
          fill={false}
        />
      );
    }

    if (addresses.loading) {
      return (
        <View style={styles.skeletonGroup}>
          <Skeleton height={92} rounded="md" count={3} gap={spacing.sm + spacing.xs} />
        </View>
      );
    }

    if (addresses.error) {
      return (
        <EmptyState
          icon="cloud-alert-outline"
          title="No pudimos cargar tus direcciones"
          message={addresses.error.message}
          actionLabel="Reintentar"
          onAction={() => void addresses.refetch()}
          fill={false}
        />
      );
    }

    return (
      <EmptyState
        icon="map-marker-plus-outline"
        title="Aún no tienes direcciones"
        message="Guarda dónde recibes el pedido y validamos la cobertura al momento."
        actionLabel="Agregar dirección"
        onAction={() => router.push('/addresses/new' as Href)}
        secondaryLabel="Ver hasta dónde llegamos"
        onSecondary={() => router.push('/cobertura' as Href)}
        fill={false}
      />
    );
  };

  const ctaLabel = mode === 'DINE_IN' ? 'Escanear el QR de mi mesa' : 'Guardar selección';

  return (
    <ScreenScaffold
      title="¿Cómo comerás hoy?"
      subtitle="Elige la modalidad y el destino"
      showBack
      onBack={() => router.back()}
      footer={
        <View style={styles.footer}>
          <PrimaryButton label={ctaLabel} onPress={() => void save()} />
        </View>
      }
    >
      {mode === 'DELIVERY' ? (
        <FlatList
          data={addressRows}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderAddress}
          ListHeaderComponent={header}
          ListEmptyComponent={deliveryEmpty()}
          ListFooterComponent={
            <View>
              {addressId !== null ? coverageCard : null}

              {addressRows.length > 0 ? deliveryFooterLinks : null}
            </View>
          }
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshing={addresses.refreshing}
          onRefresh={isAuthenticated ? () => void addresses.refresh() : undefined}
        />
      ) : (
        <FlatList
          data={branchRows}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderBranch}
          ListHeaderComponent={header}
          ListEmptyComponent={
            purchase.isLoading ? (
              <View style={styles.skeletonGroup}>
                <Skeleton height={92} rounded="md" count={3} gap={spacing.sm + spacing.xs} />
              </View>
            ) : (
              <EmptyState
                icon="storefront-outline"
                title="No hay locales disponibles"
                message="Vuelve a intentarlo en un momento o escríbenos si el problema sigue."
                actionLabel="Reintentar"
                onAction={() => void purchase.reloadBranches()}
                fill={false}
              />
            )
          }
          ListFooterComponent={
            mode === 'DINE_IN' ? (
              <View style={styles.qrNote}>
                <MaterialCommunityIcons name="qrcode-scan" size={24} color={colors.accent500} />

                <Text style={styles.qrText}>
                  Al llegar escanearás el QR de tu mesa y abriremos una comanda en el local correcto.
                </Text>
              </View>
            ) : null
          }
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm + spacing.xs,
  },
  headerBlock: {
    paddingTop: spacing.xs,
  },
  modeGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  mode: {
    flex: 1,
    minHeight: 132,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  modeActive: {
    backgroundColor: colors.brand800,
    borderColor: colors.brand800,
  },
  modeIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
  },
  modeIconActive: {
    backgroundColor: colors.brand600,
  },
  modeTitle: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.ink,
    marginTop: spacing.sm + 2,
  },
  modeTitleActive: {
    color: colors.onDark,
  },
  modeCopy: {
    ...type.caption,
    fontWeight: '500',
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: 3,
  },
  modeCopyActive: {
    color: colors.onDarkMuted,
  },
  check: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent600,
  },
  sectionHeader: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    ...type.heading,
    color: colors.ink,
  },
  sectionCopy: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    minHeight: 84,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: spacing.md - 2,
  },
  rowActive: {
    borderColor: colors.brand600,
    backgroundColor: colors.brand50,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
  },
  rowIconActive: {
    backgroundColor: colors.brand600,
  },
  rowCopy: {
    flex: 1,
    gap: 3,
  },
  rowLabelLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowTitle: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  rowText: {
    ...type.bodySm,
    color: colors.ink,
  },
  rowMeta: {
    ...type.caption,
    color: colors.brand700,
  },
  badge: {
    borderRadius: radius.pill,
    backgroundColor: colors.brand100,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    ...type.caption,
    color: colors.brand700,
  },
  coverageSlot: {
    marginTop: spacing.sm,
  },
  coverageChecking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  coverageCheckingText: {
    ...type.bodySm,
    color: colors.inkMuted,
  },
  coverageCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.sm,
  },
  coverageBad: {
    backgroundColor: '#fff0f0',
  },
  coverageCopy: {
    flex: 1,
  },
  coverageTitle: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  coverageDetail: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 3,
  },
  links: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  skeletonGroup: {
    marginTop: spacing.sm,
  },
  qrNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    borderRadius: radius.md,
    backgroundColor: '#fff8e8',
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  qrText: {
    ...type.bodySm,
    flex: 1,
    color: '#795214',
  },
  errorBox: {
    borderRadius: radius.md,
    backgroundColor: '#fff2f2',
    padding: spacing.md - 2,
    marginTop: spacing.sm,
  },
  errorText: {
    ...type.bodySm,
    color: colors.danger,
  },
  retry: {
    ...type.label,
    color: colors.brand700,
    marginTop: spacing.sm,
  },
  footer: {
    paddingBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.85,
  },
});
