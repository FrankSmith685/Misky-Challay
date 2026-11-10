import { api } from '@services/api/client';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess } from '@/types/api';
import type { Category, Product, ProductDetail, Allergen, DietaryTag } from '../types';

export interface ProductQuery {
  branchId?: number | null;
  productIds?: number[];
  categoryId?: number | null;
  search?: string;
  dietaryTags?: string[];
  excludeAllergens?: string[];
  featured?: boolean;
  sort?: 'BEST_SELLERS' | 'RECOMMENDED';
  audience?: 'RETAIL' | 'BUSINESS';
}

export interface AvailabilityAlert {
  id: number;
  productId: number;
  branchId: number;
  notifyEmail: boolean;
  notifyInApp: boolean;
  status: 'WAITING' | 'NOTIFIED' | 'CANCELLED';
  notifiedAt: string | null;
  createdAt: string;
}

/** Convierte los filtros del estado de Redux en query params del API. */
const toParams = (query: ProductQuery): Record<string, string | number> => {
  const params: Record<string, string | number> = {};

  if (query.branchId) params.branchId = query.branchId;
  if (query.productIds?.length) params.productIds = query.productIds.join(',');
  if (query.categoryId) params.categoryId = query.categoryId;
  if (query.search) params.search = query.search;
  if (query.dietaryTags?.length) params.dietaryTags = query.dietaryTags.join(',');
  if (query.excludeAllergens?.length) params.excludeAllergens = query.excludeAllergens.join(',');
  if (query.featured) params.featured = 'true';
  if (query.sort) params.sort = query.sort;
  if (query.audience) params.audience = query.audience;

  return params;
};

export const catalogApi = {
  async getCategories(): Promise<Category[]> {
    const { data } = await api.get<ApiSuccess<Category[]>>(ENDPOINTS.catalog.categories);
    return data.data;
  },

  async getDietaryTags(): Promise<DietaryTag[]> {
    const { data } = await api.get<ApiSuccess<DietaryTag[]>>(ENDPOINTS.catalog.dietaryTags);
    return data.data;
  },

  async getAllergens(): Promise<Allergen[]> {
    const { data } = await api.get<ApiSuccess<Allergen[]>>(ENDPOINTS.catalog.allergens);
    return data.data;
  },

  async getProducts(query: ProductQuery = {}): Promise<Product[]> {
    const { data } = await api.get<ApiSuccess<Product[]>>(ENDPOINTS.catalog.products, {
      params: toParams(query),
    });
    return data.data;
  },

  async getProduct(slug: string, branchId?: number | null): Promise<ProductDetail> {
    const { data } = await api.get<ApiSuccess<ProductDetail>>(ENDPOINTS.catalog.product(slug), {
      params: branchId ? { branchId } : {},
    });
    return data.data;
  },

  async getAvailabilityAlert(productId: number, branchId: number): Promise<AvailabilityAlert | null> {
    const { data } = await api.get<ApiSuccess<AvailabilityAlert | null>>(
      ENDPOINTS.account.availabilityAlerts,
      { params: { productId, branchId } },
    );
    return data.data;
  },

  async subscribeAvailabilityAlert(input: {
    productId: number;
    branchId: number;
    notifyEmail: boolean;
    notifyInApp: boolean;
  }): Promise<AvailabilityAlert> {
    const { data } = await api.post<ApiSuccess<AvailabilityAlert>>(
      ENDPOINTS.account.availabilityAlerts,
      input,
    );
    return data.data;
  },

  async cancelAvailabilityAlert(productId: number, branchId: number): Promise<void> {
    await api.delete(ENDPOINTS.account.availabilityAlerts, { params: { productId, branchId } });
  },
};
