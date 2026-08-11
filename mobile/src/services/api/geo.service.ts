import type { AddressSuggestion, Branch, CoverageResult, DeliverySlot } from '../../types/domain';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

export const geoApi = {
  branches: () => apiRequest<Branch[]>(ENDPOINTS.locations.branches),
  departments: () => apiRequest<Array<{ code: string; name: string }>>(ENDPOINTS.locations.departments),
  provinces: (departmentCode: string) => apiRequest<Array<{ code: string; departmentCode: string; name: string }>>(ENDPOINTS.locations.provinces, { query: { departmentCode } }),
  districts: (provinceCode: string) => apiRequest<Array<{ code: string; department: string; provinceCode: string; province: string; name: string; latitude: number; longitude: number }>>(ENDPOINTS.locations.districts, { query: { provinceCode } }),
  suggestions: (input: { query: string; department?: string; province?: string; district?: string }) => apiRequest<AddressSuggestion[]>(ENDPOINTS.locations.suggestions, { query: { q: input.query, department: input.department, province: input.province, district: input.district } }),
  reverse: (input: { latitude: number; longitude: number }) => apiRequest<AddressSuggestion | null>(ENDPOINTS.locations.reverse, { method: 'POST', body: input }),
  coverage: (input: { districtId?: number; latitude?: number; longitude?: number }) => apiRequest<CoverageResult>(ENDPOINTS.locations.coverage, { method: 'POST', body: input }),
  slots: (branchId: number, days = 7) => apiRequest<DeliverySlot[]>(ENDPOINTS.locations.slots, { query: { branchId, days } }),
};
