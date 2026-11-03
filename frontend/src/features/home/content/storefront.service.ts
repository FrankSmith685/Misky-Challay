import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';
import { storefrontSchema, type StorefrontContent } from './storefront.schema';

export interface StorefrontState {
  content: StorefrontContent;
  version: number;
  updatedAt: string | null;
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
};
