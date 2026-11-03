import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import { divIcon } from 'leaflet';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  ScaleControl,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
  ZoomControl,
} from 'react-leaflet';
import {
  CheckCircle2,
  Crosshair,
  Focus,
  LoaderCircle,
  MapPin,
  Maximize2,
  Minimize2,
  MousePointer2,
  Navigation,
  Sparkles,
} from 'lucide-react';
import { geoApi } from '../services/geo.service';
import type { AddressSuggestion } from '../types';

export interface MapPosition {
  latitude: number;
  longitude: number;
}

interface AddressMapPickerProps {
  value: MapPosition | null;
  onChange: (position: MapPosition) => void;
  cityId?: number | null;
  cityName?: string;
  departmentName?: string;
  provinceName?: string;
  districtId?: number | null;
  districtName?: string;
  districtCenter?: MapPosition | null;
  address?: AddressSuggestion | null;
  onAddressResolved?: (address: AddressSuggestion) => void;
  onAddressResolutionFailed?: () => void;
  onResolvingChange?: (isResolving: boolean) => void;
  autoLocate?: boolean;
  coveragePolygon?: Array<{ lat: number; lng: number }> | null;
  fillAvailableSpace?: boolean;
}

const LIMA_CENTER: [number, number] = [-12.04527778, -77.03083333];

const pinIcon = divIcon({
  className: 'verde-map-pin',
  html: '<span style="display:grid;width:42px;height:42px;place-items:center;border:4px solid white;border-radius:50% 50% 50% 8px;background:linear-gradient(135deg,var(--color-brand-500),var(--color-brand-700));box-shadow:0 12px 30px color-mix(in srgb,var(--color-brand-900) 38%,transparent);transform:rotate(-45deg)"><span style="width:10px;height:10px;border-radius:999px;background:white;box-shadow:0 0 0 4px rgba(255,255,255,.2)"></span></span>',
  iconSize: [42, 42],
  iconAnchor: [21, 40],
});

const MapInteraction = ({
  value,
  onChange,
}: Pick<AddressMapPickerProps, 'value' | 'onChange'>) => {
  useMapEvents({
    click(event) {
      onChange({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });

  return value ? (
    <Marker
      position={[value.latitude, value.longitude]}
      icon={pinIcon}
      draggable
      autoPan
      eventHandlers={{
        dragend(event) {
          const position = event.target.getLatLng();
          onChange({ latitude: position.lat, longitude: position.lng });
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -34]} opacity={0.96}>
        Arrástrame hasta la entrada exacta
      </Tooltip>
    </Marker>
  ) : null;
};

const MapViewport = ({
  value,
  contextCenter,
  recenterSignal,
}: {
  value: MapPosition | null;
  contextCenter: MapPosition | null;
  recenterSignal: number;
}) => {
  const map = useMap();

  useEffect(() => {
    const target = value ?? contextCenter;
    if (!target) return;
    map.flyTo(
      [target.latitude, target.longitude],
      value ? 17 : 14,
      { duration: 0.75 },
    );
  }, [contextCenter, map, recenterSignal, value]);

  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  return null;
};

const samePosition = (a: MapPosition | null, b: MapPosition | null) =>
  Boolean(
    a &&
      b &&
      Math.abs(a.latitude - b.latitude) < 0.000001 &&
      Math.abs(a.longitude - b.longitude) < 0.000001,
  );

/**
 * Selector geográfico compartido. Sincroniza distrito → mapa y
 * clic/arrastre → dirección mediante los mismos servicios en todas las vistas.
 */
export const AddressMapPicker = ({
  value,
  onChange,
  cityId,
  cityName,
  departmentName,
  provinceName,
  districtId,
  districtName,
  districtCenter,
  address,
  onAddressResolved,
  onAddressResolutionFailed,
  onResolvingChange,
  autoLocate = false,
  coveragePolygon,
  fillAvailableSpace = false,
}: AddressMapPickerProps) => {
  const [locationError, setLocationError] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isCenteringDistrict, setIsCenteringDistrict] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState<AddressSuggestion | null>(null);
  const [contextCenter, setContextCenter] = useState<MapPosition | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [recenterSignal, setRecenterSignal] = useState(0);
  const resolveRequest = useRef(0);
  const districtRequest = useRef(0);
  const resolvedPosition = useRef<MapPosition | null>(null);

  useEffect(() => {
    if (!value) {
      resolveRequest.current += 1;
      setIsResolving(false);
      onResolvingChange?.(false);
      setResolvedAddress(null);
      resolvedPosition.current = null;
      return;
    }
    if (
      address?.latitude != null &&
      address.longitude != null &&
      samePosition(value, {
        latitude: address.latitude,
        longitude: address.longitude,
      })
    ) {
      resolvedPosition.current = value;
      setResolvedAddress(address);
      return;
    }
    if (!samePosition(value, resolvedPosition.current)) {
      setResolvedAddress(null);
      setResolutionNote('');
    }
  }, [address, onResolvingChange, value]);

  useEffect(() => {
    if (value) {
      setContextCenter(null);
      setIsCenteringDistrict(false);
      return;
    }
    if (districtCenter) {
      setContextCenter(districtCenter);
      setIsCenteringDistrict(false);
      return;
    }
    if (!districtName) {
      setContextCenter(null);
      return;
    }

    const request = ++districtRequest.current;
    setIsCenteringDistrict(true);
    geoApi
      .resolveAddress({
        query: districtName,
        cityId: cityId ?? undefined,
        districtId: districtId ?? undefined,
        department: departmentName,
        province: provinceName,
        district: districtName,
      })
      .then((result) => {
        if (
          request !== districtRequest.current ||
          result?.latitude == null ||
          result.longitude == null
        ) {
          return;
        }
        setContextCenter({
          latitude: result.latitude,
          longitude: result.longitude,
        });
      })
      .catch(() => {
        if (request === districtRequest.current) setContextCenter(null);
      })
      .finally(() => {
        if (request === districtRequest.current) setIsCenteringDistrict(false);
      });
  }, [cityId, departmentName, districtCenter, districtId, districtName, provinceName, value]);

  useEffect(() => {
    if (!isExpanded) return;
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsExpanded(false);
    };
    window.addEventListener('keydown', closeWithEscape);
    return () => window.removeEventListener('keydown', closeWithEscape);
  }, [isExpanded]);

  const selectPosition = async (position: MapPosition) => {
    onChange(position);
    setResolvedAddress(null);
    setResolutionNote('');
    setLocationError('');
    const request = ++resolveRequest.current;
    setIsResolving(true);
    onResolvingChange?.(true);
    try {
      const result = await geoApi.reverseAddress({
        ...position,
      });
      if (request !== resolveRequest.current) return;
      if (!result || !result.ubigeoCode) {
        setLocationError(
          result
            ? 'Encontramos la dirección, pero no pudimos confirmar su zona oficial.'
            : 'No encontramos una dirección exacta para ese punto.',
        );
        onAddressResolutionFailed?.();
        return;
      }

      resolvedPosition.current = position;
      setResolvedAddress(result);
      setResolutionNote(
        result.ubigeoCode == null
          ? 'Identificamos la dirección, pero no su UBIGEO. Revisa la zona antes de continuar.'
          : result.precision === 'approximate'
            ? 'La dirección es aproximada. Arrastra el pin hasta la entrada.'
            : '',
      );
      onAddressResolved?.(result);
    } catch {
      if (request === resolveRequest.current) {
        setLocationError(
          'No pudimos validar el nuevo punto. Conservamos tu ubicación anterior.',
        );
        onAddressResolutionFailed?.();
      }
    } finally {
      if (request === resolveRequest.current) {
        setIsResolving(false);
        onResolvingChange?.(false);
      }
    }
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setLocationError('Tu navegador no permite obtener la ubicación.');
      return;
    }

    setIsLocating(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        void selectPosition({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        setIsLocating(false);
      },
      () => {
        setLocationError(
          'No pudimos acceder a tu ubicación. Puedes marcarla directamente en el mapa.',
        );
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  useEffect(() => {
    if (!autoLocate) return;

    // Ask once on entry when permission is granted or still pending. If it was
    // explicitly denied, keep the neutral Lima fallback without asking again.
    if (!navigator.permissions?.query) {
      locate();
      return;
    }
    let active = true;
    void navigator.permissions
      .query({ name: 'geolocation' })
      .then((permission) => {
        if (active && permission.state !== 'denied') locate();
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
    // Automatic detection intentionally runs once when the picker mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLocate]);

  const center: [number, number] = value
    ? [value.latitude, value.longitude]
    : contextCenter
      ? [contextCenter.latitude, contextCenter.longitude]
      : LIMA_CENTER;

  const mapStatus = isResolving
    ? 'Identificando dirección…'
    : value
      ? 'Entrada seleccionada'
      : isCenteringDistrict
        ? `Ubicando ${districtName ?? 'el distrito'}…`
        : contextCenter
          ? `Vista de ${districtName}`
          : 'Centro de Lima';

  return (
    <Box
      sx={
        isExpanded
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: 1500,
              bgcolor: 'background.default',
              p: { xs: 1.5, sm: 3 },
              display: 'flex',
              flexDirection: 'column',
            }
          : fillAvailableSpace
            ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }
            : undefined
      }
    >
      <Box
        sx={{
          mb: 2,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: fillAvailableSpace ? 'flex-end' : 'space-between',
          gap: 1.5,
        }}
      >
        {!fillAvailableSpace && (
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="subtitle2"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontWeight: 850 }}
            >
              <MapPin size={16} /> Entrada exacta
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Haz clic o arrastra el pin hasta la puerta donde recibirás el pedido.
            </Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {value && (
            <Button
              size="small"
              variant="text"
              startIcon={<Focus size={15} />}
              onClick={() => setRecenterSignal((current) => current + 1)}
            >
              Centrar pin
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            startIcon={
              isLocating ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <Crosshair size={15} />
              )
            }
            onClick={locate}
            disabled={isLocating}
          >
            {isLocating ? 'Ubicando…' : 'Mi ubicación'}
          </Button>
          <Button
            size="small"
            variant="text"
            startIcon={isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            aria-label={isExpanded ? 'Cerrar mapa ampliado' : 'Ampliar mapa'}
            onClick={() => setIsExpanded((current) => !current)}
          >
            {isExpanded ? 'Cerrar' : 'Ampliar'}
          </Button>
        </Box>
      </Box>

      <Box
        role="application"
        aria-label="Mapa interactivo para seleccionar la ubicación exacta"
        sx={{
          height: isExpanded ? '100%' : fillAvailableSpace ? { xs: 280, lg: 320 } : { xs: 300, sm: 360, lg: 390 },
          minHeight: isExpanded ? 320 : fillAvailableSpace ? { xs: 280, lg: 320 } : undefined,
          flex: isExpanded || fillAvailableSpace ? 1 : undefined,
          overflow: 'hidden',
          borderRadius: 'var(--radius-card)',
          border: '1px solid',
          borderColor: value ? 'primary.light' : 'divider',
          bgcolor: 'primary.100',
          position: 'relative',
          boxShadow: value ? 'var(--shadow-e3)' : 'var(--shadow-e2)',
          '& .leaflet-container': {
            height: '100%',
            width: '100%',
            fontFamily: 'inherit',
            backgroundColor: 'primary.100',
          },
          '& .leaflet-tile-pane': {
            filter: 'saturate(.82) contrast(1.04) brightness(1.02)',
          },
          '& .leaflet-control-zoom a': {
            color: 'primary.dark',
            borderColor: 'divider',
          },
          '& .leaflet-control-attribution': {
            fontSize: 9,
            background: 'rgba(255,255,255,.82)',
          },
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            left: { xs: 10, sm: 14 },
            top: { xs: 10, sm: 14 },
            zIndex: 500,
            display: 'flex',
            maxWidth: 'calc(100% - 28px)',
            alignItems: 'center',
            gap: 0.8,
            borderRadius: 'var(--radius-pill)',
            bgcolor: 'rgba(255,255,255,.94)',
            px: 1.4,
            py: 0.85,
            color: isResolving || isCenteringDistrict
              ? 'text.secondary'
              : value
                ? 'primary.main'
                : 'text.secondary',
            boxShadow: 'var(--shadow-e3)',
            backdropFilter: 'blur(10px)',
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {isResolving || isCenteringDistrict ? (
            <LoaderCircle size={14} className="animate-spin" />
          ) : value ? (
            <CheckCircle2 size={14} />
          ) : contextCenter ? (
            <Navigation size={14} />
          ) : (
            <Sparkles size={14} />
          )}
          <span className="truncate">{mapStatus}</span>
        </Box>

        {!value && (
          <Box
            sx={{
              position: 'absolute',
              left: '50%',
              bottom: 16,
              zIndex: 500,
              display: { xs: 'none', sm: 'flex' },
              transform: 'translateX(-50%)',
              alignItems: 'center',
              gap: 0.75,
              whiteSpace: 'nowrap',
              borderRadius: 'var(--radius-pill)',
              bgcolor: 'rgba(0,59,125,.86)',
              color: 'white',
              px: 1.5,
              py: 0.8,
              fontSize: 11,
              fontWeight: 750,
              backdropFilter: 'blur(8px)',
            }}
          >
            <MousePointer2 size={13} />
            Haz clic sobre la entrada para crear el pin
          </Box>
        )}

        <MapContainer
          center={center}
          zoom={value ? 17 : contextCenter ? 14 : 13}
          scrollWheelZoom={false}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <ZoomControl position="bottomright" />
          <ScaleControl position="bottomleft" imperial={false} />
          <MapInteraction
            value={value}
            onChange={(position) => void selectPosition(position)}
          />
          {!value && contextCenter && (
            <>
              <Circle
                center={[contextCenter.latitude, contextCenter.longitude]}
                radius={450}
                pathOptions={{
                  color: 'var(--color-brand-600)',
                  fillColor: 'var(--color-brand-300)',
                  fillOpacity: 0.05,
                  weight: 2,
                  dashArray: '6 7',
                }}
              />
              <CircleMarker
                center={[contextCenter.latitude, contextCenter.longitude]}
                radius={7}
                pathOptions={{
                  color: '#ffffff',
                  fillColor: 'var(--color-brand-600)',
                  fillOpacity: 1,
                  weight: 4,
                }}
              >
                <Tooltip permanent direction="top" offset={[0, -8]} opacity={0.92}>
                  {districtName}
                </Tooltip>
              </CircleMarker>
            </>
          )}
          {coveragePolygon && coveragePolygon.length >= 3 && (
            <Polygon
              positions={coveragePolygon.map((point) => [point.lat, point.lng])}
              pathOptions={{
                color: 'var(--color-brand-600)',
                fillColor: 'var(--color-brand-300)',
                fillOpacity: 0.14,
                weight: 2,
              }}
            />
          )}
          <MapViewport
            value={value}
            contextCenter={contextCenter}
            recenterSignal={recenterSignal}
          />
        </MapContainer>
      </Box>

      <Box
        sx={{
          mt: 1.5,
          minHeight: 58,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.25,
          borderRadius: 'var(--radius-card)',
          border: '1px solid',
          borderColor: locationError
            ? 'error.light'
            : resolvedAddress
              ? 'primary.light'
              : 'divider',
          bgcolor: locationError
            ? 'error.50'
            : resolvedAddress
              ? 'rgba(241,248,255,.72)'
              : 'rgba(250,247,250,.82)',
          px: 1.5,
          py: 1.25,
        }}
      >
        <Box
          sx={{
            mt: 0.15,
            display: 'grid',
            width: 30,
            height: 30,
            flexShrink: 0,
            placeItems: 'center',
            borderRadius: 'var(--radius-card)',
            bgcolor: resolvedAddress ? 'primary.main' : 'background.paper',
            color: resolvedAddress ? 'primary.contrastText' : 'text.secondary',
            boxShadow: 'var(--shadow-e1)',
          }}
        >
          {isResolving ? (
            <LoaderCircle size={14} className="animate-spin" />
          ) : (
            <Navigation size={14} />
          )}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="caption"
            color={locationError ? 'error.main' : 'text.primary'}
            sx={{ display: 'block', fontWeight: 800, lineHeight: 1.45 }}
          >
            {locationError ||
              (resolvedAddress
                ? resolvedAddress.line1
                : value
                  ? `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}`
                  : districtName
                    ? `Mapa centrado en ${districtName}`
                    : 'Selecciona una zona para comenzar')}
          </Typography>
          {!locationError && (
            <Box sx={{ mt: 0.65, display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
              {[
                resolvedAddress?.district ?? districtName,
                resolvedAddress?.province ?? provinceName ?? cityName,
                resolvedAddress?.region ?? departmentName,
              ]
                .filter((item): item is string => Boolean(item))
                .filter((item, index, all) => all.indexOf(item) === index)
                .map((item) => (
                  <Chip
                    key={item}
                    size="small"
                    label={item}
                    variant="outlined"
                    sx={{ height: 21, fontSize: 10, bgcolor: 'background.paper' }}
                  />
                ))}
            </Box>
          )}
        </Box>
      </Box>

      {resolutionNote && (
        <Typography
          role="status"
          variant="caption"
          sx={{
            mt: 1,
            display: 'block',
            color: 'warning.dark',
            fontWeight: 700,
            lineHeight: 1.5,
          }}
        >
          {resolutionNote}
        </Typography>
      )}
    </Box>
  );
};
