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
  address?: string;
  /** Menor de edad: INDECOPI exige entonces el nombre del padre o apoderado. */
  isMinor?: boolean;
  guardianName?: string;
  itemDescription?: string;
  /** Monto reclamado en soles, si el reclamo tiene uno. */
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

/** Lo que devuelve GET /complaints/track: la linea de tiempo del reclamo. */
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
  /**
   * Presentar un reclamo es publico por obligacion legal, pero si hay sesion se
   * vincula al cliente: por eso va con `auth`, que aqui adjunta el token cuando
   * existe sin exigirlo.
   */
  submit: (input: ComplaintInput) =>
    apiRequest<ComplaintReceipt>(ENDPOINTS.complaints.root, {
      method: 'POST',
      body: input,
      auth: true,
    }),

  /** Consulta publica: basta el codigo y el documento con el que se presento. */
  track: (code: string, docNumber: string) =>
    apiRequest<ComplaintStatusResult>(ENDPOINTS.complaints.track, {
      query: { code, docNumber },
    }),
};
