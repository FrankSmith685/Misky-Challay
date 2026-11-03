import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';
import type { Effort } from './cakes.service';

export interface CakeThemeRule {
  variantId: number; priceDelta: number; materials: Array<{ inventoryItemId: number; quantity: number }>;
  effort: Effort; excludedOptionIds: number[]; hiddenGroupIds?: number[];
}
export interface CakeTheme {
  id: number; version: number; slug: string; name: string; theme: string; description: string;
  productId: number; productSlug: string; imageUrls: string[]; saleMode: 'CONFIGURED' | 'QUOTE';
  minLeadHours: number; minServings: number; maxServings: number; priceFrom: number | null;
  variantRules: Array<Pick<CakeThemeRule, 'variantId' | 'priceDelta' | 'excludedOptionIds' | 'hiddenGroupIds'>>;
  variants: Array<{ id: number; name: string; servingSize: number | null; basePrice: number }>;
  allergens: string[]; allergenNames: string[]; isAvailable: boolean;
}
export interface ThemeSnapshot { id: number; version: number; slug: string; name: string; imageUrl: string | null; priceDelta: number; allergens?: string[] }
export interface CakeThemeDraft {
  productId: number; name: string; theme: string; description: string; imageUrlsJson: string[];
  saleMode: 'CONFIGURED' | 'QUOTE'; minLeadHours: number; minServings: number; maxServings: number;
  variantRulesJson: CakeThemeRule[]; isActive: boolean; sortOrder: number;
}
export interface AdminCakeTheme extends CakeThemeDraft { id: number; slug: string; version: number }
const unwrap = <T>(result: { data: ApiSuccess<T> }) => result.data.data;
export const cakeThemesApi = {
  list: async (branchId?: number | null) => unwrap(await api.get<ApiSuccess<CakeTheme[]>>('/cake-themes', { params: branchId ? { branchId } : {} })),
  get: async (slug: string, branchId?: number | null) => unwrap(await api.get<ApiSuccess<CakeTheme>>(`/cake-themes/${encodeURIComponent(slug)}`, { params: branchId ? { branchId } : {} })),
  admin: async () => unwrap(await api.get<ApiSuccess<AdminCakeTheme[]>>('/cake-themes/admin')),
  save: async (draft: CakeThemeDraft, current?: AdminCakeTheme) => current
    ? unwrap(await api.put<ApiSuccess<AdminCakeTheme>>(`/cake-themes/${current.id}`, { ...draft, expectedVersion: current.version }))
    : unwrap(await api.post<ApiSuccess<AdminCakeTheme>>('/cake-themes', draft)),
  archive: async (theme: AdminCakeTheme) => unwrap(await api.post<ApiSuccess<AdminCakeTheme>>(`/cake-themes/${theme.id}/archive`, { expectedVersion: theme.version })),
};
