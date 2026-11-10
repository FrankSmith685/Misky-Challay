import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';
import { storefrontSchema, type StorefrontContent } from './storefront.schema';

export interface StorefrontState {
  content: StorefrontContent;
  version: number;
  updatedAt: string | null;
}
export interface StorefrontDraftState {
  content: StorefrontContent;
  baseVersion: number;
  status: 'DRAFT' | 'SCHEDULED';
  publishAt: string | null;
  updatedAt: string | null;
  ownerUserId: number;
}
export interface StorefrontAdminState {
  published: StorefrontState;
  draft: StorefrontDraftState | null;
}
export interface StorefrontHistoryEntry {
  id: number;
  action: string;
  actorId: number | null;
  createdAt: string;
  before: StorefrontState | null;
  after: StorefrontState | null;
}
export const storefrontApi = {
  async get(): Promise<StorefrontState> {
    const { data } = await api.get<ApiSuccess<StorefrontState>>('/settings/storefront');
    const result = data.data;
    if (!result || !Number.isInteger(result.version) || result.version < 0)
      throw new Error('No se pudo leer el contenido de la portada.');
    return { ...result, content: storefrontSchema.parse(result.content) };
  },
  async save(state: Pick<StorefrontState, 'content' | 'version'>): Promise<StorefrontState> {
    const { data } = await api.put<ApiSuccess<StorefrontState>>('/settings/storefront', state);
    return { ...data.data, content: storefrontSchema.parse(data.data.content) };
  },
  async getAdmin(): Promise<StorefrontAdminState> {
    const { data } = await api.get<ApiSuccess<StorefrontAdminState>>('/settings/storefront/admin');
    const result = data.data;
    return {
      published: { ...result.published, content: storefrontSchema.parse(result.published.content) },
      draft: result.draft ? { ...result.draft, content: storefrontSchema.parse(result.draft.content) } : null,
    };
  },
  async saveDraft(input: { content: StorefrontContent; version: number; publishAt?: string | null }): Promise<StorefrontAdminState> {
    const { data } = await api.put<ApiSuccess<StorefrontAdminState>>('/settings/storefront/draft', input);
    const result = data.data;
    return {
      published: { ...result.published, content: storefrontSchema.parse(result.published.content) },
      draft: result.draft ? { ...result.draft, content: storefrontSchema.parse(result.draft.content) } : null,
    };
  },
  async publishDraft(idempotencyKey: string): Promise<StorefrontState> {
    const { data } = await api.post<ApiSuccess<StorefrontState>>('/settings/storefront/publish', { idempotencyKey });
    return { ...data.data, content: storefrontSchema.parse(data.data.content) };
  },
  async discardDraft(): Promise<StorefrontAdminState> {
    const { data } = await api.delete<ApiSuccess<StorefrontAdminState>>('/settings/storefront/draft');
    const result = data.data;
    return { published: { ...result.published, content: storefrontSchema.parse(result.published.content) }, draft: null };
  },
  async history(limit = 20): Promise<StorefrontHistoryEntry[]> {
    const { data } = await api.get<ApiSuccess<StorefrontHistoryEntry[]>>('/settings/storefront/history', { params: { limit } });
    return data.data;
  },
  async rollback(auditId: number, idempotencyKey: string): Promise<StorefrontState> {
    const { data } = await api.post<ApiSuccess<StorefrontState>>(`/settings/storefront/rollback/${auditId}`, { idempotencyKey });
    return { ...data.data, content: storefrontSchema.parse(data.data.content) };
  },
};
