/** Contrato de respuesta del backend (shared/http/ApiResponse.ts). */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorBody {
  success: false;
  message: string;
  code: string;
  details?: Array<{ field: string; message: string }>;
}

export type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';
