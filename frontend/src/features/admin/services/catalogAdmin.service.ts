import { api } from '@services/api/client';
import type { ApiSuccess } from '@/types/api';
import type { ProductFamily, PreparationMode } from '@features/catalog/pastry';

export interface AdminVariant {
  id: number;
  name: string;
  sku: string;
  basePrice: number;
  servingSize: number | null;
  servingUnit: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface AdminProduct {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  type: 'FIXED' | 'CUSTOMIZABLE';
  family: ProductFamily;
  preparationMode: PreparationMode;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  archivedAt: string | null;
  allergensReviewedAt: string | null;
  isFeatured: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  category?: { id: number; name: string };
  /** El menú público de tortas exige un perfil activo además del estado Publicado. */
  cakeProfile?: { isActive: boolean; saleMode: 'STANDARD' | 'SEMI_CUSTOM' | 'ADVANCED'; minLeadHours: number } | null;
  variants: AdminVariant[];
  dietaryTags: Array<{ id: number; code: string; name: string }>;
  allergens: Array<{ id: number; code: string; name: string }>;
}

export interface CatalogMeta {
  categories: Array<{
    id: number;
    name: string;
    slug: string;
    imageUrl: string | null;
    productCount: number;
    sortOrder: number;
    isActive: boolean;
  }>;
  allergens: Array<{ id: number; code: string; name: string }>;
  dietaryTags: Array<{ id: number; code: string; name: string }>;
}

export interface DemoProductPurgePlan {
  product: { id: number; name: string; slug: string; status: string; deleted_at: string };
  variants: Array<{ id: number; sku: string }>;
  orderItems: number;
  variantOrderItems: number;
  productAuditLogs: number;
  variantAuditLogs: number;
}

const BASE = '/admin/catalog';

export const catalogAdminApi = {
  async products(filters: { search?: string; status?: string; archived?: boolean } = {}): Promise<AdminProduct[]> {
    const { data } = await api.get<ApiSuccess<AdminProduct[]>>(`${BASE}/products`, {
      params: filters,
    });
    return data.data;
  },

  async meta(): Promise<CatalogMeta> {
    const { data } = await api.get<ApiSuccess<CatalogMeta>>(`${BASE}/meta`);
    return data.data;
  },

  async categories(): Promise<CatalogMeta['categories']> {
    const { data } = await api.get<ApiSuccess<CatalogMeta['categories']>>(`${BASE}/categories`);
    return data.data;
  },

  async createProduct(input: {
    name: string;
    categoryId: number;
    type: 'FIXED' | 'CUSTOMIZABLE';
    family?: ProductFamily;
    preparationMode?: PreparationMode;
    minLeadHours?: number;
    servingSize?: number | null;
    servingUnit?: string;
    description?: string;
    imageUrl?: string | null;
    variantName: string;
    basePrice: number;
  }): Promise<{ id: number; slug: string }> {
    const { data } = await api.post<ApiSuccess<{ id: number; slug: string }>>(`${BASE}/products`, input);
    return data.data;
  },

  async updateProduct(
    productId: number,
    input: {
      name?: string;
      description?: string | null;
      categoryId?: number;
      family?: ProductFamily;
      preparationMode?: PreparationMode;
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

  async deleteDraftProduct(productId: number): Promise<void> {
    await api.delete(`${BASE}/products/${productId}`);
  },

  async archiveProduct(productId: number): Promise<void> {
    await api.post(`${BASE}/products/${productId}/archive`);
  },

  async restoreProduct(productId: number): Promise<void> {
    await api.post(`${BASE}/products/${productId}/restore`);
  },

  async previewDemoProductPurge(productId: number): Promise<DemoProductPurgePlan> {
    const { data } = await api.get<ApiSuccess<DemoProductPurgePlan>>(`${BASE}/products/${productId}/purge-preview`);
    return data.data;
  },

  async purgeDemoProduct(productId: number, slug: string): Promise<{ id: number; backup: string }> {
    const { data } = await api.post<ApiSuccess<{ id: number; backup: string }>>(
      `${BASE}/products/${productId}/purge`, { slug }, { timeout: 190_000 },
    );
    return data.data;
  },

  /** Cambiar el PRECIO queda auditado en el backend. */
  async updateVariant(
    variantId: number,
    input: { name?: string; basePrice?: number; servingSize?: number | null; servingUnit?: string; isActive?: boolean },
  ): Promise<void> {
    await api.patch(`${BASE}/variants/${variantId}`, input);
  },

  async addVariant(productId: number, input: { name: string; basePrice: number; servingSize?: number | null; servingUnit?: string }): Promise<void> {
    await api.post(`${BASE}/products/${productId}/variants`, input);
  },

  async setAllergens(productId: number, allergenIds: number[]): Promise<void> {
    await api.patch(`${BASE}/products/${productId}/allergens`, { allergenIds, reviewed: true });
  },

  async initializeAllergens(): Promise<number> {
    const { data } = await api.post<ApiSuccess<Array<{ id: number }>>>(`${BASE}/allergens/initialize`);
    return data.data.length;
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

  async createCategory(input: { name: string; imageUrl?: string | null; sortOrder?: number; isActive?: boolean }): Promise<{ id: number }> {
    const { data } = await api.post<ApiSuccess<{ id: number }>>(`${BASE}/categories`, input);
    return data.data;
  },
  async updateCategory(id: number, input: { name?: string; imageUrl?: string | null; sortOrder?: number; isActive?: boolean }): Promise<void> {
    await api.patch(`${BASE}/categories/${id}`, input);
  },
  async deleteCategory(id: number): Promise<void> {
    await api.delete(`${BASE}/categories/${id}`);
  },
};
