import { api } from '@services/api/client';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess } from '@/types/api';
import type { AddressSuggestion, City, CoverageResult, District, Branch, DeliverySlot, PeruDepartment, PeruDistrict, PeruProvince } from '../types';

export const geoApi = {
  async getCities(): Promise<City[]> {
    const { data } = await api.get<ApiSuccess<City[]>>(ENDPOINTS.locations.cities);
    return data.data;
  },

  async getDistricts(cityId: number): Promise<District[]> {
    const { data } = await api.get<ApiSuccess<District[]>>(ENDPOINTS.locations.districts, {
      params: { cityId },
    });
    return data.data;
  },

  async getDepartments(): Promise<PeruDepartment[]> {
    const { data } = await api.get<ApiSuccess<PeruDepartment[]>>(ENDPOINTS.locations.departments);
    return data.data;
  },

  async getProvinces(departmentCode: string): Promise<PeruProvince[]> {
    const { data } = await api.get<ApiSuccess<PeruProvince[]>>(ENDPOINTS.locations.provinces, {
      params: { departmentCode },
    });
    return data.data;
  },

  async getGeographicDistricts(provinceCode: string): Promise<PeruDistrict[]> {
    const { data } = await api.get<ApiSuccess<PeruDistrict[]>>(ENDPOINTS.locations.geographicDistricts, {
      params: { provinceCode },
    });
    return data.data;
  },

  async getBranches(cityId?: number): Promise<Branch[]> {
    const { data } = await api.get<ApiSuccess<Branch[]>>(ENDPOINTS.locations.branches, {
      params: cityId ? { cityId } : {},
    });
    return data.data;
  },

  async addressSuggestions(input: {
    query: string;
    cityId?: number;
    districtId?: number;
    department?: string;
    province?: string;
    district?: string;
  }): Promise<AddressSuggestion[]> {
    const { data } = await api.get<ApiSuccess<AddressSuggestion[]>>('/locations/address-suggestions', {
      params: {
        q: input.query,
        cityId: input.cityId,
        districtId: input.districtId,
        department: input.department,
        province: input.province,
        district: input.district,
      },
    });
    return data.data;
  },

  async resolveAddress(input: {
    query: string;
    cityId?: number;
    districtId?: number;
    department?: string;
    province?: string;
    district?: string;
  }): Promise<AddressSuggestion | null> {
    const { data } = await api.post<ApiSuccess<AddressSuggestion | null>>('/locations/resolve-address', input);
    return data.data;
  },

  async reverseAddress(input: { latitude: number; longitude: number; cityId?: number }): Promise<AddressSuggestion | null> {
    const { data } = await api.post<ApiSuccess<AddressSuggestion | null>>('/locations/reverse-address', input);
    return data.data;
  },

  /** RN-001: pregunta al backend si llegamos a esa direccion. */
  async checkCoverage(payload: {
    cityId?: number;
    districtId?: number;
    latitude?: number;
    longitude?: number;
  }): Promise<CoverageResult> {
    const { data } = await api.post<ApiSuccess<CoverageResult>>(
      ENDPOINTS.locations.coverage,
      payload,
    );
    return data.data;
  },

  async getSlots(branchId: number, days = 7, vehicleType?: 'CAR'): Promise<DeliverySlot[]> {
    const { data } = await api.get<ApiSuccess<DeliverySlot[]>>(ENDPOINTS.locations.slots, {
      params: { branchId, days, vehicleType },
    });
    return data.data;
  },
};
