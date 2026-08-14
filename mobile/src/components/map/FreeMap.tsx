import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  ViewAnnotation,
} from '@maplibre/maplibre-react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, shadow, spacing, type } from '../../theme/tokens';

export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

interface FreeMapProps {
  center: MapCoordinate;
  marker?: MapCoordinate | null;
  polygon?: MapCoordinate[] | null;
  zoom?: number;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  onPress?: (coordinate: MapCoordinate) => void;
  onMarkerDragEnd?: (coordinate: MapCoordinate) => void;
}

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const toCoordinate = ([longitude, latitude]: readonly number[]): MapCoordinate => ({
  latitude,
  longitude,
});

/**
 * Mapa nativo compartido por las pantallas de direcciones y cobertura.
 * MapLibre dibuja el mapa y OpenFreeMap entrega el estilo/vector tiles, de modo
 * que no requiere Google Cloud, tarjeta ni clave API.
 */
export const FreeMap = ({
  center,
  marker,
  polygon,
  zoom = 16,
  style,
  interactive = true,
  onPress,
  onMarkerDragEnd,
}: FreeMapProps) => {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const centerLngLat: [number, number] = [center.longitude, center.latitude];

  const polygonFeature = useMemo(() => {
    if (!polygon || polygon.length < 3) return null;
    const ring = polygon.map(({ longitude, latitude }) => [longitude, latitude]);
    const first = ring[0];
    const last = ring.at(-1);
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push([...first]);
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Polygon' as const, coordinates: [ring] },
    };
  }, [polygon]);

  return (
    <View style={[styles.container, style]}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLE}
        touchRotate={false}
        touchPitch={false}
        compass={false}
        logo={false}
        attribution={false}
        dragPan={interactive}
        touchZoom={interactive}
        doubleTapZoom={interactive}
        onPress={(event) => {
          if (!interactive || !onPress) return;
          onPress(toCoordinate(event.nativeEvent.lngLat));
        }}
        onDidFinishLoadingMap={() => {
          setLoading(false);
          setFailed(false);
        }}
        onDidFailLoadingMap={() => {
          setLoading(false);
          setFailed(true);
        }}
      >
        <Camera center={centerLngLat} zoom={zoom} duration={350} easing="ease" />

        {polygonFeature ? (
          <GeoJSONSource id="coverage-polygon" data={polygonFeature}>
            <Layer
              id="coverage-area"
              type="fill"
              paint={{ 'fill-color': colors.brand600, 'fill-opacity': 0.2 }}
            />
            <Layer
              id="coverage-border"
              type="line"
              paint={{ 'line-color': colors.brand700, 'line-width': 3 }}
            />
          </GeoJSONSource>
        ) : null}

        {marker ? (
          <ViewAnnotation
            id="delivery-location"
            lngLat={[marker.longitude, marker.latitude]}
            anchor="bottom"
            draggable={Boolean(interactive && onMarkerDragEnd)}
            onDragEnd={(event) => onMarkerDragEnd?.(toCoordinate(event.nativeEvent.lngLat))}
          >
            <View style={styles.marker}>
              <MaterialCommunityIcons name="map-marker" size={32} color={colors.surface} />
            </View>
          </ViewAnnotation>
        ) : null}
      </Map>

      <View pointerEvents="none" style={styles.attribution}>
        <Text style={styles.attributionText}>© OpenStreetMap · OpenFreeMap</Text>
      </View>

      {loading ? (
        <View pointerEvents="none" style={styles.loading}>
          <ActivityIndicator color={colors.brand700} />
          <Text style={styles.loadingText}>Cargando mapa libre…</Text>
        </View>
      ) : null}

      {failed ? (
        <View pointerEvents="none" style={styles.error}>
          <MaterialCommunityIcons name="map-marker-off-outline" size={28} color={colors.danger} />
          <Text style={styles.errorTitle}>No se pudo descargar el mapa</Text>
          <Text style={styles.errorText}>Revisa tu conexión. Tu ubicación y cobertura siguen guardadas.</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    minHeight: 240,
    overflow: 'hidden',
    backgroundColor: '#e7f1eb',
  },
  marker: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.brand700,
    ...shadow.md,
  },
  attribution: {
    position: 'absolute',
    right: 6,
    bottom: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  attributionText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '700',
    color: colors.inkMuted,
  },
  loading: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#edf6f1',
  },
  loadingText: { ...type.caption, color: colors.brand700 },
  error: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: '#fff7f7',
  },
  errorTitle: { ...type.body, color: colors.danger, fontWeight: '900', marginTop: spacing.sm },
  errorText: { ...type.caption, color: colors.inkMuted, textAlign: 'center', marginTop: 4 },
});
