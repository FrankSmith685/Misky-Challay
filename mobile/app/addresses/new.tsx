import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Chip } from '../../src/components/Chip';
import { CoverageSummaryCard } from '../../src/components/CoverageSummaryCard';
import { FormField } from '../../src/components/FormField';
import { FreeMap } from '../../src/components/map/FreeMap';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { invalidateResource } from '../../src/hooks/useResource';
import { usePurchase } from '../../src/providers/PurchaseProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { accountApi } from '../../src/services/api/account.service';
import { geoApi } from '../../src/services/api/geo.service';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type { AddressSuggestion, CoverageResult } from '../../src/types/domain';

interface GeoNode {
  code: string;
  name: string;
}

interface GeoDistrict extends GeoNode {
  latitude: number;
  longitude: number;
}

interface MapPoint {
  latitude: number;
  longitude: number;
}

type SelectorKind = 'department' | 'province' | 'district';

const LABEL_PRESETS = ['Casa', 'Trabajo', 'Otro'] as const;
const LIMA_CENTER: MapPoint = { latitude: -12.0464, longitude: -77.0428 };

const normalize = (value?: string | null): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** Selector de una lista larga (departamentos, provincias, distritos) con buscador. */
function SelectorModal<T extends GeoNode>({
  title,
  visible,
  rows,
  loading,
  onClose,
  onSelect,
}: {
  title: string;
  visible: boolean;
  rows: T[];
  loading: boolean;
  onClose: () => void;
  onSelect: (row: T) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = rows.filter((row) => normalize(row.name).includes(normalize(search)));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modal}>
        <View style={styles.modalTop}>
          <Text style={styles.modalTitle}>{title}</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            hitSlop={layout.iconHitSlop}
            onPress={onClose}
            style={styles.modalClose}
          >
            <MaterialCommunityIcons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>

        <View style={styles.search}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.inkMuted} />

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar…"
            placeholderTextColor="#87938d"
            style={styles.searchInput}
          />
        </View>

        {loading ? (
          <View style={styles.modalLoading}>
            <ActivityIndicator color={colors.brand600} />

            <Text style={styles.modalLoadingText}>Cargando…</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(row) => row.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSearch('');
                  onSelect(item);
                }}
                style={({ pressed }) => [styles.selectRow, pressed && styles.pressed]}
              >
                <Text style={styles.selectRowText}>{item.name}</Text>

                <MaterialCommunityIcons name="chevron-right" size={21} color="#9aa59f" />
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.modalEmpty}>No encontramos nada con ese nombre.</Text>
            }
          />
        )}
      </View>
    </Modal>
  );
}

/**
 * Alta de dirección.
 *
 * El punto exacto manda sobre lo que se escribe: al mover el pin se resuelve la
 * zona administrativa desde las coordenadas (igual que la web) y se limpia la
 * jerarquía anterior para no guardar un ubigeo viejo con un punto nuevo.
 * La cobertura que se valida antes de guardar se entrega al contexto de compra,
 * así la sede queda fijada sin repetir la consulta.
 */
export default function NewAddressScreen() {
  const { status } = useSession();
  const purchase = usePurchase();
  const toast = useToast();

  const [departments, setDepartments] = useState<GeoNode[]>([]);
  const [provinces, setProvinces] = useState<GeoNode[]>([]);
  const [districts, setDistricts] = useState<GeoDistrict[]>([]);
  const [department, setDepartment] = useState<GeoNode | null>(null);
  const [province, setProvince] = useState<GeoNode | null>(null);
  const [district, setDistrict] = useState<GeoDistrict | null>(null);
  const [selector, setSelector] = useState<SelectorKind | null>(null);
  const [loadingGeo, setLoadingGeo] = useState(false);

  const [labelPreset, setLabelPreset] = useState<string>(LABEL_PRESETS[0]);
  const [customLabel, setCustomLabel] = useState('');
  const [query, setQuery] = useState('');
  const [line1, setLine1] = useState('');
  const [reference, setReference] = useState('');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [point, setPoint] = useState<MapPoint | null>(null);
  const [isDefault, setIsDefault] = useState(false);

  const [coverage, setCoverage] = useState<CoverageResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const label = labelPreset === 'Otro' ? customLabel.trim() : labelPreset;

  useEffect(() => {
    if (status !== 'authenticated') {
      router.replace({ pathname: '/(auth)/login', params: { returnTo: '/addresses/new' } });
      return;
    }

    let active = true;
    void geoApi
      .departments()
      .then((rows) => {
        if (active) setDepartments(rows);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        // Sin catálogo geográfico el formulario se queda mudo justo antes de comprar:
        // se avisa y se ofrece el reintento en vez de dejar los selectores vacíos.
        setError(
          caught instanceof Error ? caught.message : 'No pudimos cargar las ubicaciones.',
        );
      });

    return () => {
      active = false;
    };
  }, [status]);

  const retryDepartments = async () => {
    setError('');
    try {
      setDepartments(await geoApi.departments());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos cargar las ubicaciones.');
    }
  };

  const chooseDepartment = async (row: GeoNode) => {
    setDepartment(row);
    setProvince(null);
    setDistrict(null);
    setProvinces([]);
    setDistricts([]);
    setSelector(null);
    setLoadingGeo(true);
    try {
      setProvinces(await geoApi.provinces(row.code));
    } catch (caught) {
      toast.show({
        message: caught instanceof Error ? caught.message : 'No pudimos cargar las provincias.',
        tone: 'error',
      });
    } finally {
      setLoadingGeo(false);
    }
  };

  const chooseProvince = async (row: GeoNode) => {
    setProvince(row);
    setDistrict(null);
    setDistricts([]);
    setSelector(null);
    setLoadingGeo(true);
    try {
      setDistricts(await geoApi.districts(row.code));
    } catch (caught) {
      toast.show({
        message: caught instanceof Error ? caught.message : 'No pudimos cargar los distritos.',
        tone: 'error',
      });
    } finally {
      setLoadingGeo(false);
    }
  };

  const chooseDistrict = (row: GeoDistrict) => {
    setDistrict(row);
    setPoint({ latitude: row.latitude, longitude: row.longitude });
    setLine1('');
    setCoverage(null);
    setSuggestions([]);
    setSelector(null);
  };

  /** El pin manda: la zona administrativa se rehace desde el punto resuelto. */
  const applyResolved = async (resolved: AddressSuggestion, next: MapPoint) => {
    setPoint(next);
    setLine1(resolved.line1);
    setQuery(resolved.line1);
    setSuggestions([]);
    setCoverage(null);

    setDepartment(null);
    setProvince(null);
    setDistrict(null);
    setProvinces([]);
    setDistricts([]);

    const nextDepartment = departments.find(
      (row) => normalize(row.name) === normalize(resolved.region),
    );
    if (!nextDepartment) return;

    const nextProvinces = await geoApi.provinces(nextDepartment.code);
    setDepartment(nextDepartment);
    setProvinces(nextProvinces);

    const nextProvince = nextProvinces.find(
      (row) => normalize(row.name) === normalize(resolved.province),
    );
    if (!nextProvince) return;

    const nextDistricts = await geoApi.districts(nextProvince.code);
    setProvince(nextProvince);
    setDistricts(nextDistricts);

    const nextDistrict = nextDistricts.find(
      (row) => normalize(row.name) === normalize(resolved.district),
    );
    if (nextDistrict) setDistrict(nextDistrict);
  };

  const resolvePoint = async (next: MapPoint) => {
    setLocating(true);
    setError('');
    try {
      const resolved = await geoApi.reverse(next);
      if (resolved) {
        await applyResolved(resolved, next);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        setPoint(next);
        setCoverage(null);
        setError('Ubicamos el pin, pero escribe la dirección para completarla.');
      }
    } catch (caught) {
      setPoint(next);
      setCoverage(null);
      setError(caught instanceof Error ? caught.message : 'No pudimos resolver ese punto.');
    } finally {
      setLocating(false);
    }
  };

  const useMyLocation = async () => {
    setLocating(true);
    setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Activa el permiso de ubicación para usar tu posición actual.');
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      await resolvePoint({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos obtener tu ubicación.');
      setLocating(false);
    }
  };

  const searchAddress = async () => {
    if (!district || query.trim().length < 5) {
      setError('Elige el distrito y escribe la dirección completa.');
      return;
    }

    setSearching(true);
    setError('');
    try {
      const rows = await geoApi.suggestions({
        query,
        department: department?.name,
        province: province?.name,
        district: district.name,
      });
      setSuggestions(rows);
      if (rows.length === 0) {
        setError('No encontramos esa vía. Agrega el número, la avenida o una referencia cercana.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos buscar la dirección.');
    } finally {
      setSearching(false);
    }
  };

  const chooseSuggestion = (row: AddressSuggestion) => {
    if (row.latitude != null && row.longitude != null) {
      void applyResolved(row, { latitude: row.latitude, longitude: row.longitude }).catch(
        (caught: unknown) => {
          setError(
            caught instanceof Error ? caught.message : 'No pudimos completar esa dirección.',
          );
        },
      );
      return;
    }

    setLine1(row.line1);
    setQuery(row.line1);
    setSuggestions([]);
    setCoverage(null);
  };

  const validate = async () => {
    if (!point || !line1) {
      setError('Busca una dirección o usa tu GPS para marcar el punto exacto.');
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
        // Fuera de cobertura no significa dirección inválida: se puede conservar
        // con su pin y referencia, pero no elegir para el pedido actual.
        setError('');
        toast.show({
          message: 'Puedes guardarla, pero todavía no podrás pedir delivery a ese punto.',
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
    if (!coverage || !point) return;
    if (!label) {
      setError('Ponle un nombre a esta dirección.');
      return;
    }
    // Puede pasar cuando el punto se resolvió pero el nombre de la zona no cuadró
    // con el catálogo: sin ubigeo la dirección quedaría a medias en la libreta.
    if (!department || !province || !district) {
      setError('Completa el departamento, la provincia y el distrito de la dirección.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const created = await accountApi.createAddress({
        label: label.slice(0, 50),
        line1,
        reference: reference.trim() || undefined,
        districtId: null,
        ubigeoCode: district.code,
        departmentName: department.name,
        provinceName: province.name,
        districtName: district.name,
        latitude: point.latitude,
        longitude: point.longitude,
        isDefault,
      });

      invalidateResource('account:addresses');
      // Solo una dirección cubierta se convierte en destino del pedido. La no
      // cubierta queda en la libreta para referencias y futuras ampliaciones.
      if (coverage.covered) await purchase.selectDeliveryAddress(created, coverage);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({
        message: coverage.covered
          ? `Guardada. Te atiende ${coverage.branch?.name ?? 'la cocina más cercana'}.`
          : 'Dirección guardada. Te avisaremos cuando tengamos cobertura en esa zona.',
        tone: coverage.covered ? 'success' : 'info',
      });

      if (router.canGoBack()) router.back();
      else router.replace('/addresses' as Href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos guardar la dirección.');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = Boolean(line1) && Boolean(point) && !locating;

  const mapPanel = (
    <View style={styles.mapCard}>
      <View style={styles.mapTitleRow}>
        <View style={styles.mapTitleCopy}>
          <Text style={styles.mapEyebrow}>PASO 1 · UBICA LA ENTRADA</Text>
          <Text style={styles.blockTitle}>Tu dirección en el mapa</Text>
          <Text style={styles.blockCopy}>Toca el mapa o arrastra el pin hasta tu puerta.</Text>
        </View>
        <View style={styles.mapTitleIcon}>
          <MaterialCommunityIcons name="map-marker-radius-outline" size={25} color={colors.surface} />
        </View>
      </View>
      <FreeMap
        style={styles.map}
        center={point ?? LIMA_CENTER}
        marker={point}
        zoom={point ? 17 : 11}
        onPress={(coordinate) => void resolvePoint(coordinate)}
        onMarkerDragEnd={(coordinate) => void resolvePoint(coordinate)}
      />
      <View style={styles.mapHint}>
        {locating ? (
          <ActivityIndicator color={colors.brand600} />
        ) : (
          <MaterialCommunityIcons name="gesture-tap" size={19} color={colors.brand700} />
        )}
        <Text style={styles.mapHintText}>
          {locating
            ? 'Identificando la zona del pin…'
            : point
              ? 'Punto encontrado. Ajústalo si la entrada está en otro lugar.'
              : 'Empieza con tu GPS o toca una zona aproximada del mapa.'}
        </Text>
      </View>
    </View>
  );

  return (
    <ScreenScaffold title="Agregar dirección" subtitle="Nuevo destino de entrega" showBack>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.flowIntro}>
            <Text style={styles.flowEyebrow}>ENTREGA PRECISA</Text>
            <Text style={styles.flowTitle}>Primero ubica tu puerta</Text>
            <Text style={styles.intro}>
              De este punto salen la cobertura, el costo de envío y la cocina que te atenderá.
            </Text>
            <View style={styles.flowSteps}>
              {['Ubica', 'Completa', 'Confirma'].map((step, index) => (
                <View key={step} style={styles.flowStep}>
                  <View style={[styles.flowNumber, index === 0 && styles.flowNumberActive]}>
                    <Text style={[styles.flowNumberText, index === 0 && styles.flowNumberTextActive]}>{index + 1}</Text>
                  </View>
                  <Text style={styles.flowStepText}>{step}</Text>
                </View>
              ))}
            </View>
          </View>

          {mapPanel}

          <PrimaryButton
            label="Usar mi ubicación actual"
            variant="secondary"
            loading={locating}
            onPress={() => void useMyLocation()}
          />

          {departments.length === 0 && error ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void retryDepartments()}
              style={({ pressed }) => [styles.retryBox, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="refresh" size={20} color={colors.brand700} />

              <Text style={styles.retryText}>Reintentar la carga de ubicaciones</Text>
            </Pressable>
          ) : null}

          <View style={styles.block}>
            <Text style={styles.blockTitle}>¿Cómo la llamamos?</Text>

            <View style={styles.chips}>
              {LABEL_PRESETS.map((preset) => (
                <Chip
                  key={preset}
                  label={preset}
                  selected={labelPreset === preset}
                  onPress={() => setLabelPreset(preset)}
                />
              ))}
            </View>

            {labelPreset === 'Otro' ? (
              <FormField
                label="Nombre de la dirección"
                value={customLabel}
                onChangeText={setCustomLabel}
                placeholder="Casa de mamá, gimnasio…"
                icon="tag-outline"
                maxLength={50}
              />
            ) : null}
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Zona</Text>

            <Text style={styles.blockCopy}>
              Sirve para buscar. Si mueves el pin, la zona se rehace desde las coordenadas.
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Elegir departamento"
              onPress={() => setSelector('department')}
              style={({ pressed }) => [styles.select, pressed && styles.pressed]}
            >
              <Text style={department ? styles.selectValue : styles.selectPlaceholder}>
                {department?.name ?? 'Departamento'}
              </Text>

              <MaterialCommunityIcons name="chevron-down" size={20} color={colors.inkMuted} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Elegir provincia"
              disabled={!department}
              onPress={() => setSelector('province')}
              style={({ pressed }) => [
                styles.select,
                !department && styles.selectDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={province ? styles.selectValue : styles.selectPlaceholder}>
                {province?.name ?? 'Provincia'}
              </Text>

              <MaterialCommunityIcons name="chevron-down" size={20} color={colors.inkMuted} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Elegir distrito"
              disabled={!province}
              onPress={() => setSelector('district')}
              style={({ pressed }) => [
                styles.select,
                !province && styles.selectDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={district ? styles.selectValue : styles.selectPlaceholder}>
                {district?.name ?? 'Distrito'}
              </Text>

              <MaterialCommunityIcons name="chevron-down" size={20} color={colors.inkMuted} />
            </Pressable>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Dirección exacta</Text>

            <FormField
              label="Calle y número"
              value={query}
              onChangeText={(value) => {
                setQuery(value);
                setLine1('');
                setCoverage(null);
              }}
              placeholder="Av. Arequipa 1234"
              icon="map-search-outline"
              hint="Incluye el número de puerta, lote o manzana"
              returnKeyType="search"
              onSubmitEditing={() => void searchAddress()}
            />

            <PrimaryButton
              label="Buscar dirección"
              variant="secondary"
              loading={searching}
              disabled={!district || query.trim().length < 5}
              onPress={() => void searchAddress()}
            />

            {suggestions.length > 0 ? (
              <View style={styles.suggestions}>
                {suggestions.slice(0, 5).map((row) => (
                  <Pressable
                    key={row.id}
                    accessibilityRole="button"
                    onPress={() => chooseSuggestion(row)}
                    style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
                  >
                    <MaterialCommunityIcons
                      name="map-marker-outline"
                      size={20}
                      color={colors.brand600}
                    />

                    <View style={styles.suggestionCopy}>
                      <Text style={styles.suggestionTitle}>{row.line1}</Text>

                      <Text style={styles.suggestionMeta}>
                        {[row.district, row.province, row.region].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {line1 ? (
            <View style={styles.selected}>
              <MaterialCommunityIcons name="check-circle" size={22} color={colors.success} />

              <View style={styles.selectedCopy}>
                <Text style={styles.selectedTitle}>Punto seleccionado</Text>

                <Text style={styles.selectedLine}>{line1}</Text>
              </View>
            </View>
          ) : null}

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

              <Text style={styles.defaultText}>La propondremos primero en tu próximo pedido.</Text>
            </View>
          </Pressable>

          {coverage ? <CoverageSummaryCard result={coverage} /> : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <PrimaryButton
            label={coverage ? 'Guardar dirección' : 'Comprobar cobertura'}
            loading={busy}
            disabled={!canSubmit}
            onPress={() => void (coverage ? save() : validate())}
            style={styles.submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <SelectorModal
        title="Departamento"
        visible={selector === 'department'}
        rows={departments}
        loading={false}
        onClose={() => setSelector(null)}
        onSelect={(row) => void chooseDepartment(row)}
      />

      <SelectorModal
        title="Provincia"
        visible={selector === 'province'}
        rows={provinces}
        loading={loadingGeo && provinces.length === 0}
        onClose={() => setSelector(null)}
        onSelect={(row) => void chooseProvince(row)}
      />

      <SelectorModal
        title="Distrito"
        visible={selector === 'district'}
        rows={districts}
        loading={loadingGeo && districts.length === 0}
        onClose={() => setSelector(null)}
        onSelect={chooseDistrict}
      />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  flowIntro: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceDark,
    padding: spacing.lg,
  },
  flowEyebrow: {
    ...type.caption,
    color: colors.brand100,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  flowTitle: {
    ...type.title,
    color: colors.onDark,
    marginTop: 4,
  },
  intro: {
    ...type.bodySm,
    color: colors.onDarkMuted,
    marginTop: spacing.sm,
  },
  flowSteps: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  flowStep: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  flowNumber: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceDarkRaised,
  },
  flowNumberActive: { backgroundColor: colors.accent600 },
  flowNumberText: { ...type.caption, color: colors.onDarkMuted },
  flowNumberTextActive: { color: colors.surface },
  flowStepText: { ...type.caption, color: colors.onDarkMuted, fontSize: 10 },
  block: {
    gap: spacing.sm,
  },
  blockTitle: {
    ...type.heading,
    color: colors.ink,
  },
  blockCopy: {
    ...type.bodySm,
    color: colors.inkMuted,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  select: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md - 2,
  },
  selectDisabled: {
    opacity: 0.5,
  },
  selectValue: {
    ...type.body,
    fontWeight: '700',
    color: colors.ink,
  },
  selectPlaceholder: {
    ...type.body,
    color: '#87938d',
  },
  suggestions: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm + spacing.xs,
  },
  suggestionCopy: {
    flex: 1,
  },
  suggestionTitle: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.ink,
  },
  suggestionMeta: {
    ...type.caption,
    fontWeight: '500',
    color: colors.inkMuted,
    marginTop: 2,
  },
  mapCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadow.sm,
  },
  mapUnavailable: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brand100,
    backgroundColor: colors.brand50,
  },
  mapFallbackCanvas: {
    height: 190,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f2ec',
  },
  mapStreet: {
    position: 'absolute',
    height: 18,
    width: '140%',
    borderWidth: 4,
    borderColor: colors.surface,
    backgroundColor: '#d9e8df',
  },
  mapStreetOne: { transform: [{ rotate: '18deg' }] },
  mapStreetTwo: { transform: [{ rotate: '-35deg' }] },
  mapStreetThree: { transform: [{ rotate: '78deg' }] },
  mapFallbackPin: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadow.md,
  },
  mapUnavailableCopy: { padding: spacing.md },
  mapUnavailableTitle: { ...type.body, color: colors.brand900, fontWeight: '900' },
  mapUnavailableText: { ...type.bodySm, color: colors.brand700, marginTop: 4 },
  mapTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
  },
  mapTitleCopy: { flex: 1 },
  mapEyebrow: {
    ...type.caption,
    color: colors.brand600,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 3,
  },
  mapTitleIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.brand700,
  },
  map: {
    width: '100%',
    height: 280,
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
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.brand50,
    padding: spacing.md - 2,
  },
  selectedCopy: {
    flex: 1,
  },
  selectedTitle: {
    ...type.label,
    color: colors.success,
  },
  selectedLine: {
    ...type.bodySm,
    color: colors.ink,
    marginTop: 3,
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
  retryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md - 2,
  },
  retryText: {
    ...type.bodySm,
    fontWeight: '700',
    color: colors.brand700,
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
  submit: {
    marginTop: spacing.sm,
  },
  modal: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  modalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    ...type.title,
    color: colors.ink,
  },
  modalClose: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  search: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md - 2,
    marginVertical: spacing.md,
  },
  searchInput: {
    ...type.body,
    flex: 1,
    color: colors.ink,
  },
  modalLoading: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  modalLoadingText: {
    ...type.bodySm,
    color: colors.inkMuted,
  },
  modalEmpty: {
    ...type.bodySm,
    color: colors.inkMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  selectRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingHorizontal: spacing.xs,
  },
  selectRowText: {
    ...type.body,
    fontWeight: '700',
    color: colors.ink,
  },
  pressed: {
    opacity: 0.85,
  },
});
