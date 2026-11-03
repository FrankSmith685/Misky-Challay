import type { GeoPoint } from '@database/models/coverageZone.model';

export interface ExtensionZone {
  polygon: GeoPoint[] | null;
  extraCoverageKm: number;
  extraFeePerKm: number;
  priority: number;
}

/** Distancia recta mínima al borde de un polígono urbano, en kilómetros. */
export const distanceToPolygonKm = (point: GeoPoint, polygon: GeoPoint[]): number => {
  const xFactor = 111.32 * Math.cos(point.lat * Math.PI / 180);
  const toXY = (vertex: GeoPoint) => ({ x: (vertex.lng - point.lng) * xFactor, y: (vertex.lat - point.lat) * 110.574 });
  let nearest = Infinity;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = toXY(polygon[index]);
    const b = toXY(polygon[(index + 1) % polygon.length]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const projection = lengthSquared ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSquared)) : 0;
    nearest = Math.min(nearest, Math.hypot(a.x + projection * dx, a.y + projection * dy));
  }
  return nearest;
};

export const coverageExtensionFor = <T extends ExtensionZone>(point: GeoPoint, zones: T[]): { zone: T; distanceKm: number; fee: number } | null => {
  const eligible = zones.flatMap((zone) => {
    const maximum = Number(zone.extraCoverageKm);
    const rate = Number(zone.extraFeePerKm);
    // Un límite de 0 permite cotizar cualquier distancia adicional; tarifa 0 desactiva la extensión.
    if (!Array.isArray(zone.polygon) || zone.polygon.length < 3 || rate <= 0) return [];
    const distanceKm = distanceToPolygonKm(point, zone.polygon);
    return maximum === 0 || distanceKm <= maximum
      ? [{ zone, distanceKm, fee: Math.max(0.01, Math.round(distanceKm * rate * 100) / 100) }]
      : [];
  });
  return eligible.sort((a, b) => a.distanceKm - b.distanceKm || a.zone.priority - b.zone.priority)[0] ?? null;
};
