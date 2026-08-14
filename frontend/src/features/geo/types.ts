export interface City {
  id: number;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
}

export interface District {
  id: number;
  cityId: number;
  name: string;
  slug: string;
  ubigeoCode: string | null;
  coverageZoneId: number | null;
}

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

export interface Branch {
  id: number;
  name: string;
  slug: string;
  addressLine: string;
  phone: string | null;
  prepMinutes: number;
  acceptsPickup: boolean;
  acceptsDelivery: boolean;
}

export interface CoverageResult {
  covered: boolean;
  reason?: string;
  zone?: {
    id: number;
    name: string;
    deliveryFee: number;
    minimumOrder: number;
    estimatedMinutes: number;
    polygon: Array<{ lat: number; lng: number }> | null;
  };
  branch?: {
    id: number;
    name: string;
    addressLine: string;
    prepMinutes: number;
    isOpenNow: boolean;
  };
  etaMinutes?: number;
  demandLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  etaSource?: 'LIVE_ROUTE' | 'ESTIMATE';
  routeDistanceKm?: number;
  nearestPickup?: {
    id: number;
    name: string;
    addressLine: string;
    distanceKm: number;
    isOpenNow: boolean;
  };
}

export interface DeliverySlot {
  id: number;
  startsAt: string;
  endsAt: string;
  available: number;
  orderCutoffAt: string;
}

export interface AddressSuggestion {
  id: string;
  label: string;
  line1: string;
  district: string | null;
  districtId: number | null;
  ubigeoCode: string | null;
  city: string | null;
  province?: string | null;
  region?: string | null;
  postcode?: string | null;
  latitude: number | null;
  longitude: number | null;
  source: 'geoapify' | 'photon' | 'openstreetmap' | 'context';
  precision?: 'exact' | 'near' | 'approximate' | 'manual';
  hasHouseNumber?: boolean;
  distanceMeters?: number | null;
}

export interface Address {
  id: number;
  label: string;
  line1: string;
  reference: string | null;
  districtId: number | null;
  ubigeoCode: string | null;
  departmentName: string | null;
  provinceName: string | null;
  districtName: string | null;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
  district?: { id: number; name: string; ubigeoCode: string | null } | null;
}
