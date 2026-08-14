import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, Polygon, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { DomEvent, divIcon, type LeafletEvent } from 'leaflet';
import { Download, Hand, Lock, Map, RotateCcw, Trash2, Undo2, Upload } from 'lucide-react';
import { Button } from '@components/ui/Button';
import toast from '@components/mui/MuiToast';

export interface PolygonPoint { lat: number; lng: number }

/**
 * Puntero grueso = dedo. Se vuelve a evaluar en caliente porque una tablet con
 * teclado y raton cambia de modo sin recargar la pagina.
 */
const useCoarsePointer = () => {
  const [isCoarse, setIsCoarse] = useState(() => window.matchMedia('(pointer: coarse)').matches);

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const update = () => setIsCoarse(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return isCoarse;
};

/**
 * CANDADO DE GESTOS DEL MAPA
 * ---------------------------------------------------------------------------
 * Leaflet arranca con `dragging: true`, asi que en tactil CUALQUIER deslizamiento
 * vertical que empiece sobre el mapa paneaba el mapa en vez de bajar la pagina.
 * Agravante: el editor de zona vive dentro de un dialogo que ya scrollea y que va
 * a pantalla completa por debajo de 600 px, de modo que el mapa se comia el unico
 * scroll disponible.
 *
 * Con puntero fino no hay conflicto (la rueda ya va desactivada en el contenedor
 * y arrastrar es deliberado), asi que el candado solo existe en tactil: el mapa
 * nace fijo —se puede tocar para poner puntos y hacer pinza para acercar, que no
 * son gestos de scroll— y se libera a proposito con el boton.
 *
 * Se monta DENTRO del `<MapContainer>`: sus hijos se renderizan dentro del
 * `.leaflet-container`, que es `position: relative`.
 */
export const MapGestureLock = () => {
  const map = useMap();
  const isCoarse = useCoarsePointer();
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (unlocked || !isCoarse) map.dragging.enable();
    else map.dragging.disable();
  }, [isCoarse, map, unlocked]);

  useEffect(() => {
    if (!isCoarse) setUnlocked(false);
  }, [isCoarse]);

  /* Leaflet escucha el clic en el contenedor, POR DEBAJO de donde React monta sus
   * manejadores: sin esto, pulsar el boton tambien crearia un vertice. */
  const attach = (node: HTMLDivElement | null) => {
    if (!node) return;
    DomEvent.disableClickPropagation(node);
    DomEvent.disableScrollPropagation(node);
  };

  if (!isCoarse) return null;

  return (
    <div ref={attach} className="absolute right-3 top-3 z-1000">
      <Button
        type="button"
        variant={unlocked ? 'primary' : 'outline'}
        leftIcon={unlocked ? <Lock className="size-4" /> : <Hand className="size-4" />}
        aria-pressed={unlocked}
        onClick={() => setUnlocked((current) => !current)}
      >
        {unlocked ? 'Fijar mapa' : 'Activar mapa'}
      </Button>
    </div>
  );
};

const DrawPolygon = ({ points, selected, onChange, onSelect }: { points: PolygonPoint[]; selected: number | null; onChange: (points: PolygonPoint[]) => void; onSelect: (index: number | null) => void }) => {
  useMapEvents({
    click: (event) => {
      onSelect(null);
      onChange([...points, { lat: event.latlng.lat, lng: event.latlng.lng }]);
    },
  });
  const isCoarse = useCoarsePointer();
  /* 30 px con el dedo: a 18 px el vertice medía menos de la mitad del paso tactil
   * del sistema y arrastrarlo era cuestion de puntería. */
  const size = isCoarse ? 30 : 18;
  const vertexIcon = (isSelected: boolean) => divIcon({
    className: '',
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${isSelected ? '#b91c1c' : '#fff'};border:4px solid ${isSelected ? '#fff' : '#21835a'};box-shadow:0 2px 8px #0004${isSelected ? ',0 0 0 3px #b91c1c' : ''}"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

  return <>
    {points.length > 0 && <Polygon positions={points.map((point) => [point.lat, point.lng])} pathOptions={{ color: '#21835a', fillColor: '#4caf7d', fillOpacity: .2, weight: 3 }} />}
    {points.map((point, index) => (
      <Marker
        key={`${index}-${point.lat}-${point.lng}`}
        position={[point.lat, point.lng]}
        draggable
        icon={vertexIcon(selected === index)}
        title={`Vértice ${index + 1}. Arrastra para ajustar; tócalo para seleccionarlo y poder eliminarlo.`}
        eventHandlers={{
          dragend: (event: LeafletEvent) => {
            const marker = event.target as { getLatLng: () => { lat: number; lng: number } };
            const next = [...points];
            next[index] = marker.getLatLng();
            onChange(next);
          },
          /* Seleccionar y borrar desde la barra, no doble clic sobre un blanco de
           * 18 px: con el dedo ese doble toque acababa creando dos vertices. */
          click: () => onSelect(selected === index ? null : index),
        }}
      />
    ))}
  </>;
};

export const CoveragePolygonPicker = ({ value, onChange }: { value: PolygonPoint[]; onChange: (points: PolygonPoint[]) => void }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<number | null>(null);

  /* La seleccion apunta a una POSICION: si el poligono encoge (deshacer, limpiar,
   * importar) el indice guardado dejaria de existir o senalaria a otro vertice. */
  useEffect(() => {
    setSelected((current) => (current !== null && current >= value.length ? null : current));
  }, [value.length]);

  const removeSelected = useCallback(() => {
    if (selected === null) return;
    onChange(value.filter((_, index) => index !== selected));
    setSelected(null);
  }, [onChange, selected, value]);

  useEffect(() => {
    if (selected === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Solo Suprimir, y nunca mientras se escribe: el picker convive con los
      // campos de nombre y tarifa dentro del mismo dialogo.
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      if (event.key === 'Delete') removeSelected();
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [removeSelected, selected]);

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
        <p className="mt-0.5 text-xs text-ink-muted">Haz clic para crear puntos y arrástralos para ajustar. Selecciona uno para poder eliminarlo.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".geojson,.json,application/geo+json,application/json" className="hidden" onChange={(event) => { void importGeoJson(event.target.files?.[0]).then(() => toast.success('Polígono importado')).catch((error) => toast.error(error instanceof Error ? error.message : 'No pudimos importar el archivo')); event.target.value = ''; }} />
        <Button type="button" size="sm" variant="ghost" onClick={() => fileRef.current?.click()}><Upload className="size-3.5" /> Importar</Button>
        <Button type="button" size="sm" variant="ghost" disabled={value.length < 3} onClick={exportGeoJson}><Download className="size-3.5" /> Exportar</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!value.length} onClick={() => onChange(value.slice(0, -1))}><Undo2 className="size-3.5" /> Deshacer</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!value.length} onClick={() => { onChange([]); setSelected(null); }}><RotateCcw className="size-3.5" /> Limpiar</Button>
      </div>
    </div>
    {selected !== null && (
      <div role="status" className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-card border border-red-200 bg-red-50/60 px-3 py-2">
        <p className="text-xs font-bold text-ink">Vértice {selected + 1} seleccionado</p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(null)}>Deseleccionar</Button>
          <Button type="button" size="sm" variant="danger" leftIcon={<Trash2 className="size-3.5" />} onClick={removeSelected}>Eliminar vértice</Button>
        </div>
      </div>
    )}
    <div role="application" aria-label="Mapa para dibujar el área de cobertura" className="relative h-[360px] overflow-hidden rounded-2xl border border-line bg-surface-muted ring-1 ring-black/[.02]">
      {/* `scrollWheelZoom` desactivado: dentro de un dialogo que ya scrollea, la
          rueda quedaba atrapada en el mapa y la pagina no bajaba. Se acerca con
          los botones +/- de Leaflet o con pinza. */}
      <MapContainer center={[-12.0464, -77.0428]} zoom={11} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapGestureLock />
        <DrawPolygon points={value} selected={selected} onChange={onChange} onSelect={setSelected} />
      </MapContainer>
    </div>
    <p className={`mt-2 text-xs ${value.length >= 3 ? 'font-semibold text-brand-700' : 'text-ink-muted'}`}>{value.length >= 3 ? `Polígono listo · ${value.length} puntos` : `${value.length}/3 puntos mínimos`}</p>
  </div>;
};
