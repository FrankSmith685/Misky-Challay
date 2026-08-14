import { City, District } from '@database/models';
import { env } from '@config/env';
import { peruUbigeoService } from './peruUbigeo.service';

export interface AddressSuggestion {
  id: string;
  label: string;
  line1: string;
  district: string | null;
  districtId: number | null;
  ubigeoCode: string | null;
  city: string | null;
  province: string | null;
  region: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  source: 'geoapify' | 'photon' | 'openstreetmap' | 'context';
  precision?: 'exact' | 'near' | 'approximate' | 'manual';
  hasHouseNumber?: boolean;
  distanceMeters?: number | null;
}

interface AddressContext {
  city: City | null;
  district: District | null;
  districts: District[];
  hierarchy: {
    department?: string;
    province?: string;
    district?: string;
  };
}

const cache = new Map<string, { expiresAt: number; rows: AddressSuggestion[] }>();
let nominatimGate = Promise.resolve();
let lastNominatimRequest = 0;

const normalizedContext = async (
  cityId?: number,
  districtId?: number,
  hierarchy: AddressContext['hierarchy'] = {},
): Promise<AddressContext> => {
  const [city, districts] = await Promise.all([
    cityId ? City.findByPk(cityId) : Promise.resolve(null),
    District.findAll({
      where: { ...(cityId ? { cityId } : {}), isActive: true },
      attributes: ['id', 'name', 'ubigeoCode'],
    }),
  ]);
  const district = districtId
    ? districts.find((item) => item.id === districtId) ?? null
    : null;
  return { city, district, districts, hierarchy };
};

const contextualLabel = (query: string, context: AddressContext) =>
  [
    query.trim(),
    context.hierarchy.district ?? context.district?.name,
    context.hierarchy.province ?? context.city?.name,
    context.hierarchy.department,
    'Perú',
  ]
    .filter((value, index, rows): value is string => !!value && rows.indexOf(value) === index)
    .join(', ');

const normalizeName = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const nationalHierarchy = (
  context: AddressContext,
  input: {
    districtNames: Array<string | null | undefined>;
    provinceNames?: Array<string | null | undefined>;
    departmentNames?: Array<string | null | undefined>;
    latitude?: number;
    longitude?: number;
  },
) => {
  const geographicDistrict = peruUbigeoService.matchDistrict(input);
  const operationalDistrict = geographicDistrict
    ? context.districts.find((row) => row.ubigeoCode === geographicDistrict.code) ?? null
    : context.district;

  return {
    geographicDistrict,
    operationalDistrict,
    district: geographicDistrict?.name
      ?? context.hierarchy.district
      ?? context.district?.name
      ?? input.districtNames.find((value): value is string => Boolean(value))
      ?? null,
    province: geographicDistrict?.province
      ?? context.hierarchy.province
      ?? context.city?.name
      ?? input.provinceNames?.find((value): value is string => Boolean(value))
      ?? null,
    department: geographicDistrict?.department
      ?? context.hierarchy.department
      ?? input.departmentNames?.find((value): value is string => Boolean(value))
      ?? null,
  };
};

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

const fromGeoapify = (
  row: Record<string, unknown>,
  context: AddressContext,
): AddressSuggestion => {
  const latitude = Number.isFinite(Number(row.lat)) ? Number(row.lat) : undefined;
  const longitude = Number.isFinite(Number(row.lon)) ? Number(row.lon) : undefined;
  const hierarchy = nationalHierarchy(context, {
    districtNames: [
      String(row.city_district ?? ''),
      String(row.district ?? ''),
      String(row.suburb ?? ''),
      String(row.city ?? ''),
    ],
    provinceNames: [String(row.county ?? ''), String(row.city ?? '')],
    departmentNames: [String(row.state ?? '')],
    latitude,
    longitude,
  });
  const line1 = String(row.address_line1 ?? row.formatted ?? '').trim();

  return {
    id: String(row.place_id ?? `${row.lat}-${row.lon}-${row.formatted}`),
    label: String(row.formatted ?? row.address_line1 ?? ''),
    line1,
    district: hierarchy.district,
    districtId: hierarchy.operationalDistrict?.id ?? null,
    ubigeoCode: hierarchy.geographicDistrict?.code ?? null,
    city: String(row.city ?? row.county ?? '') || null,
    province: hierarchy.province,
    region: hierarchy.department,
    postcode: String(row.postcode ?? '') || null,
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    source: 'geoapify',
    precision: row.result_type === 'building' || row.result_type === 'amenity'
      ? 'exact'
      : row.result_type === 'street'
        ? 'near'
        : 'approximate',
    hasHouseNumber: Boolean(row.housenumber),
  };
};

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    locality?: string;
    city?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    countrycode?: string;
    type?: string;
    osm_value?: string;
  };
}

const fromPhoton = (
  feature: PhotonFeature,
  context: AddressContext,
): AddressSuggestion | null => {
  const properties = feature.properties ?? {};
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) return null;

  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const hierarchy = nationalHierarchy(context, {
    districtNames: [
      properties.district,
      properties.locality,
      properties.city,
      properties.county,
    ],
    provinceNames: [properties.county, properties.city],
    departmentNames: [properties.state],
    latitude,
    longitude,
  });
  const road = properties.street ?? (
    properties.type === 'street' || properties.osm_value === 'residential'
      ? properties.name
      : undefined
  );
  const line1 = [road, properties.housenumber].filter(Boolean).join(' ').trim()
    || properties.name?.trim()
    || '';
  if (!line1) return null;

  const districtName = hierarchy.district;
  const cityName = properties.city ?? hierarchy.province ?? context.city?.name ?? null;
  const label = [
    line1,
    districtName,
    cityName,
    properties.state,
    properties.country ?? 'Perú',
  ]
    .filter((value, index, rows): value is string => Boolean(value) && rows.indexOf(value) === index)
    .join(', ');

  return {
    id: `photon-${properties.osm_type ?? 'x'}-${properties.osm_id ?? `${latitude}-${longitude}`}`,
    label,
    line1,
    district: districtName,
    districtId: hierarchy.operationalDistrict?.id ?? null,
    ubigeoCode: hierarchy.geographicDistrict?.code ?? null,
    city: cityName,
    province: hierarchy.province,
    region: hierarchy.department,
    postcode: properties.postcode ?? null,
    latitude,
    longitude,
    source: 'photon',
    precision: properties.housenumber ? 'exact' : road ? 'near' : 'approximate',
    hasHouseNumber: Boolean(properties.housenumber),
  };
};

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
  async suggestions(
    query: string,
    cityId?: number,
    districtId?: number,
    hierarchy: AddressContext['hierarchy'] = {},
  ): Promise<AddressSuggestion[]> {
    const context = await normalizedContext(cityId, districtId, hierarchy);
    const label = contextualLabel(query, context);
    const selectedGeography = peruUbigeoService.matchDistrict({
      districtNames: [hierarchy.district, context.district?.name],
      provinceNames: [hierarchy.province, context.city?.name],
      departmentNames: [hierarchy.department],
    });

    const provider = env.GEOAPIFY_API_KEY ? 'geoapify' : 'photon';
    const cacheKey = `suggest:${provider}:${label.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.rows;

    let rows: AddressSuggestion[] = [];
    if (env.GEOAPIFY_API_KEY) {
      const params = new URLSearchParams({
        text: label,
        format: 'json',
        lang: 'es',
        limit: '8',
        filter: 'countrycode:pe',
        apiKey: env.GEOAPIFY_API_KEY,
      });
      if (selectedGeography) {
        params.set('bias', `proximity:${selectedGeography.longitude},${selectedGeography.latitude}`);
      }
      const response = await fetch(`${env.GEOAPIFY_BASE_URL}/autocomplete?${params}`, {
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) throw new Error('El proveedor de direcciones no está disponible');
      const payload = await response.json() as { results?: Array<Record<string, unknown>> };
      rows = (payload.results ?? [])
        .map((row) => fromGeoapify(row, context))
        .filter((row) => row.label);
    } else {
      const params = new URLSearchParams({
        q: label,
        limit: '10',
      });
      if (selectedGeography) {
        params.set('lat', String(selectedGeography.latitude));
        params.set('lon', String(selectedGeography.longitude));
      }
      const response = await fetch(`${env.PHOTON_BASE_URL}/api?${params}`, {
        headers: { 'User-Agent': `VerdeBowl/1.0 (${env.FRONTEND_URL}; contact: ${env.MAIL_FROM})` },
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) throw new Error('El proveedor de direcciones no está disponible');
      const payload = await response.json() as { features?: PhotonFeature[] };
      rows = (payload.features ?? [])
        .map((feature) => fromPhoton(feature, context))
        .filter((row): row is AddressSuggestion => row !== null);
    }

    if (selectedGeography) {
      const contextualRows = rows.filter((row) => row.ubigeoCode === selectedGeography.code);
      rows = contextualRows.length > 0 ? contextualRows : [];
    }

    rows = rows
      .filter(
        (row, index, all) =>
          all.findIndex(
            (candidate) =>
              normalizeName(candidate.line1) === normalizeName(row.line1) &&
              candidate.ubigeoCode === row.ubigeoCode,
          ) === index,
      )
      .slice(0, 8);

    if (!rows.length) rows.push({
      id: `context-${query.toLowerCase().replace(/\s+/g, '-')}`,
      label,
      line1: query.trim(),
      district: hierarchy.district ?? selectedGeography?.name ?? context.district?.name ?? null,
      districtId: context.district?.id ?? null,
      ubigeoCode: selectedGeography?.code ?? context.district?.ubigeoCode ?? null,
      city: hierarchy.province ?? context.city?.name ?? null,
      province: hierarchy.province ?? context.city?.name ?? null,
      region: hierarchy.department ?? selectedGeography?.department ?? null,
      postcode: null,
      latitude: null,
      longitude: null,
      source: 'context',
      precision: 'manual',
      hasHouseNumber: /\d/.test(query),
    });
    cache.set(cacheKey, { expiresAt: Date.now() + 12 * 60 * 60 * 1000, rows });
    return rows;
  },

  async resolve(
    query: string,
    cityId?: number,
    districtId?: number,
    hierarchy: AddressContext['hierarchy'] = {},
  ): Promise<AddressSuggestion | null> {
    const context = await normalizedContext(cityId, districtId, hierarchy);
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
      const matchedHierarchy = match
        ? nationalHierarchy(context, {
            districtNames: [
              match.address?.city_district,
              match.address?.district,
              match.address?.municipality,
              match.address?.city,
              match.address?.suburb,
              match.address?.town,
            ],
            provinceNames: [match.address?.county, match.address?.city, match.address?.town],
            departmentNames: [match.address?.state, match.address?.region],
            latitude: Number(match.lat),
            longitude: Number(match.lon),
          })
        : null;
      const result: AddressSuggestion | null = match ? {
        id: String(match.place_id),
        label: match.display_name,
        line1: [
          match.address?.road ?? match.address?.pedestrian ?? query.trim(),
          match.address?.house_number,
        ].filter(Boolean).join(' ').trim(),
        district: matchedHierarchy?.district ?? null,
        districtId: matchedHierarchy?.operationalDistrict?.id ?? context.district?.id ?? null,
        ubigeoCode: matchedHierarchy?.geographicDistrict?.code ?? context.district?.ubigeoCode ?? null,
        city: match.address?.city ?? match.address?.town ?? matchedHierarchy?.province ?? context.city?.name ?? null,
        province: matchedHierarchy?.province ?? null,
        region: matchedHierarchy?.department ?? null,
        postcode: match.address?.postcode ?? null,
        latitude: Number(match.lat),
        longitude: Number(match.lon),
        source: 'openstreetmap',
        precision: match.address?.house_number ? 'exact' : 'near',
        hasHouseNumber: Boolean(match.address?.house_number),
      } : null;
      cache.set(cacheKey, { expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, rows: result ? [result] : [] });
      return result;
    });
  },

  async reverse(latitude: number, longitude: number, cityId?: number): Promise<AddressSuggestion | null> {
    const cacheKey = `reverse:${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.rows[0] ?? null;

    const context = await normalizedContext(cityId);

    return waitForNominatim(async () => {
      const params = new URLSearchParams({
        lat: String(latitude),
        lon: String(longitude),
        format: 'geocodejson',
        addressdetails: '1',
        zoom: '18',
        layer: 'address',
        'accept-language': 'es',
      });
      const response = await fetch(`${env.NOMINATIM_BASE_URL}/reverse?${params}`, {
        headers: { 'User-Agent': `VerdeBowl/1.0 (${env.FRONTEND_URL}; contact: ${env.MAIL_FROM})` },
      });
      if (!response.ok) throw new Error('No pudimos consultar la direccion de ese punto');
      const payload = await response.json() as {
        features?: Array<{
          geometry?: { coordinates?: [number, number] };
          properties?: {
            geocoding?: {
              place_id?: number | string;
              label?: string;
              name?: string;
              housenumber?: string;
              street?: string;
              locality?: string;
              district?: string;
              city?: string;
              county?: string;
              state?: string;
              postcode?: string;
              admin?: Record<string, string>;
            };
          };
        }>;
      };
      const feature = payload.features?.[0];
      const address = feature?.properties?.geocoding;
      if (!address?.label) return null;

      const admin = address.admin ?? {};
      const hierarchy = nationalHierarchy(context, {
        districtNames: [
          admin.level8,
          address.city,
          address.locality,
          address.district,
        ],
        provinceNames: [admin.level6, address.county],
        departmentNames: [admin.level4, address.state],
        latitude,
        longitude,
      });
      const road = address.street ?? address.name;
      const line1 = [road, address.housenumber].filter(Boolean).join(' ').trim()
        || address.label.split(',').slice(0, 2).join(',').trim();
      const matchedLongitude = Number(feature?.geometry?.coordinates?.[0]);
      const matchedLatitude = Number(feature?.geometry?.coordinates?.[1]);
      const distance = Number.isFinite(matchedLatitude) && Number.isFinite(matchedLongitude)
        ? distanceMeters({ lat: latitude, lng: longitude }, { lat: matchedLatitude, lng: matchedLongitude })
        : null;
      const result: AddressSuggestion = {
        id: String(address.place_id ?? cacheKey),
        label: address.label,
        line1,
        district: hierarchy.district,
        districtId: hierarchy.operationalDistrict?.id ?? null,
        ubigeoCode: hierarchy.geographicDistrict?.code ?? null,
        city: address.city ?? admin.level8 ?? hierarchy.province ?? context.city?.name ?? null,
        province: hierarchy.province,
        region: hierarchy.department,
        postcode: address.postcode ?? null,
        latitude,
        longitude,
        source: 'openstreetmap',
        hasHouseNumber: Boolean(address.housenumber),
        distanceMeters: distance,
        precision: distance === null || distance > 80 ? 'approximate' : distance > 25 ? 'near' : 'exact',
      };
      cache.set(cacheKey, { expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, rows: [result] });
      return result;
    });
  },
};
