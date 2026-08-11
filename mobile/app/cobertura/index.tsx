import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polygon } from 'react-native-maps';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { usePurchase } from '../../src/providers/PurchaseProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { geoApi } from '../../src/services/api/geo.service';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type { AddressSuggestion, CoverageResult } from '../../src/types/domain';

interface MapPoint {
  latitude: number;
  longitude: number;
}

/** Centro de Lima: punto de partida cuando aún no sabemos nada del visitante. */
const DEFAULT_POINT: MapPoint = { latitude: -12.0464, longitude: -77.0428 };

const money = (value: number): string => `S/ ${value.toFixed(2)}`;

/**
 * Cobertura pública: se consulta sin cuenta, igual que en la web.
 *
 * Es la primera pregunta de cualquiera que nos descubre («¿me llegan?»), así que
 * no puede vivir detrás del login. Si el punto tiene cobertura, la sede que sale
 * de aquí queda fijada en el contexto de compra: el menú se abre ya filtrado por
 * la cocina que atiende esa zona.
 */
export default function CoverageScreen() {
  const purchase = usePurchase();
  const { status } = useSession();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [line1, setLine1] = useState('');
  const [zone, setZone] = useState('');
  const [point, setPoint] = useState<MapPoint>(DEFAULT_POINT);
  const [hasPoint, setHasPoint] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);

  const [result, setResult] = useState<CoverageResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const isAuthenticated = status === 'authenticated';

  /*
   * Zona de reparto dibujada sobre el mapa, igual que la web. El backend la
   * manda en `{ lat, lng }` y react-native-maps la pide en
   * `{ latitude, longitude }`. Con menos de tres vértices no hay área que pintar.
   */
  const coveragePolygon = useMemo(() => {
    const points = result?.zone?.polygon;
    if (!points || points.length < 3) return null;
    return points.map((vertex) => ({ latitude: vertex.lat, longitude: vertex.lng }));
  }, [result]);

  const describe = (resolved: AddressSuggestion) => {
    setLine1(resolved.line1);
    setZone([resolved.district, resolved.province, resolved.region].filter(Boolean).join(' · '));
  };

  const movePin = async (next: MapPoint) => {
    setPoint(next);
    setHasPoint(true);
    setResult(null);
    setSuggestions([]);
    setLocating(true);
    setError('');
    try {
      const resolved = await geoApi.reverse(next);
      if (resolved) {
        describe(resolved);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        setLine1('');
        setZone('');
        setError('No reconocimos la vía de ese punto, pero podemos comprobar la cobertura igual.');
      }
    } catch (caught) {
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
      await movePin({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos obtener tu ubicación.');
      setLocating(false);
    }
  };

  const search = async () => {
    if (query.trim().length < 3) {
      setError('Escribe al menos la avenida o el distrito.');
      return;
    }

    setSearching(true);
    setError('');
    try {
      const rows = await geoApi.suggestions({ query: query.trim() });
      setSuggestions(rows);
      if (rows.length === 0) {
        setError('No encontramos esa dirección. Prueba con la avenida y el distrito.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos buscar esa dirección.');
    } finally {
      setSearching(false);
    }
  };

  const chooseSuggestion = (row: AddressSuggestion) => {
    setSuggestions([]);
    setResult(null);
    describe(row);
    setQuery(row.line1);
    if (row.latitude != null && row.longitude != null) {
      setPoint({ latitude: row.latitude, longitude: row.longitude });
      setHasPoint(true);
    }
  };

  const check = async () => {
    if (!hasPoint) {
      setError('Marca tu punto en el mapa, busca la dirección o usa tu ubicación.');
      return;
    }

    setChecking(true);
    setError('');
    try {
      const coverage = await geoApi.coverage(point);
      setResult(coverage);

      if (coverage.covered) {
        // La sede que sale de la cobertura pasa al contexto de compra: sin esto el
        // menú seguiría pidiendo la carta sin cocina y mostraría todo disponible.
        purchase.applyCoverage(coverage);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        toast.show({ message: 'Todavía no llegamos a ese punto.', tone: 'error' });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos comprobar la cobertura.');
    } finally {
      setChecking(false);
    }
  };

  const saveAddress = () => {
    if (!isAuthenticated) {
      router.push({ pathname: '/(auth)/login', params: { returnTo: '/addresses/new' } });
      return;
    }
    router.push('/addresses/new' as Href);
  };

  return (
    <ScreenScaffold
      title="¿Llegamos a tu zona?"
      subtitle="Compruébalo sin crear una cuenta"
      showBack
      footer={
        <View style={styles.footer}>
          <PrimaryButton
            label="Comprobar cobertura"
            loading={checking}
            disabled={!hasPoint || locating}
            onPress={() => void check()}
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
          <View style={styles.mapCard}>
            <MapView
              style={styles.map}
              region={{ ...point, latitudeDelta: hasPoint ? 0.008 : 0.08, longitudeDelta: hasPoint ? 0.008 : 0.08 }}
              onPress={(event) => void movePin(event.nativeEvent.coordinate)}
            >
              {coveragePolygon ? (
                <Polygon
                  coordinates={coveragePolygon}
                  strokeColor={colors.brand700}
                  strokeWidth={3}
                  fillColor="rgba(76, 175, 125, 0.2)"
                />
              ) : null}

              {hasPoint ? (
                <Marker
                  coordinate={point}
                  draggable
                  onDragEnd={(event) => void movePin(event.nativeEvent.coordinate)}
                  pinColor={colors.brand600}
                />
              ) : null}
            </MapView>

            <View style={styles.mapHint}>
              {locating ? (
                <ActivityIndicator color={colors.brand600} />
              ) : (
                <MaterialCommunityIcons name="gesture-tap" size={18} color={colors.brand700} />
              )}

              <Text style={styles.mapHintText}>
                {locating
                  ? 'Identificando la zona del pin…'
                  : hasPoint
                    ? 'Arrastra el pin hasta tu puerta para afinar el resultado.'
                    : 'Toca el mapa donde recibirías el pedido.'}
              </Text>
            </View>
          </View>

          {line1 ? (
            <View style={styles.selected}>
              <MaterialCommunityIcons name="map-marker-check" size={22} color={colors.brand700} />

              <View style={styles.selectedCopy}>
                <Text style={styles.selectedLine}>{line1}</Text>

                {zone ? <Text style={styles.selectedZone}>{zone}</Text> : null}
              </View>
            </View>
          ) : null}

          <PrimaryButton
            label="Usar mi ubicación actual"
            variant="secondary"
            loading={locating}
            onPress={() => void useMyLocation()}
          />

          <FormField
            label="O busca tu dirección"
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              setResult(null);
            }}
            placeholder="Av. Larco 345, Miraflores"
            icon="map-search-outline"
            returnKeyType="search"
            onSubmitEditing={() => void search()}
          />

          <PrimaryButton
            label="Buscar"
            variant="secondary"
            loading={searching}
            disabled={query.trim().length < 3}
            onPress={() => void search()}
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

          {result ? (
            <View style={[styles.result, result.covered ? styles.resultOk : styles.resultBad]}>
              <View style={styles.resultTop}>
                <MaterialCommunityIcons
                  name={result.covered ? 'truck-check-outline' : 'map-marker-off-outline'}
                  size={28}
                  color={result.covered ? colors.success : colors.danger}
                />

                <View style={styles.resultCopy}>
                  <Text style={styles.resultTitle}>
                    {result.covered ? '¡Sí llegamos!' : 'Todavía no llegamos'}
                  </Text>

                  <Text style={styles.resultText}>
                    {result.covered
                      ? `Te atiende ${result.branch?.name ?? 'nuestra cocina más cercana'}.`
                      : (result.reason ?? 'Esta zona está fuera del área de reparto.')}
                  </Text>
                </View>
              </View>

              {result.covered ? (
                <View style={styles.facts}>
                  <View style={styles.fact}>
                    <Text style={styles.factLabel}>LLEGADA</Text>

                    <Text style={styles.factValue}>
                      {result.etaMinutes ? `~${result.etaMinutes} min` : '—'}
                    </Text>
                  </View>

                  <View style={styles.fact}>
                    <Text style={styles.factLabel}>ENVÍO</Text>

                    <Text style={styles.factValue}>
                      {result.zone ? money(result.zone.deliveryFee) : '—'}
                    </Text>
                  </View>

                  <View style={styles.fact}>
                    <Text style={styles.factLabel}>MÍNIMO</Text>

                    <Text style={styles.factValue}>
                      {result.zone ? money(result.zone.minimumOrder) : '—'}
                    </Text>
                  </View>
                </View>
              ) : null}

              {result.covered ? (
                <View style={styles.resultActions}>
                  <PrimaryButton
                    label="Ver el menú de esta zona"
                    onPress={() => router.replace('/(tabs)/menu' as Href)}
                  />

                  <PrimaryButton
                    label={isAuthenticated ? 'Guardar esta dirección' : 'Crear cuenta para guardarla'}
                    variant="secondary"
                    onPress={saveAddress}
                  />
                </View>
              ) : (
                <View style={styles.resultActions}>
                  <PrimaryButton
                    label="Recoger en un local"
                    variant="secondary"
                    onPress={() => router.push('/location' as Href)}
                  />
                </View>
              )}
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.note}>
            <MaterialCommunityIcons name="information-outline" size={20} color={colors.brand700} />

            <Text style={styles.noteText}>
              La cobertura depende del punto exacto, no solo del distrito: dos puertas de la misma
              calle pueden caer en zonas distintas.
            </Text>
          </View>
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
    height: 300,
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
  selectedLine: {
    ...type.bodySm,
    fontWeight: '800',
    color: colors.ink,
  },
  selectedZone: {
    ...type.caption,
    color: colors.brand700,
    marginTop: 3,
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
  result: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    ...shadow.sm,
  },
  resultOk: {
    backgroundColor: colors.brand50,
  },
  resultBad: {
    backgroundColor: '#fff0f0',
  },
  resultTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
  },
  resultCopy: {
    flex: 1,
  },
  resultTitle: {
    ...type.heading,
    color: colors.ink,
  },
  resultText: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 3,
  },
  facts: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fact: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + spacing.xs,
    paddingVertical: spacing.sm + spacing.xs,
  },
  factLabel: {
    ...type.label,
    color: colors.inkMuted,
  },
  factValue: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
    marginTop: spacing.xs,
  },
  resultActions: {
    gap: spacing.sm,
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
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    minHeight: layout.minTouch,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    padding: spacing.md - 2,
  },
  noteText: {
    ...type.bodySm,
    flex: 1,
    color: colors.inkMuted,
  },
  footer: {
    paddingBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.85,
  },
});
