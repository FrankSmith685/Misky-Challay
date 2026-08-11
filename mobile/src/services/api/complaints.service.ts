import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

export interface ComplaintInput {
  type: 'RECLAMO' | 'QUEJA';
  itemType: 'PRODUCTO' | 'SERVICIO';
  consumerName: string;
  docType: 'DNI' | 'CE' | 'PASAPORTE' | 'RUC';
  docNumber: string;
  email: string;
  phone?: string;
  itemDescription?: string;
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

export const complaintsApi = {
  submit: (input: ComplaintInput) => apiRequest<ComplaintReceipt>(ENDPOINTS.complaints.root, { method: 'POST', body: input, auth: true }),
  track: (code: string, docNumber: string) => apiRequest<{ code: string; status: string; response: string | null; dueAt: string }>(`${ENDPOINTS.complaints.track}?code=${encodeURIComponent(code)}&docNumber=${encodeURIComponent(docNumber)}`, { auth: true }),
};
