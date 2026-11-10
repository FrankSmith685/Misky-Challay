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
  assignedTo: number | null;
  assignedUser?: { id: number; firstName: string | null; lastName: string | null } | null;
  escalatedAt: string | null;
  reopenedAt: string | null;
  updatedAt: string;
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
  draftResponse: string | null;
  assignedAt: string | null;
  reopenReason: string | null;
  order?: { id: number; orderNumber: string; status: string } | null;
  responses: Array<{ id: number; version: number; response: string; status: 'IN_PROGRESS' | 'RESOLVED'; reason: string | null; notificationStatus: 'PENDING' | 'SENT' | 'FAILED' | 'SIMULATED'; notificationError: string | null; sentAt: string | null; createdAt: string; actor?: { id: number; firstName: string | null; lastName: string | null } | null }>;
  notes: Array<{ id: number; note: string; createdAt: string; author?: { id: number; firstName: string | null; lastName: string | null } | null }>;
  evidences: Array<{ id: number; fileName: string; mimeType: string | null; createdAt: string }>;
}

export interface ComplaintFilters {
  status?: string;
  search?: string;
  /**
   * Solo los que pasaron su plazo legal sin respuesta. El servidor ya calcula esa
   * misma condicion para el contador de `summary`; sin el filtro hay que recorrer
   * pagina por pagina mirando las fechas en rojo.
   */
  overdue?: boolean;
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  reason?: string;
  masked?: boolean;
}

export const complaintsAdminApi = {
  async list(
    params: ComplaintFilters = {},
  ): Promise<{ rows: ComplaintRow[]; meta: PaginationMeta }> {
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
    input: { response: string; status: 'IN_PROGRESS' | 'RESOLVED'; reason?: string; expectedUpdatedAt: string },
  ): Promise<void> {
    await api.post(ENDPOINTS.complaints.respond(id), input);
  },

  async reopen(id: number, input: { reason: string; expectedUpdatedAt: string }): Promise<void> {
    await api.post(`${ENDPOINTS.complaints.detail(id)}/reopen`, input);
  },

  async assign(id: number, input: { userId: number | null; reason: string; expectedUpdatedAt: string }): Promise<void> {
    await api.post(`${ENDPOINTS.complaints.detail(id)}/assign`, input);
  },

  async escalate(id: number, input: { reason: string; expectedUpdatedAt: string }): Promise<void> {
    await api.post(`${ENDPOINTS.complaints.detail(id)}/escalate`, input);
  },

  async note(id: number, note: string): Promise<void> {
    await api.post(`${ENDPOINTS.complaints.detail(id)}/notes`, { note });
  },

  async assignees(): Promise<Array<{ id: number; firstName: string | null; lastName: string | null }>> {
    const { data } = await api.get<ApiSuccess<Array<{ id: number; firstName: string | null; lastName: string | null }>>>(`${ENDPOINTS.complaints.root}/assignees`);
    return data.data;
  },

  async retryNotification(id: number, responseId: number): Promise<void> {
    await api.post(`${ENDPOINTS.complaints.detail(id)}/responses/${responseId}/retry`);
  },

  async evidenceFile(id: number, evidenceId: number): Promise<Blob> {
    const { data } = await api.get<Blob>(`${ENDPOINTS.complaints.detail(id)}/evidence/${evidenceId}/file`, { responseType: 'blob' });
    return data;
  },

  async addEvidence(id: number, input: { fileName: string; dataUrl: string }): Promise<void> {
    await api.post(`${ENDPOINTS.complaints.detail(id)}/evidence`, input);
  },

  async holidays(year = new Date().getFullYear()): Promise<Array<{ holidayDate: string; label: string; isActive: boolean; source: 'NATIONAL' | 'CUSTOM' }>> {
    const { data } = await api.get<ApiSuccess<Array<{ holidayDate: string; label: string; isActive: boolean; source: 'NATIONAL' | 'CUSTOM' }>>>(`${ENDPOINTS.complaints.root}/holidays`, { params: { year } });
    return data.data;
  },

  async saveHoliday(input: { holidayDate: string; label: string; isActive: boolean; reason: string }): Promise<void> {
    await api.post(`${ENDPOINTS.complaints.root}/holidays`, input);
  },

  /**
   * Descarga en CSV lo que haya en pantalla segun los filtros.
   *
   * La ruta la anade el paquete J y tiene que declararse ANTES de `GET /:id`, o
   * Express interpretara "export" como un identificador de reclamo.
   */
  async exportCsv(params: ComplaintFilters = {}): Promise<Blob> {
    const { data } = await api.get<Blob>(`${ENDPOINTS.complaints.root}/export`, {
      params,
      responseType: 'blob',
    });
    return data;
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
  dueSoon: number;
  unassigned: number;
  escalated: number;
  reopened: number;
  notificationFailures: number;
}
