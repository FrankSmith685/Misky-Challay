import type { Category, Product, ProductDetail } from '../../types/domain';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

export interface ProductQuery {
  branchId?: number | null;
  categoryId?: number | null;
  search?: string;
  featured?: boolean;
}

export const catalogApi = {
  categories: () => apiRequest<Category[]>(ENDPOINTS.catalog.categories),
  products: (query: ProductQuery = {}) =>
    apiRequest<Product[]>(ENDPOINTS.catalog.products, {
      query: {
        branchId: query.branchId,
        categoryId: query.categoryId,
        search: query.search,
        featured: query.featured || undefined,
      },
    }),
  product: (slug: string, branchId?: number | null) =>
    apiRequest<ProductDetail>(ENDPOINTS.catalog.product(slug), { query: { branchId } }),
};
