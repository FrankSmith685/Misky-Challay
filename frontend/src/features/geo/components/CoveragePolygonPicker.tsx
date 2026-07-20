import { useRef } from 'react';
import { MapContainer, Marker, Polygon, TileLayer, useMapEvents } from 'react-leaflet';
import { divIcon, type LeafletEvent } from 'leaflet';
import { Download, Map, RotateCcw, Undo2, Upload } from 'lucide-react';
import { Button } from '@components/ui/Button';
import toast from 'react-hot-toast';

export interface PolygonPoint { lat: number; lng: number }

const DrawPolygon = ({ points, onChange }: { points: PolygonPoint[]; onChange: (points: PolygonPoint[]) => void }) => {
  useMapEvents({ click: (event) => onChange([...points, { lat: event.latlng.lat, lng: event.latlng.lng }]) });
  const vertexIcon = divIcon({ className: '', html: '<span style="display:block;width:18px;height:18px;border-radius:50%;background:#fff;border:4px solid #21835a;box-shadow:0 2px 8px #0004"></span>', iconSize: [18, 18], iconAnchor: [9, 9] });

  return <>
    {points.length > 0 && <Polygon positions={points.map((point) => [point.lat, point.lng])} pathOptions={{ color: '#21835a', fillColor: '#4caf7d', fillOpacity: .2, weight: 3 }} />}
    {points.map((point, index) => (
      <Marker
        key={`${index}-${point.lat}-${point.lng}`}
        position={[point.lat, point.lng]}
        draggable
        icon={vertexIcon}
        title={`Vértice ${index + 1}. Arrastra para ajustar; doble clic para eliminar.`}
        eventHandlers={{
          dragend: (event: LeafletEvent) => {
            const marker = event.target as { getLatLng: () => { lat: number; lng: number } };
            const next = [...points];
            next[index] = marker.getLatLng();
            onChange(next);
          },
          dblclick: (event) => {
            event.originalEvent.stopPropagation();
            onChange(points.filter((_, pointIndex) => pointIndex !== index));
          },
        }}
      />
    ))}
  </>;
};

export const CoveragePolygonPicker = ({ value, onChange }: { value: PolygonPoint[]; onChange: (points: PolygonPoint[]) => void }) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const importGeoJson = async (file?: File) => {
    if (!file) return;
    const payload = JSON.parse(await file.text()) as { type?: string; geometry?: { coordinates?: number[][][] }; coordinates?: number[][][] } | PolygonPoint[];
    if (Array.isArray(payload)) {
      const points = payload.map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) })).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
      if (points.length < 3) throw new Error('El archivo debe contener al menos 3 puntos');
      onChange(points);
      return;
    }
    const coordinates = payload.type === 'Feature' ? payload.geometry?.coordinates?.[0] : payload.coordinates?.[0];
    if (!coordinates || coordinates.length < 4) throw new Error('El archivo no contiene un polígono GeoJSON válido');
    onChange(coordinates.slice(0, -1).map(([lng, lat]) => ({ lat, lng })));
  };

  const exportGeoJson = () => {
    if (value.length < 3) return;
    const coordinates = value.map((point) => [point.lng, point.lat]);
    const payload = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...coordinates, coordinates[0]]] } };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'zona-cobertura.geojson';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <div>
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="flex items-center gap-2 text-sm font-bold text-ink"><Map className="size-4 text-brand-700" /> Área exacta de cobertura</p>
        <p className="mt-0.5 text-xs text-ink-muted">Haz clic para crear puntos; arrástralos para ajustar y haz doble clic para eliminar.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".geojson,.json,application/geo+json,application/json" className="hidden" onChange={(event) => { void importGeoJson(event.target.files?.[0]).then(() => toast.success('Polígono importado')).catch((error) => toast.error(error instanceof Error ? error.message : 'No pudimos importar el archivo')); event.target.value = ''; }} />
        <Button type="button" size="sm" variant="ghost" onClick={() => fileRef.current?.click()}><Upload className="size-3.5" /> Importar</Button>
        <Button type="button" size="sm" variant="ghost" disabled={value.length < 3} onClick={exportGeoJson}><Download className="size-3.5" /> Exportar</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!value.length} onClick={() => onChange(value.slice(0, -1))}><Undo2 className="size-3.5" /> Deshacer</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!value.length} onClick={() => onChange([])}><RotateCcw className="size-3.5" /> Limpiar</Button>
      </div>
    </div>
    <div role="application" aria-label="Mapa para dibujar el área de cobertura" className="h-[360px] overflow-hidden rounded-2xl border border-line bg-surface-muted ring-1 ring-black/[.02]">
      <MapContainer center={[-12.0464, -77.0428]} zoom={11} scrollWheelZoom className="h-full w-full">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <DrawPolygon points={value} onChange={onChange} />
      </MapContainer>
    </div>
    <p className={`mt-2 text-xs ${value.length >= 3 ? 'font-semibold text-brand-700' : 'text-ink-muted'}`}>{value.length >= 3 ? `Polígono listo · ${value.length} puntos` : `${value.length}/3 puntos mínimos`}</p>
  </div>;
};
