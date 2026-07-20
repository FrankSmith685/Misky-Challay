import type { Response } from 'express';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccessBody<T> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorBody {
  success: false;
  message: string;
  code: string;
  details?: unknown;
}

/** Contrato unico de respuesta para todo el API (el frontend depende de esta forma). */
export const ok = <T>(res: Response, data: T, message = 'OK', meta?: PaginationMeta): Response =>
  res.status(200).json({ success: true, message, data, ...(meta ? { meta } : {}) });

export const created = <T>(res: Response, data: T, message = 'Creado'): Response =>
  res.status(201).json({ success: true, message, data });

export const noContent = (res: Response): Response => res.status(204).send();
