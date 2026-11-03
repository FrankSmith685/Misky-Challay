import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';
import type { CakeVisualDesign } from './utils/cakeVisualDesign';

export interface CakePreviewSnapshot {
  productId: number;
  productSlug: string;
  productName: string;
  variantId: number;
  variantName: string;
  servings: number | null;
  diameterCm?: number | null;
  themeName: string | null;
  themeSlug: string | null;
  options: Array<{ groupName: string; optionName: string; quantity: number }>;
  visualDesign?: CakeVisualDesign;
  referenceImageDataUrl?: string;
  configuration?: {
    selections: Array<{ optionId: number; quantity: number }>;
    requestedServings?: number;
    themeId?: number;
    themeVersion?: number;
  };
}

export interface CakePreviewShareInput {
  source?: 'CONFIGURATOR' | 'DESIGN' | 'FREEFORM';
  productId: number;
  variantId: number;
  requestedServings?: number;
  themeId?: number;
  themeVersion?: number;
  selections: Array<{ optionId: number; quantity: number }>;
  visualColors?: Array<'Rosa' | 'Celeste' | 'Lila' | 'Dorado' | 'Plateado' | 'Rojo' | 'Azul' | 'Verde' | 'Blanco' | 'Multicolor'>;
  visualStyle?: 'Elegante' | 'Minimalista' | 'Infantil' | 'Divertido' | 'Floral' | 'Temático' | 'Moderno';
  visualFlavor?: string;
  visualFilling?: string;
  visualDesign?: CakeVisualDesign;
  includeReferenceImage?: boolean;
  referenceImageDataUrl?: string;
}

export const cakePreviewApi = {
  create: async (input: CakePreviewShareInput) => (await api.post<ApiSuccess<{ token: string; expiresAt: string }>>('/cake-previews', input)).data.data,
  get: async (token: string) => (await api.get<ApiSuccess<{ snapshot: CakePreviewSnapshot; expiresAt: string }>>(`/cake-previews/${encodeURIComponent(token)}`)).data.data,
  copy: async (token: string, input: Pick<CakePreviewShareInput, 'visualDesign' | 'includeReferenceImage' | 'referenceImageDataUrl'>) => (await api.post<ApiSuccess<{ token: string; expiresAt: string }>>(`/cake-previews/${encodeURIComponent(token)}/copy`, input)).data.data,
};
