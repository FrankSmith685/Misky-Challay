import fs from 'node:fs';
import path from 'node:path';

export interface PeruDepartment {
  code: string;
  name: string;
}

export interface PeruProvince {
  code: string;
  departmentCode: string;
  name: string;
}

export interface PeruDistrict {
  code: string;
  departmentCode: string;
  department: string;
  provinceCode: string;
  province: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface RawUbigeo {
  code: string;
  department: string;
  province: string;
  district: string;
  latitude: number;
  longitude: number;
}

const ubigeos = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'peru-ubigeo-2025.json'), 'utf8'),
) as RawUbigeo[];

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\bcuzco\b/g, 'cusco')
  .replace(/\bprovincia\s+constitucional\s+(de|del)?\s*/g, '')
  .replace(/\b(departamento|provincia|distrito|region|municipalidad)\s+(de|del)?\s*/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const districtNameVariants = (value: string) => {
  const normalized = normalize(value);
  return Array.from(new Set([
    normalized,
    normalized.replace(/^cercado de\s+/, ''),
  ]));
};

const distanceSquared = (
  row: { latitude: number; longitude: number },
  latitude?: number,
  longitude?: number,
) => {
  if (latitude === undefined || longitude === undefined) return 0;
  return (row.latitude - latitude) ** 2 + (row.longitude - longitude) ** 2;
};

const departments: PeruDepartment[] = Array.from(
  new Map(
    ubigeos.map((row) => [
      row.code.slice(0, 2),
      { code: row.code.slice(0, 2), name: row.department },
    ]),
  ).values(),
).sort((a, b) => a.name.localeCompare(b.name, 'es'));

const provinces: PeruProvince[] = Array.from(
  new Map(
    ubigeos.map((row) => [
      row.code.slice(0, 4),
      {
        code: row.code.slice(0, 4),
        departmentCode: row.code.slice(0, 2),
        name: row.province,
      },
    ]),
  ).values(),
).sort((a, b) => a.name.localeCompare(b.name, 'es'));

const districts: PeruDistrict[] = ubigeos
  .map((row) => ({
    code: row.code,
    departmentCode: row.code.slice(0, 2),
    department: row.department,
    provinceCode: row.code.slice(0, 4),
    province: row.province,
    name: row.district,
    latitude: row.latitude,
    longitude: row.longitude,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));

export const peruUbigeoService = {
  listDepartments: () => departments,

  listProvinces: (departmentCode: string) =>
    provinces.filter((row) => row.departmentCode === departmentCode),

  listDistricts: (provinceCode: string) =>
    districts.filter((row) => row.provinceCode === provinceCode),

  findDistrictByCode: (code?: string | null) =>
    code ? districts.find((row) => row.code === code) ?? null : null,

  /**
   * Homologa la jerarquía que devuelve el proveedor de mapas con UBIGEO.
   * Los nombres del proveedor no siempre usan el mismo nivel administrativo,
   * por eso se usan todas sus variantes y las coordenadas solo para desempatar.
   */
  matchDistrict(input: {
    districtNames: Array<string | null | undefined>;
    provinceNames?: Array<string | null | undefined>;
    departmentNames?: Array<string | null | undefined>;
    latitude?: number;
    longitude?: number;
  }): PeruDistrict | null {
    const districtNames = input.districtNames
      .filter(Boolean)
      .flatMap((value) => districtNameVariants(String(value)));
    const provinceNames = (input.provinceNames ?? []).filter(Boolean).map((value) => normalize(String(value)));
    const departmentNames = (input.departmentNames ?? []).filter(Boolean).map((value) => normalize(String(value)));

    // Department and province are more reliable than neighbourhood names.
    // Scope the catalogue first so "Pachacutec" in Callao can never resolve
    // to the homonymous official district in Ica.
    let scope = districts;
    const byDepartment = scope.filter((row) =>
      departmentNames.includes(normalize(row.department)),
    );
    if (byDepartment.length) scope = byDepartment;

    const byProvince = scope.filter((row) =>
      provinceNames.includes(normalize(row.province)),
    );
    if (byProvince.length) scope = byProvince;

    const candidates = scope.filter((row) =>
      districtNameVariants(row.name).some((name) => districtNames.includes(name)),
    );
    if (!candidates.length) return null;

    const nearest = [...candidates].sort(
      (a, b) =>
        distanceSquared(a, input.latitude, input.longitude)
        - distanceSquared(b, input.latitude, input.longitude),
    )[0] ?? null;

    // Reject a same-name district that is implausibly far from the pin.
    if (
      nearest &&
      input.latitude !== undefined &&
      input.longitude !== undefined &&
      distanceSquared(nearest, input.latitude, input.longitude) > 2.25
    ) {
      return null;
    }

    return nearest;
  },
};
