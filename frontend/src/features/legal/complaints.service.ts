import api from '@services/api/client';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess } from '@/types/api';

export interface ComplaintInput {
  type: 'RECLAMO' | 'QUEJA';
  itemType: 'PRODUCTO' | 'SERVICIO';
  consumerName: string;
  docType: 'DNI' | 'CE' | 'PASAPORTE' | 'RUC';
  docNumber: string;
  email: string;
  phone?: string;
  address?: string;
  isMinor?: boolean;
  guardianName?: string;
  itemDescription?: string;
  claimedAmount?: number;
  detail: string;
  request: string;
  orderNumber?: string;
}

export interface ComplaintReceipt {
  code: string;
  status: string;
  dueAt: string;
  createdAt: string;
}

export interface ComplaintStatusResult {
  code: string;
  type: 'RECLAMO' | 'QUEJA';
  status: 'RECEIVED' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt: string;
  dueAt: string;
  response: string | null;
  respondedAt: string | null;
}

export const complaintsApi = {
  async submit(input: ComplaintInput): Promise<ComplaintReceipt> {
    const { data } = await api.post<ApiSuccess<ComplaintReceipt>>(ENDPOINTS.complaints.root, input);
    return data.data;
  },

  async track(code: string, docNumber: string): Promise<ComplaintStatusResult> {
    const { data } = await api.get<ApiSuccess<ComplaintStatusResult>>(ENDPOINTS.complaints.track, {
      params: { code, docNumber },
    });
    return data.data;
  },
};
