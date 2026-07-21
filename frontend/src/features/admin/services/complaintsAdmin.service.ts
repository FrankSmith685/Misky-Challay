import { api } from '@services/api/client';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess, PaginationMeta } from '@/types/api';

export type ComplaintStatus = 'RECEIVED' | 'IN_PROGRESS' | 'RESOLVED';
export type ComplaintType = 'RECLAMO' | 'QUEJA';

/** Fila de la lista: lo justo para la tabla. */
export interface ComplaintRow {
  id: number;
  code: string | null;
  type: ComplaintType;
  itemType: 'PRODUCTO' | 'SERVICIO';
  consumerName: string;
  email: string;
  status: ComplaintStatus;
  createdAt: string;
  dueAt: string;
  respondedAt: string | null;
}

/** Detalle completo, para el panel de respuesta. */
export interface ComplaintDetail extends ComplaintRow {
  docType: string;
  docNumber: string;
  phone: string | null;
  address: string | null;
  isMinor: boolean;
  guardianName: string | null;
  itemDescription: string | null;
  claimedAmount: number | null;
  detail: string;
  request: string;
  orderId: number | null;
  userId: number | null;
  response: string | null;
}

export const complaintsAdminApi = {
  async list(params: {
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ rows: ComplaintRow[]; meta: PaginationMeta }> {
    const { data } = await api.get<ApiSuccess<ComplaintRow[]>>(ENDPOINTS.complaints.root, {
      params,
    });
    // El backend siempre envia meta en las listas paginadas; si faltara, se asume
    // una sola pagina para no romper la UI.
    const meta = data.meta ?? {
      page: 1,
      pageSize: data.data.length,
      total: data.data.length,
      totalPages: 1,
    };
    return { rows: data.data, meta };
  },

  async detail(id: number): Promise<ComplaintDetail> {
    const { data } = await api.get<ApiSuccess<ComplaintDetail>>(ENDPOINTS.complaints.detail(id));
    return data.data;
  },

  async respond(
    id: number,
    input: { response: string; status: 'IN_PROGRESS' | 'RESOLVED' },
  ): Promise<void> {
    await api.post(ENDPOINTS.complaints.respond(id), input);
  },

  /** Contadores globales (no de la pagina visible). */
  async summary(): Promise<ComplaintSummary> {
    const { data } = await api.get<ApiSuccess<ComplaintSummary>>(ENDPOINTS.complaints.summary);
    return data.data;
  },
};

export interface ComplaintSummary {
  received: number;
  inProgress: number;
  resolved: number;
  overdue: number;
}
