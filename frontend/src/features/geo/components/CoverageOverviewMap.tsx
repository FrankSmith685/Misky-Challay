import { CircleMarker, MapContainer, Polygon, Popup, TileLayer } from 'react-leaflet';
// El candado de gestos vive junto al otro mapa del panel para que los dos se
// comporten igual; es el unico consumidor externo de ese archivo.
import { MapGestureLock } from './CoveragePolygonPicker';

interface OverviewZone {
  id: number;
  name: string;
  polygon: Array<{ lat: number; lng: number }> | null;
  isActive: boolean;
}

interface OverviewBranch {
  id: number;
  name: string;
  addressLine: string;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
}

export const CoverageOverviewMap = ({ zones, branches }: { zones: OverviewZone[]; branches: OverviewBranch[] }) => (
  <div className="overflow-hidden rounded-card border border-line bg-white shadow-e2">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <h2 className="font-extrabold text-ink">Mapa operativo</h2>
        <p className="mt-0.5 text-xs text-ink-muted">Zonas dibujadas y puntos de preparación activos.</p>
      </div>
      <div className="flex gap-3 text-xs text-ink-muted"><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-brand-400/50" /> Cobertura</span><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-brand-700" /> Cocina</span></div>
    </div>
    <div className="relative h-[340px] sm:h-[410px]">
      {/* Mapa de consulta: sin rueda atrapada y sin paneo tactil hasta que se pide.
          Es lo primero de la pantalla, asi que arrastrandolo se bloqueaba el scroll
          de toda la pagina de Cobertura. */}
      <MapContainer center={[-12.0464, -77.0428]} zoom={11} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapGestureLock />
        {zones.filter((zone) => zone.isActive && (zone.polygon?.length ?? 0) >= 3).map((zone) => (
          <Polygon key={zone.id} positions={zone.polygon!.map((point) => [point.lat, point.lng])} pathOptions={{ color: '#21835a', fillColor: '#55b884', fillOpacity: .18, weight: 2 }}><Popup><strong>{zone.name}</strong><br />Zona de entrega activa</Popup></Polygon>
        ))}
        {branches.filter((branch) => branch.isActive && branch.latitude != null && branch.longitude != null).map((branch) => (
          <CircleMarker key={branch.id} center={[branch.latitude!, branch.longitude!]} radius={9} pathOptions={{ color: '#fff', fillColor: '#176441', fillOpacity: 1, weight: 4 }}><Popup><strong>{branch.name}</strong><br />{branch.addressLine}</Popup></CircleMarker>
        ))}
      </MapContainer>
    </div>
  </div>
);
