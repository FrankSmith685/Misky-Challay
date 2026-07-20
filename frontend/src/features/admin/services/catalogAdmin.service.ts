import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';

export interface AdminNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sodium: number;
}

export interface AdminVariant {
  id: number;
  name: string;
  sku: string;
  basePrice: number;
  isDefault: boolean;
  isActive: boolean;
  nutrition: AdminNutrition | null;
}

export interface AdminProduct {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  type: 'FIXED' | 'CUSTOMIZABLE';
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  isFeatured: boolean;
  imageUrl: string | null;
  category?: { id: number; name: string };
  variants: AdminVariant[];
  dietaryTags: Array<{ id: number; code: string; name: string }>;
  allergens: Array<{ id: number; code: string; name: string }>;
}

export interface CatalogMeta {
  categories: Array<{ id: number; name: string; slug: string }>;
  allergens: Array<{ id: number; code: string; name: string }>;
  dietaryTags: Array<{ id: number; code: string; name: string }>;
}

const BASE = '/admin/catalog';

export const catalogAdminApi = {
  async products(filters: { search?: string; status?: string } = {}): Promise<AdminProduct[]> {
    const { data } = await api.get<ApiSuccess<AdminProduct[]>>(`${BASE}/products`, {
      params: filters,
    });
    return data.data;
  },

  async meta(): Promise<CatalogMeta> {
    const { data } = await api.get<ApiSuccess<CatalogMeta>>(`${BASE}/meta`);
    return data.data;
  },

  async createProduct(input: {
    name: string;
    categoryId: number;
    type: 'FIXED' | 'CUSTOMIZABLE';
    description?: string;
    imageUrl?: string | null;
    variantName: string;
    basePrice: number;
  }): Promise<void> {
    await api.post(`${BASE}/products`, input);
  },

  async updateProduct(
    productId: number,
    input: {
      name?: string;
      description?: string | null;
      categoryId?: number;
      isFeatured?: boolean;
      imageUrl?: string | null;
    },
  ): Promise<void> {
    await api.patch(`${BASE}/products/${productId}`, input);
  },

  /** Publicar o retirar del menu (permiso propio). */
  async changeStatus(productId: number, status: 'DRAFT' | 'ACTIVE' | 'INACTIVE'): Promise<void> {
    await api.patch(`${BASE}/products/${productId}/status`, { status });
  },

  /** Cambiar el PRECIO queda auditado en el backend. */
  async updateVariant(
    variantId: number,
    input: { name?: string; basePrice?: number; isActive?: boolean },
  ): Promise<void> {
    await api.patch(`${BASE}/variants/${variantId}`, input);
  },

  async addVariant(productId: number, input: { name: string; basePrice: number }): Promise<void> {
    await api.post(`${BASE}/products/${productId}/variants`, input);
  },

  /** Lo unico que puede tocar el nutricionista. */
  async updateNutrition(
    variantId: number,
    input: { calories: number; protein: number; carbs: number; fat: number },
  ): Promise<void> {
    await api.patch(`${BASE}/variants/${variantId}/nutrition`, input);
  },

  async setAllergens(productId: number, allergenIds: number[]): Promise<void> {
    await api.patch(`${BASE}/products/${productId}/allergens`, { allergenIds });
  },

  async setDietaryTags(productId: number, tagIds: number[]): Promise<void> {
    await api.patch(`${BASE}/products/${productId}/dietary-tags`, { tagIds });
  },

  async setAvailability(
    productId: number,
    branchId: number,
    isAvailable: boolean,
    reason?: string,
  ): Promise<void> {
    await api.patch(`${BASE}/products/${productId}/availability`, {
      branchId,
      isAvailable,
      reason,
    });
  },

  async createCategory(name: string): Promise<void> {
    await api.post(`${BASE}/categories`, { name });
  },
};
