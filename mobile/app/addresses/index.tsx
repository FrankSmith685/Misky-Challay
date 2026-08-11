import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../../src/components/EmptyState';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { invalidateResource, useResource } from '../../src/hooks/useResource';
import { usePurchase } from '../../src/providers/PurchaseProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { accountApi } from '../../src/services/api/account.service';
import { colors, layout, radius, spacing, type } from '../../src/theme/tokens';
import type { Address } from '../../src/types/domain';

const ADDRESSES_KEY = 'account:addresses';

const iconFor = (label: string): keyof typeof MaterialCommunityIcons.glyphMap => {
  const normalized = label.toLowerCase();
  if (normalized.includes('trab') || normalized.includes('ofic')) return 'office-building-outline';
  if (normalized.includes('gim') || normalized.includes('univ')) return 'map-marker-outline';
  return 'home-outline';
};

/**
 * Libreta de direcciones. Además de crear y borrar, aquí se elige cuál se usa
 * ahora mismo: al hacerlo se valida la cobertura y queda fijada la cocina que
 * atiende, que es lo que el menú necesita para no ofrecer platos imposibles.
 */
export default function AddressesScreen() {
  const { status } = useSession();
  const purchase = usePurchase();
  const toast = useToast();

  /** Id de la fila con una operación en curso: solo se bloquea esa tarjeta. */
  const [busyId, setBusyId] = useState<number | null>(null);

  const isAuthenticated = status === 'authenticated';

  const addresses = useResource<Address[]>({
    key: isAuthenticated ? ADDRESSES_KEY : null,
    fetcher: () => accountApi.addresses(),
  });

  const rows = addresses.data ?? [];

  const use = async (row: Address) => {
    setBusyId(row.id);
    try {
      const result = await purchase.selectDeliveryAddress(row);
      if (result?.covered) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        toast.show({
          message: `Entregamos en “${row.label}”. Te atiende ${result.branch?.name ?? 'la cocina más cercana'}.`,
          tone: 'success',
        });
        return;
      }
      toast.show({
        message: result?.reason ?? 'Todavía no llegamos a esa dirección.',
        tone: 'error',
      });
    } catch (caught) {
      toast.show({
        message: caught instanceof Error ? caught.message : 'No pudimos validar la cobertura.',
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const makeDefault = async (row: Address) => {
    setBusyId(row.id);
    try {
      await accountApi.updateAddress(row.id, { isDefault: true });
      invalidateResource(ADDRESSES_KEY);
      void Haptics.selectionAsync();
      toast.show({ message: `“${row.label}” es tu dirección principal.`, tone: 'success' });
    } catch (caught) {
      toast.show({
        message: caught instanceof Error ? caught.message : 'No pudimos guardar el cambio.',
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemove = (row: Address) => {
    // Borrar es irreversible: es de las pocas cosas que sí merecen un Alert.
    Alert.alert('Eliminar dirección', `¿Eliminamos “${row.label}”?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => void remove(row),
      },
    ]);
  };

  const remove = async (row: Address) => {
    setBusyId(row.id);
    try {
      await accountApi.deleteAddress(row.id);
      invalidateResource(ADDRESSES_KEY);
      // Si era la dirección del pedido en curso, el contexto se queda sin destino
      // en vez de apuntar a algo que ya no existe.
      if (purchase.address?.id === row.id) await purchase.selectDeliveryAddress(null);
      toast.show({ message: 'Dirección eliminada.', tone: 'success' });
    } catch (caught) {
      toast.show({
        message: caught instanceof Error ? caught.message : 'No pudimos eliminarla.',
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <ScreenScaffold title="Mis direcciones" showBack>
        <EmptyState
          icon="shield-lock-outline"
          title="Tus direcciones son privadas"
          message="Inicia sesión para verlas, editarlas o guardar una nueva."
          actionLabel="Iniciar sesión"
          onAction={() =>
            router.push({ pathname: '/(auth)/login', params: { returnTo: '/addresses' } })
          }
          secondaryLabel="Ver hasta dónde llegamos"
          onSecondary={() => router.push('/cobertura' as Href)}
        />
      </ScreenScaffold>
    );
  }

  const renderItem = ({ item }: { item: Address }) => {
    const active = purchase.address?.id === item.id;
    const busy = busyId === item.id;

    return (
      <View style={[styles.card, active && styles.cardActive]}>
        <View style={styles.cardTop}>
          <View style={[styles.pin, active && styles.pinActive]}>
            <MaterialCommunityIcons
              name={iconFor(item.label)}
              size={21}
              color={active ? colors.surface : colors.brand700}
            />
          </View>

          <View style={styles.cardCopy}>
            <View style={styles.labelLine}>
              <Text style={styles.label}>{item.label}</Text>

              {item.isDefault ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>PRINCIPAL</Text>
                </View>
              ) : null}

              {active ? (
                <View style={[styles.badge, styles.badgeActive]}>
                  <Text style={[styles.badgeText, styles.badgeTextActive]}>EN USO</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.line}>{item.line1}</Text>

            <Text style={styles.district}>
              {[item.districtName, item.provinceName].filter(Boolean).join(' · ')}
            </Text>

            {item.reference ? <Text style={styles.reference}>Ref. {item.reference}</Text> : null}
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Usar ${item.label} para la entrega`}
            disabled={busy}
            onPress={() => void use(item)}
            style={({ pressed }) => [styles.action, styles.actionMain, pressed && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator color={colors.brand700} />
            ) : (
              <>
                <MaterialCommunityIcons
                  name="truck-fast-outline"
                  size={18}
                  color={colors.brand700}
                />

                <Text style={styles.actionText}>Usar aquí</Text>
              </>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Editar ${item.label}`}
            disabled={busy}
            onPress={() => router.push(`/addresses/${item.id}` as Href)}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.ink} />

            <Text style={[styles.actionText, styles.actionTextNeutral]}>Editar</Text>
          </Pressable>

          {!item.isDefault ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Marcar ${item.label} como principal`}
              disabled={busy}
              onPress={() => void makeDefault(item)}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="star-outline" size={18} color={colors.ink} />

              <Text style={[styles.actionText, styles.actionTextNeutral]}>Principal</Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Eliminar ${item.label}`}
            disabled={busy}
            hitSlop={layout.iconHitSlop}
            onPress={() => confirmRemove(item)}
            style={({ pressed }) => [styles.action, styles.actionDanger, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>
      </View>
    );
  };

  const header = (
    <View style={styles.notice}>
      <MaterialCommunityIcons name="map-marker-check-outline" size={22} color={colors.brand700} />

      <Text style={styles.noticeText}>
        Cada dirección se valida contra la cobertura vigente antes de usarse, así que la cocina
        asignada siempre es la que puede atenderte.
      </Text>
    </View>
  );

  return (
    <ScreenScaffold
      title="Mis direcciones"
      subtitle="Dónde recibes tus pedidos"
      showBack
      headerRight={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Agregar dirección"
          onPress={() => router.push('/addresses/new' as Href)}
          style={({ pressed }) => [styles.add, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="plus" size={22} color={colors.surface} />
        </Pressable>
      }
      footer={
        rows.length > 0 ? (
          <View style={styles.footer}>
            <PrimaryButton
              label="Agregar otra dirección"
              variant="secondary"
              onPress={() => router.push('/addresses/new' as Href)}
            />
          </View>
        ) : undefined
      }
    >
      {addresses.loading ? (
        <View style={styles.loading}>
          {header}

          <Skeleton height={160} rounded="md" count={3} gap={spacing.sm + spacing.xs} />
        </View>
      ) : addresses.error && rows.length === 0 ? (
        <EmptyState
          icon="cloud-alert-outline"
          title="No pudimos cargar tus direcciones"
          message={addresses.error.message}
          actionLabel="Reintentar"
          onAction={() => void addresses.refetch()}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              icon="map-marker-plus-outline"
              title="Aún no guardaste una dirección"
              message="Agrega tu casa u oficina y comprobamos si llegamos."
              actionLabel="Agregar dirección"
              onAction={() => router.push('/addresses/new' as Href)}
              secondaryLabel="Ver hasta dónde llegamos"
              onSecondary={() => router.push('/cobertura' as Href)}
            />
          }
          contentContainerStyle={styles.list}
          refreshing={addresses.refreshing}
          onRefresh={() => void addresses.refresh()}
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
  loading: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm + spacing.xs,
  },
  add: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand600,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.brand50,
    padding: spacing.md - 2,
  },
  noticeText: {
    ...type.bodySm,
    flex: 1,
    color: colors.brand700,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: spacing.md - 2,
    gap: spacing.sm + spacing.xs,
  },
  cardActive: {
    borderColor: colors.brand600,
    backgroundColor: colors.brand50,
  },
  cardTop: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
  },
  pin: {
    width: 44,
    height: 44,
    borderRadius: radius.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
  },
  pinActive: {
    backgroundColor: colors.brand600,
  },
  cardCopy: {
    flex: 1,
    gap: 3,
  },
  labelLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  label: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  badge: {
    borderRadius: radius.pill,
    backgroundColor: colors.brand100,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeActive: {
    backgroundColor: colors.brand600,
  },
  badgeText: {
    ...type.caption,
    color: colors.brand700,
  },
  badgeTextActive: {
    color: colors.surface,
  },
  line: {
    ...type.bodySm,
    color: colors.ink,
  },
  district: {
    ...type.caption,
    color: colors.brand700,
  },
  reference: {
    ...type.caption,
    fontWeight: '500',
    color: colors.inkMuted,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    paddingTop: spacing.sm + spacing.xs,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    minHeight: layout.minTouch,
    minWidth: layout.minTouch,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + spacing.xs,
  },
  actionMain: {
    borderColor: colors.brand600,
    backgroundColor: colors.brand50,
  },
  actionDanger: {
    borderColor: '#f0d2d2',
    marginLeft: 'auto',
  },
  actionText: {
    ...type.label,
    color: colors.brand700,
  },
  actionTextNeutral: {
    color: colors.ink,
  },
  footer: {
    paddingBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.85,
  },
});
