import type { BuilderConfig, CustomizationQuote } from '../../types/domain';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

export interface CustomizationInput {
  productId: number; variantId: number; quantity: number; branchId?: number | null;
  selections: Array<{ optionId: number; quantity: number }>;
}

/** Embudo del constructor, tal cual lo declara el backend (builderEvent.model.ts). */
export type BuilderEventType =
  | 'VIEW'
  | 'START'
  | 'OPTION_SELECT'
  | 'CONFLICT_RESOLVE'
  | 'PRESET_APPLY'
  | 'QUOTE_ERROR'
  | 'COMPLETE'
  | 'ADD_TO_CART'
  | 'SAVE_BOWL'
  | 'ABANDON';

export interface BuilderEventInput {
  /** El backend lo valida como UUID: manda el mismo durante toda la sesión de armado. */
  sessionId: string;
  productId: number;
  eventType: BuilderEventType;
  groupId?: number | null;
  optionId?: number | null;
  presetId?: number | null;
  metadata?: Record<string, string | number | boolean | null> | null;
}

export const customizationApi = {
  config: (productId: number, branchId?: number | null) => apiRequest<BuilderConfig>(ENDPOINTS.customizations.config(productId), { query: { branchId } }),
  quote: (input: CustomizationInput) => apiRequest<CustomizationQuote>(ENDPOINTS.customizations.quote, { method: 'POST', body: input }),

  /**
   * Medición del constructor. Es a fondo perdido: si falla, el cliente sigue
   * armando su bowl, así que nunca debe interrumpir la pantalla.
   */
  event: (input: BuilderEventInput) =>
    apiRequest<null>(ENDPOINTS.customizations.events, { method: 'POST', body: input, auth: true }),
};
