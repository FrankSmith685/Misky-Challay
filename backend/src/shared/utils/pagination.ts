import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@config/constants';
import type { PaginationMeta } from '@shared/http/ApiResponse';

export interface PaginationQuery {
  page?: number | string;
  pageSize?: number | string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
}

export const getPagination = (query: PaginationQuery): PaginationParams => {
  const page = Math.max(1, Number(query.page) || 1);
  const requested = Number(query.pageSize) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, requested), MAX_PAGE_SIZE);

  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
};

export const buildMeta = (params: PaginationParams, total: number): PaginationMeta => ({
  page: params.page,
  pageSize: params.pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
});
