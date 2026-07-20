import { City, District } from '@database/models';
import { env } from '@config/env';

export interface AddressSuggestion {
  id: string;
  label: string;
  line1: string;
  district: string | null;
  districtId: number | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  source: 'geoapify' | 'openstreetmap' | 'context';
  precision?: 'exact' | 'near' | 'approximate' | 'manual';
  hasHouseNumber?: boolean;
  distanceMeters?: number | null;
}

interface AddressContext {
  city: City;
  district: District | null;
}

const cache = new Map<string, { expiresAt: number; rows: AddressSuggestion[] }>();
let nominatimGate = Promise.resolve();
let lastNominatimRequest = 0;

const normalizedContext = async (cityId: number, districtId?: number): Promise<AddressContext> => {
  const city = await City.findByPk(cityId);
  if (!city) throw new Error('Ciudad no encontrada');
  const district = districtId
    ? await District.findOne({ where: { id: districtId, cityId, isActive: true } })
    : null;
  return { city, district };
};

const contextualLabel = (query: string, context: AddressContext) =>
  [query.trim(), context.district?.name, context.city.name, 'Lima', 'Peru']
    .filter((value, index, rows): value is string => !!value && rows.indexOf(value) === index)
    .join(', ');

const normalizeName = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const distanceMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const radians = (value: number) => value * Math.PI / 180;
  const earthRadius = 6_371_000;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * earthRadius * Math.asin(Math.sqrt(haversine)));
};

const fromGeoapify = (row: Record<string, unknown>): AddressSuggestion => ({
  id: String(row.place_id ?? `${row.lat}-${row.lon}-${row.formatted}`),
  label: String(row.formatted ?? row.address_line1 ?? ''),
  line1: String(row.address_line1 ?? row.formatted ?? ''),
  district: String(row.suburb ?? row.district ?? row.city_district ?? '') || null,
  districtId: null,
  city: String(row.city ?? row.county ?? '') || null,
  latitude: Number.isFinite(Number(row.lat)) ? Number(row.lat) : null,
  longitude: Number.isFinite(Number(row.lon)) ? Number(row.lon) : null,
  source: 'geoapify',
});

const waitForNominatim = async <T>(operation: () => Promise<T>): Promise<T> => {
  const run = nominatimGate.then(async () => {
    const delay = Math.max(0, 1050 - (Date.now() - lastNominatimRequest));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastNominatimRequest = Date.now();
    return operation();
  });
  nominatimGate = run.then(() => undefined, () => undefined);
  return run;
};

export const geocodingService = {
  async suggestions(query: string, cityId: number, districtId?: number): Promise<AddressSuggestion[]> {
    const context = await normalizedContext(cityId, districtId);
    const label = contextualLabel(query, context);

    if (!env.GEOAPIFY_API_KEY) {
      return [{
        id: `context-${query.toLowerCase().replace(/\s+/g, '-')}`,
        label,
        line1: query.trim(),
        district: context.district?.name ?? null,
        districtId: context.district?.id ?? null,
        city: context.city.name,
        latitude: null,
        longitude: null,
        source: 'context',
      }];
    }

    const cacheKey = `suggest:${label.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.rows;

    const params = new URLSearchParams({
      text: label,
      format: 'json',
      lang: 'es',
      limit: '6',
      filter: 'countrycode:pe',
      bias: 'proximity:-77.0428,-12.0464',
      apiKey: env.GEOAPIFY_API_KEY,
    });
    const response = await fetch(`${env.GEOAPIFY_BASE_URL}/autocomplete?${params}`);
    if (!response.ok) throw new Error('El proveedor de direcciones no esta disponible');
    const payload = await response.json() as { results?: Array<Record<string, unknown>> };
    const rows = (payload.results ?? []).map(fromGeoapify).filter((row) => row.label);
    if (!rows.length) rows.push({
      id: `context-${query.toLowerCase().replace(/\s+/g, '-')}`,
      label,
      line1: query.trim(),
      district: context.district?.name ?? null,
      districtId: context.district?.id ?? null,
      city: context.city.name,
      latitude: null,
      longitude: null,
      source: 'context',
    });
    cache.set(cacheKey, { expiresAt: Date.now() + 24 * 60 * 60 * 1000, rows });
    return rows;
  },

  async resolve(query: string, cityId: number, districtId?: number): Promise<AddressSuggestion | null> {
    const context = await normalizedContext(cityId, districtId);
    const label = contextualLabel(query, context);
    const cacheKey = `resolve:${label.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.rows[0] ?? null;

    return waitForNominatim(async () => {
      const params = new URLSearchParams({
        q: label,
        format: 'jsonv2',
        addressdetails: '1',
        countrycodes: 'pe',
        limit: '1',
        'accept-language': 'es',
      });
      const response = await fetch(`${env.NOMINATIM_BASE_URL}/search?${params}`, {
        headers: { 'User-Agent': `VerdeBowl/1.0 (${env.FRONTEND_URL}; contact: ${env.MAIL_FROM})` },
      });
      if (!response.ok) throw new Error('No pudimos consultar el servicio de mapas');
      const rows = await response.json() as Array<{ place_id: number; display_name: string; lat: string; lon: string; address?: Record<string, string> }>;
      const match = rows[0];
      const result: AddressSuggestion | null = match ? {
        id: String(match.place_id),
        label: match.display_name,
        line1: query.trim(),
        district: match.address?.suburb ?? match.address?.city_district ?? context.district?.name ?? null,
        districtId: context.district?.id ?? null,
        city: match.address?.city ?? match.address?.town ?? context.city.name,
        latitude: Number(match.lat),
        longitude: Number(match.lon),
        source: 'openstreetmap',
      } : null;
      cache.set(cacheKey, { expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, rows: result ? [result] : [] });
      return result;
    });
  },

  async reverse(latitude: number, longitude: number, cityId: number): Promise<AddressSuggestion | null> {
    const cacheKey = `reverse:${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.rows[0] ?? null;

    const [city, districts] = await Promise.all([
      City.findByPk(cityId),
      District.findAll({ where: { cityId, isActive: true }, attributes: ['id', 'name'] }),
    ]);
    if (!city) throw new Error('Ciudad no encontrada');

    return waitForNominatim(async () => {
      const params = new URLSearchParams({
        lat: String(latitude),
        lon: String(longitude),
        format: 'jsonv2',
        addressdetails: '1',
        zoom: '18',
        layer: 'address',
        'accept-language': 'es',
      });
      const response = await fetch(`${env.NOMINATIM_BASE_URL}/reverse?${params}`, {
        headers: { 'User-Agent': `VerdeBowl/1.0 (${env.FRONTEND_URL}; contact: ${env.MAIL_FROM})` },
      });
      if (!response.ok) throw new Error('No pudimos consultar la direccion de ese punto');
      const match = await response.json() as { place_id?: number; display_name?: string; lat?: string; lon?: string; address?: Record<string, string>; error?: string };
      if (match.error || !match.display_name) return null;

      const address = match.address ?? {};
      const districtCandidates = [address.suburb, address.city_district, address.district, address.municipality, address.town]
        .filter((value): value is string => !!value)
        .map(normalizeName);
      const district = districts.find((row) => {
        const name = normalizeName(row.name);
        return districtCandidates.some((candidate) => candidate === name || candidate.includes(name) || name.includes(candidate));
      }) ?? null;
      const road = address.road ?? address.pedestrian ?? address.residential ?? address.neighbourhood ?? address.amenity;
      const line1 = [road, address.house_number].filter(Boolean).join(' ').trim()
        || match.display_name.split(',').slice(0, 2).join(',').trim();
      const matchedLatitude = Number(match.lat);
      const matchedLongitude = Number(match.lon);
      const distance = Number.isFinite(matchedLatitude) && Number.isFinite(matchedLongitude)
        ? distanceMeters({ lat: latitude, lng: longitude }, { lat: matchedLatitude, lng: matchedLongitude })
        : null;
      const result: AddressSuggestion = {
        id: String(match.place_id ?? cacheKey),
        label: match.display_name,
        line1,
        district: district?.name ?? address.suburb ?? address.city_district ?? address.district ?? null,
        districtId: district?.id ?? null,
        city: address.city ?? address.town ?? city.name,
        latitude,
        longitude,
        source: 'openstreetmap',
        hasHouseNumber: Boolean(address.house_number),
        distanceMeters: distance,
        precision: distance === null || distance > 80 ? 'approximate' : distance > 25 ? 'near' : 'exact',
      };
      cache.set(cacheKey, { expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, rows: [result] });
      return result;
    });
  },
};
