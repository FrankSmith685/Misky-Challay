import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Chip } from '../../src/components/Chip';
import { CoverageSummaryCard } from '../../src/components/CoverageSummaryCard';
import { EmptyState } from '../../src/components/EmptyState';
import { FormField } from '../../src/components/FormField';
import { FreeMap } from '../../src/components/map/FreeMap';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { invalidateResource, useResource } from '../../src/hooks/useResource';
import { usePurchase } from '../../src/providers/PurchaseProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { accountApi, type AddressInput } from '../../src/services/api/account.service';
import { geoApi } from '../../src/services/api/geo.service';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type { Address, CoverageResult } from '../../src/types/domain';

const ADDRESSES_KEY = 'account:addresses';
const LABEL_PRESETS = ['Casa', 'Trabajo', 'Otro'] as const;

interface MapPoint {
  latitude: number;
  longitude: number;
}

interface Geography {
  ubigeoCode: string | null;
  departmentName: string | null;
  provinceName: string | null;
  districtName: string | null;
}

/** Dos puntos son el mismo si difieren menos de ~1 m: el pin no se mueve solo. */
const samePoint = (a: MapPoint | null, b: MapPoint | null): boolean => {
  if (!a || !b) return a === b;
  return Math.abs(a.latitude - b.latitude) < 0.00001 && Math.abs(a.longitude - b.longitude) < 0.00001;
};

/**
 * Edición de una dirección guardada.
 *
 * Es la contraparte del alta: aquí no se recorre otra vez el árbol geográfico,
 * se ajusta lo que ya existe. Si el pin se mueve, la zona vuelve a salir de las
 * coordenadas y la cobertura debe validarse de nuevo antes de guardar, porque un
 * punto nuevo puede caer en otra zona o fuera del reparto.
 */
export default function EditAddressScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const addressId = Number(params.id);
  const { status } = useSession();
  const purchase = usePurchase();
  const toast = useToast();

  const isAuthenticated = status === 'authenticated';

  const addresses = useResource<Address[]>({
    key: isAuthenticated ? ADDRESSES_KEY : null,
    fetcher: () => accountApi.addresses(),
  });

  const original = useMemo(
    () => (addresses.data ?? []).find((row) => row.id === addressId) ?? null,
    [addressId, addresses.data],
  );

  const [label, setLabel] = useState('');
  const [line1, setLine1] = useState('');
  const [reference, setReference] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [point, setPoint] = useState<MapPoint | null>(null);
  const [geography, setGeography] = useState<Geography>({
    ubigeoCode: null,
    departmentName: null,
    provinceName: null,
    districtName: null,
  });

  const [coverage, setCoverage] = useState<CoverageResult | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** Evita que una recarga de la lista pise lo que el cliente está escribiendo. */
  const [loadedId, setLoadedId] = useState<number | null>(null);

  useEffect(() => {
    if (!original || loadedId === original.id) return;

    setLabel(original.label);
    setLine1(original.line1);
    setReference(original.reference ?? '');
    setIsDefault(original.isDefault);
    setPoint(
      original.latitude !== null && original.longitude !== null
        ? { latitude: original.latitude, longitude: original.longitude }
        : null,
    );
    setGeography({
      ubigeoCode: original.ubigeoCode,
      departmentName: original.departmentName,
      provinceName: original.provinceName,
      districtName: original.districtName,
    });
    setCoverage(null);
    setLoadedId(original.id);
  }, [loadedId, original]);

  const originalPoint = useMemo<MapPoint | null>(
    () =>
      original && original.latitude !== null && original.longitude !== null
        ? { latitude: original.latitude, longitude: original.longitude }
        : null,
    [original],
  );

  /** Si cambió el punto o la vía, la cobertura anterior ya no sirve como prueba. */
  const locationChanged =
    !samePoint(point, originalPoint) || line1.trim() !== (original?.line1 ?? '').trim();

  const needsCoverage = locationChanged && coverage === null;

  const movePin = async (next: MapPoint) => {
    setPoint(next);
    setCoverage(null);
    setLocating(true);
    setError('');
    try {
      const resolved = await geoApi.reverse(next);
      if (!resolved) {
        setError('Movimos el pin, pero no reconocimos la vía. Ajusta la dirección a mano.');
        return;
      }

      setLine1(resolved.line1);
      setGeography({
        ubigeoCode: resolved.ubigeoCode,
        departmentName: resolved.region ?? null,
        provinceName: resolved.province ?? null,
        districtName: resolved.district ?? null,
      });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos resolver ese punto.');
    } finally {
      setLocating(false);
    }
  };

  const validate = async () => {
    if (!point) {
      setError('Marca el punto exacto en el mapa antes de comprobar la cobertura.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const result = await geoApi.coverage(point);
      setCoverage(result);
      if (result.covered) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setError('');
        toast.show({
          message: 'Puedes guardar el cambio, pero esa dirección no estará disponible para delivery.',
          tone: 'warning',
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos validar la cobertura.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!original) return;
    if (label.trim().length < 2) {
      setError('Ponle un nombre de al menos dos letras.');
      return;
    }
    if (line1.trim().length < 5) {
      setError('La dirección debe estar completa.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const changes: Partial<AddressInput> = {
        label: label.trim().slice(0, 50),
        line1: line1.trim(),
        reference: reference.trim() || undefined,
        isDefault,
      };

      if (locationChanged && point) {
        changes.latitude = point.latitude;
        changes.longitude = point.longitude;
        changes.ubigeoCode = geography.ubigeoCode;
        changes.departmentName = geography.departmentName;
        changes.provinceName = geography.provinceName;
        changes.districtName = geography.districtName;
      }

      const updated = await accountApi.updateAddress(original.id, changes);
      invalidateResource(ADDRESSES_KEY);

      // Si es la dirección con la que se está comprando, la sede se rehace con
      // la cobertura recién validada; si no cambió de sitio, se deja como estaba.
      if (purchase.address?.id === original.id) {
        if (locationChanged && !coverage?.covered) {
          await purchase.selectDeliveryAddress(null);
        } else {
          await purchase.selectDeliveryAddress(
            updated,
            locationChanged ? coverage : purchase.coverage,
          );
        }
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({
        message: coverage && !coverage.covered
          ? 'Dirección actualizada; no se usará para delivery mientras siga fuera de cobertura.'
          : 'Dirección actualizada.',
        tone: coverage && !coverage.covered ? 'info' : 'success',
      });

      if (router.canGoBack()) router.back();
      else router.replace('/addresses' as Href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos guardar los cambios.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!original) return;

    setBusy(true);
    try {
      await accountApi.deleteAddress(original.id);
      invalidateResource(ADDRESSES_KEY);
      if (purchase.address?.id === original.id) await purchase.selectDeliveryAddress(null);
      toast.show({ message: 'Dirección eliminada.', tone: 'success' });

      if (router.canGoBack()) router.back();
      else router.replace('/addresses' as Href);
    } catch (caught) {
      setBusy(false);
      toast.show({
        message: caught instanceof Error ? caught.message : 'No pudimos eliminarla.',
        tone: 'error',
      });
    }
  };

  const confirmRemove = () => {
    Alert.alert('Eliminar dirección', `¿Eliminamos “${label || 'esta dirección'}”?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => void remove() },
    ]);
  };

  if (!isAuthenticated) {
    return (
      <ScreenScaffold title="Editar dirección" showBack>
        <EmptyState
          icon="shield-lock-outline"
          title="Tus direcciones son privadas"
          message="Inicia sesión para editarlas."
          actionLabel="Iniciar sesión"
          onAction={() =>
            router.replace({ pathname: '/(auth)/login', params: { returnTo: '/addresses' } })
          }
        />
      </ScreenScaffold>
    );
  }

  if (addresses.loading && !original) {
    return (
      <ScreenScaffold title="Editar dirección" showBack>
        <View style={styles.loading}>
          <Skeleton height={72} rounded="md" count={4} gap={spacing.md} />
        </View>
      </ScreenScaffold>
    );
  }

  if (!original) {
    return (
      <ScreenScaffold title="Editar dirección" showBack>
        <EmptyState
          icon="map-marker-question-outline"
          title="No encontramos esa dirección"
          message="Puede que la hayas eliminado desde otro dispositivo."
          actionLabel="Ver mis direcciones"
          onAction={() => router.replace('/addresses' as Href)}
        />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold
      title="Editar dirección"
      subtitle={original.label}
      showBack
      footer={
        <View style={styles.footer}>
          <PrimaryButton
            label={needsCoverage ? 'Comprobar cobertura' : 'Guardar cambios'}
            loading={busy}
            disabled={locating}
            onPress={() => void (needsCoverage ? validate() : save())}
          />
        </View>
      }
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {point ? (
            <View style={styles.mapCard}>
              <FreeMap
                style={styles.map}
                center={point}
                marker={point}
                zoom={17}
                onPress={(coordinate) => void movePin(coordinate)}
                onMarkerDragEnd={(coordinate) => void movePin(coordinate)}
              />

              <View style={styles.mapHint}>
                {locating ? (
                  <ActivityIndicator color={colors.brand600} />
                ) : (
                  <MaterialCommunityIcons name="gesture-tap" size={18} color={colors.brand700} />
                )}

                <Text style={styles.mapHintText}>
                  {locating
                    ? 'Identificando la zona del pin…'
                    : 'Arrastra el pin si la entrada está en otro punto.'}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.noPoint}>
              <MaterialCommunityIcons
                name="map-marker-alert-outline"
                size={22}
                color={colors.warning}
              />

              <Text style={styles.noPointText}>
                Esta dirección no tiene un punto exacto guardado. Usa GPS al crearla nuevamente para que el repartidor no tenga que adivinar.
              </Text>
            </View>
          )}

          <View style={styles.zone}>
            <Text style={styles.zoneLabel}>ZONA</Text>

            <Text style={styles.zoneValue}>
              {[geography.districtName, geography.provinceName, geography.departmentName]
                .filter(Boolean)
                .join(' · ') || 'Sin zona registrada'}
            </Text>

            {geography.ubigeoCode ? (
              <Text style={styles.zoneCode}>UBIGEO {geography.ubigeoCode}</Text>
            ) : null}
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>¿Cómo la llamamos?</Text>

            <View style={styles.chips}>
              {LABEL_PRESETS.map((preset) => (
                <Chip
                  key={preset}
                  label={preset}
                  selected={label === preset}
                  onPress={() => setLabel(preset === 'Otro' ? '' : preset)}
                />
              ))}
            </View>

            <FormField
              label="Nombre de la dirección"
              value={label}
              onChangeText={setLabel}
              placeholder="Casa, trabajo, casa de mamá…"
              icon="tag-outline"
              maxLength={50}
            />
          </View>

          <FormField
            label="Dirección exacta"
            value={line1}
            onChangeText={setLine1}
            placeholder="Av. Arequipa 1234"
            icon="map-search-outline"
            hint="Si la corriges a mano, comprobaremos la cobertura otra vez"
            maxLength={200}
          />

          <FormField
            label="Referencia"
            value={reference}
            onChangeText={setReference}
            placeholder="Puerta verde, frente al parque…"
            icon="sign-direction"
            maxLength={200}
          />

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isDefault }}
            onPress={() => {
              void Haptics.selectionAsync();
              setIsDefault((value) => !value);
            }}
            style={({ pressed }) => [styles.defaultRow, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons
              name={isDefault ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={24}
              color={colors.brand600}
            />

            <View style={styles.defaultCopy}>
              <Text style={styles.defaultTitle}>Usar como dirección principal</Text>

              <Text style={styles.defaultText}>
                Es la que proponemos al abrir el pedido en cualquier dispositivo.
              </Text>
            </View>
          </Pressable>

          {coverage ? <CoverageSummaryCard result={coverage} /> : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <PrimaryButton
            label="Eliminar esta dirección"
            variant="ghost"
            disabled={busy}
            onPress={confirmRemove}
            style={styles.remove}
          />
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
    gap: spacing.md,
  },
  loading: {
    paddingHorizontal: spacing.md,
  },
  mapCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadow.sm,
  },
  map: {
    width: '100%',
    height: 260,
  },
  mapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + spacing.xs,
  },
  mapHintText: {
    ...type.bodySm,
    flex: 1,
    color: colors.brand700,
  },
  noPoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    borderRadius: radius.md,
    backgroundColor: '#fff8e8',
    padding: spacing.md - 2,
  },
  noPointText: {
    ...type.bodySm,
    flex: 1,
    color: '#795214',
  },
  zone: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    padding: spacing.md - 2,
  },
  zoneLabel: {
    ...type.label,
    color: colors.inkMuted,
  },
  zoneValue: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
    marginTop: spacing.xs,
  },
  zoneCode: {
    ...type.caption,
    color: colors.brand700,
    marginTop: spacing.xs,
  },
  block: {
    gap: spacing.sm,
  },
  blockTitle: {
    ...type.heading,
    color: colors.ink,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  defaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    minHeight: layout.minTouch + 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: spacing.md - 2,
  },
  defaultCopy: {
    flex: 1,
  },
  defaultTitle: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.ink,
  },
  defaultText: {
    ...type.caption,
    fontWeight: '500',
    color: colors.inkMuted,
    marginTop: 3,
  },
  errorBox: {
    borderRadius: radius.md,
    backgroundColor: '#fff0f0',
    padding: spacing.md - 2,
  },
  errorText: {
    ...type.bodySm,
    color: colors.danger,
  },
  remove: {
    marginTop: spacing.xs,
  },
  footer: {
    paddingBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.85,
  },
});
