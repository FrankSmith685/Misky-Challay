import { api } from '@services/api/client';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess } from '@/types/api';
import type { Category, Product, ProductDetail, Allergen, DietaryTag } from '../types';

export interface ProductQuery {
  branchId?: number | null;
  categoryId?: number | null;
  search?: string;
  dietaryTags?: string[];
  excludeAllergens?: string[];
  maxCalories?: number | null;
  minProtein?: number | null;
  featured?: boolean;
}

/** Convierte los filtros del estado de Redux en query params del API. */
const toParams = (query: ProductQuery): Record<string, string | number> => {
  const params: Record<string, string | number> = {};

  if (query.branchId) params.branchId = query.branchId;
  if (query.categoryId) params.categoryId = query.categoryId;
  if (query.search) params.search = query.search;
  if (query.dietaryTags?.length) params.dietaryTags = query.dietaryTags.join(',');
  if (query.excludeAllergens?.length) params.excludeAllergens = query.excludeAllergens.join(',');
  if (query.maxCalories) params.maxCalories = query.maxCalories;
  if (query.minProtein) params.minProtein = query.minProtein;
  if (query.featured) params.featured = 'true';

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
};
