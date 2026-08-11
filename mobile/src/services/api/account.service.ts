import type { Address } from '../../types/domain';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

export interface AddressInput {
  label: string; line1: string; reference?: string; districtId?: number | null; ubigeoCode?: string | null;
  departmentName?: string | null; provinceName?: string | null; districtName?: string | null;
  latitude?: number | null; longitude?: number | null; isDefault?: boolean;
}

export const accountApi = {
  addresses: () => apiRequest<Address[]>(ENDPOINTS.account.addresses, { auth: true }),
  createAddress: (input: AddressInput) => apiRequest<Address>(ENDPOINTS.account.addresses, { method: 'POST', body: input, auth: true }),
  deleteAddress: (id: number) => apiRequest<null>(ENDPOINTS.account.address(id), { method: 'DELETE', auth: true }),
};
