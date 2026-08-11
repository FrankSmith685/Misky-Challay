import type { BuilderConfig, CustomizationQuote } from '../../types/domain';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

export interface CustomizationInput {
  productId: number; variantId: number; quantity: number; branchId?: number | null;
  selections: Array<{ optionId: number; quantity: number }>;
}

export const customizationApi = {
  config: (productId: number, branchId?: number | null) => apiRequest<BuilderConfig>(ENDPOINTS.customizations.config(productId), { query: { branchId } }),
  quote: (input: CustomizationInput) => apiRequest<CustomizationQuote>(ENDPOINTS.customizations.quote, { method: 'POST', body: input }),
};
