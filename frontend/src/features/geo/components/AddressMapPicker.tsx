import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { divIcon } from 'leaflet';
import { MapContainer, Marker, Polygon, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { CheckCircle2, Crosshair, LoaderCircle, MapPin, Maximize2, Minimize2, Sparkles } from 'lucide-react';
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
  onAddressResolved?: (address: AddressSuggestion) => void;
  coveragePolygon?: Array<{ lat: number; lng: number }> | null;
}

const LIMA_CENTER: [number, number] = [-12.0464, -77.0428];

const pinIcon = divIcon({
  className: 'verde-map-pin',
  html: '<span style="display:grid;width:38px;height:38px;place-items:center;border:4px solid white;border-radius:50% 50% 50% 8px;background:#21835a;box-shadow:0 10px 28px rgba(18,83,55,.35);transform:rotate(-45deg)"><span style="width:9px;height:9px;border-radius:999px;background:white"></span></span>',
  iconSize: [38, 38],
  iconAnchor: [9, 34],
});

const MapInteraction = ({
  value,
  onChange,
}: AddressMapPickerProps) => {
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
    />
  ) : null;
};

const RecenterMap = ({ value }: { value: MapPosition | null }) => {
  const map = useMap();

  useEffect(() => {
    if (value) map.flyTo([value.latitude, value.longitude], 17, { duration: 0.7 });
  }, [map, value]);

  return null;
};

const ResizeMap = ({ expanded }: { expanded: boolean }) => {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 180);
    return () => window.clearTimeout(timer);
  }, [expanded, map]);
  return null;
};

/** Selector reutilizable de coordenadas para direcciones y futuras sucursales. */
export const AddressMapPicker = ({ value, onChange, cityId, onAddressResolved, coveragePolygon }: AddressMapPickerProps) => {
  const [locationError, setLocationError] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedLabel, setResolvedLabel] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const resolveRequest = useRef(0);

  const selectPosition = async (position: MapPosition) => {
    onChange(position);
    setResolvedLabel('');
    setResolutionNote('');
    setLocationError('');
    if (!cityId) return;
    const request = ++resolveRequest.current;
    setIsResolving(true);
    try {
      const result = await geoApi.reverseAddress({ ...position, cityId });
      if (request !== resolveRequest.current) return;
      if (!result) {
        setLocationError('No encontramos una dirección exacta. Puedes completar la calle manualmente.');
        return;
      }
      setResolvedLabel(result.label);
      setResolutionNote(
        result.hasHouseNumber === false
          ? 'No encontramos número de puerta; revísalo antes de continuar.'
          : result.precision === 'approximate'
            ? 'La dirección es aproximada. Arrastra el pin hasta la entrada.'
            : '',
      );
      onAddressResolved?.(result);
    } catch {
      if (request === resolveRequest.current) setLocationError('Marcamos el punto, pero no pudimos completar la dirección automáticamente.');
    } finally {
      if (request === resolveRequest.current) setIsResolving(false);
    }
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setLocationError('Tu navegador no permite obtener la ubicacion.');
      return;
    }

    setIsLocating(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        void selectPosition({ latitude: coords.latitude, longitude: coords.longitude });
        setIsLocating(false);
      },
      () => {
        setLocationError('No pudimos acceder a tu ubicacion. Puedes marcarla en el mapa.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const center: [number, number] = value
    ? [value.latitude, value.longitude]
    : LIMA_CENTER;

  return (
    <Box sx={isExpanded ? { position: 'fixed', inset: 0, zIndex: 1500, bgcolor: 'white', p: { xs: 1.5, sm: 3 }, display: 'flex', flexDirection: 'column' } : undefined}>
      <Box sx={{ mb: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box>
          <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <MapPin size={16} /> Ubicacion exacta
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Haz clic sobre la puerta o entrada de entrega.
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Crosshair size={15} />}
          onClick={locate}
          disabled={isLocating}
        >
          {isLocating ? 'Ubicando...' : 'Mi ubicacion'}
        </Button>
        <Button
          size="small"
          variant="text"
          aria-label={isExpanded ? 'Cerrar mapa ampliado' : 'Ampliar mapa'}
          onClick={() => setIsExpanded((current) => !current)}
        >
          {isExpanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </Button>
      </Box>

      <Box
        role="application"
        aria-label="Mapa para seleccionar la ubicación exacta"
        sx={{
          height: isExpanded ? '100%' : { xs: 270, sm: 320 },
          flex: isExpanded ? 1 : undefined,
          overflow: 'hidden',
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          position: 'relative',
          '& .leaflet-container': { height: '100%', width: '100%', fontFamily: 'inherit' },
        }}
      >
        <Box sx={{ position: 'absolute', left: 12, top: 12, zIndex: 500, display: 'flex', alignItems: 'center', gap: .75, borderRadius: 99, bgcolor: 'rgba(255,255,255,.94)', px: 1.25, py: .7, color: isResolving ? 'text.secondary' : value ? 'primary.main' : 'text.secondary', boxShadow: '0 8px 24px rgba(10,35,22,.16)', backdropFilter: 'blur(8px)', fontSize: 12, fontWeight: 750 }}>
          {isResolving ? <LoaderCircle size={14} className="animate-spin" /> : value ? <CheckCircle2 size={14} /> : <Sparkles size={14} />}
          {isResolving ? 'Identificando dirección...' : value ? 'Punto seleccionado' : 'Haz clic para ubicarte'}
        </Box>
        <MapContainer center={center} zoom={value ? 17 : 12} scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapInteraction value={value} onChange={(position) => void selectPosition(position)} />
          {coveragePolygon && coveragePolygon.length >= 3 && (
            <Polygon
              positions={coveragePolygon.map((point) => [point.lat, point.lng])}
              pathOptions={{ color: '#21835a', fillColor: '#55b884', fillOpacity: .14, weight: 2 }}
            />
          )}
          <RecenterMap value={value} />
          <ResizeMap expanded={isExpanded} />
        </MapContainer>
      </Box>

      <Typography variant="caption" color={locationError ? 'error' : 'text.secondary'} sx={{ mt: 0.75, display: 'block' }}>
        {locationError || (resolvedLabel
          ? `Dirección detectada: ${resolvedLabel}`
          : value
          ? `${value.latitude.toFixed(6)}, ${value.longitude.toFixed(6)}`
          : 'La ubicacion ayuda a que el repartidor encuentre la entrega sin llamadas.')}
      </Typography>
      {resolutionNote && (
        <Typography role="status" variant="caption" sx={{ mt: .5, display: 'block', color: 'warning.dark', fontWeight: 650 }}>
          {resolutionNote}
        </Typography>
      )}
    </Box>
  );
};
