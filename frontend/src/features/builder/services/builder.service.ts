import { api } from '@services/api/client';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess } from '@/types/api';
import type { BuilderConfig, QuoteInput, QuoteResult, SavedBowl } from '../types';

export const builderApi = {
  async getConfig(productId: number, branchId?: number | null): Promise<BuilderConfig> {
    const { data } = await api.get<ApiSuccess<BuilderConfig>>(
      ENDPOINTS.customizations.config(productId),
      { params: branchId ? { branchId } : {} },
    );
    return data.data;
  },

  /** RN-007: el precio y la nutricion validos son los que devuelve el backend. */
  async quote(input: QuoteInput, signal?: AbortSignal): Promise<QuoteResult> {
    // `null` no representa una sucursal: si no hay dirección, se omite el campo.
    const { branchId, ...baseInput } = input;
    const payload = branchId ? { ...baseInput, branchId } : baseInput;
    const { data } = await api.post<ApiSuccess<QuoteResult>>(
      ENDPOINTS.customizations.quote,
      payload,
      { signal },
    );
    return data.data;
  },
  async savedBowls(): Promise<SavedBowl[]> {
    const { data } = await api.get<ApiSuccess<SavedBowl[]>>('/account/saved-bowls');
    return data.data;
  },
  async saveBowl(input: {
    name: string;
    productId: number;
    variantId: number;
    selections: Array<{ optionId: number; quantity: number }>;
  }): Promise<void> {
    await api.post('/account/saved-bowls', input);
  },
  async deleteSavedBowl(id: number): Promise<void> {
    await api.delete(`/account/saved-bowls/${id}`);
  },
  async updateSavedBowl(id: number, input: { name?: string; variantId?: number; selections?: Array<{ optionId: number; quantity: number }> }): Promise<void> {
    await api.patch(`/account/saved-bowls/${id}`, input);
  },
  async trackEvent(input: {
    sessionId: string;
    productId: number;
    eventType: 'VIEW' | 'START' | 'OPTION_SELECT' | 'CONFLICT_RESOLVE' | 'PRESET_APPLY' | 'QUOTE_ERROR' | 'COMPLETE' | 'ADD_TO_CART' | 'SAVE_BOWL' | 'ABANDON';
    groupId?: number | null;
    optionId?: number | null;
    presetId?: number | null;
    metadata?: Record<string, string | number | boolean | null>;
  }): Promise<void> {
    await api.post('/customizations/events', input);
  },
};
