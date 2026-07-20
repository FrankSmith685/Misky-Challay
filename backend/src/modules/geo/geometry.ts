import type { GeoPoint } from '@database/models/coverageZone.model';

const orientation = (a: GeoPoint, b: GeoPoint, c: GeoPoint) =>
  Math.sign((b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng));

const onSegment = (a: GeoPoint, b: GeoPoint, p: GeoPoint) =>
  p.lng >= Math.min(a.lng, b.lng) && p.lng <= Math.max(a.lng, b.lng)
  && p.lat >= Math.min(a.lat, b.lat) && p.lat <= Math.max(a.lat, b.lat);

export const segmentsIntersect = (a: GeoPoint, b: GeoPoint, c: GeoPoint, d: GeoPoint) => {
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  if (first !== second && third !== fourth) return true;
  if (first === 0 && onSegment(a, b, c)) return true;
  if (second === 0 && onSegment(a, b, d)) return true;
  if (third === 0 && onSegment(c, d, a)) return true;
  return fourth === 0 && onSegment(c, d, b);
};

export const pointInPolygon = (point: GeoPoint, polygon: GeoPoint[]) => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index];
    const prior = polygon[previous];
    if ((current.lat > point.lat) !== (prior.lat > point.lat)
      && point.lng < ((prior.lng - current.lng) * (point.lat - current.lat)) / (prior.lat - current.lat) + current.lng) inside = !inside;
  }
  return inside;
};

export const polygonSelfIntersects = (polygon: GeoPoint[]) => {
  for (let first = 0; first < polygon.length; first += 1) {
    const firstNext = (first + 1) % polygon.length;
    for (let second = first + 1; second < polygon.length; second += 1) {
      const secondNext = (second + 1) % polygon.length;
      if (first === second || firstNext === second || secondNext === first) continue;
      if (segmentsIntersect(polygon[first], polygon[firstNext], polygon[second], polygon[secondNext])) return true;
    }
  }
  return false;
};

export const polygonsOverlap = (first: GeoPoint[], second: GeoPoint[]) => {
  if (first.some((point) => pointInPolygon(point, second)) || second.some((point) => pointInPolygon(point, first))) return true;
  return first.some((start, firstIndex) => second.some((otherStart, secondIndex) =>
    segmentsIntersect(start, first[(firstIndex + 1) % first.length], otherStart, second[(secondIndex + 1) % second.length]),
  ));
};

export const assertValidPolygon = (polygon: GeoPoint[] | null | undefined) => {
  if (!polygon) return;
  if (polygon.length < 3) throw new Error('El poligono necesita al menos 3 vertices');
  if (polygon.some((point) => !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180)) {
    throw new Error('El poligono contiene coordenadas invalidas');
  }
  if (polygonSelfIntersects(polygon)) throw new Error('El poligono se cruza consigo mismo. Ajusta sus vertices antes de publicar');
};
