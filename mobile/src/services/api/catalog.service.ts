import type {
  Allergen,
  Category,
  DietaryTag,
  Product,
  ProductDetail,
  ProductFilters,
} from '../../types/domain';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

/** Nombre histórico de los filtros del menú; se mantiene para no romper llamadas. */
export type ProductQuery = ProductFilters;

/** El backend acepta lista repetida o separada por comas: mandamos comas, es más corta. */
const csv = (values?: string[]): string | undefined =>
  values && values.length > 0 ? values.join(',') : undefined;

export const catalogApi = {
  categories: () => apiRequest<Category[]>(ENDPOINTS.catalog.categories),

  allergens: () => apiRequest<Allergen[]>(ENDPOINTS.catalog.allergens),

  dietaryTags: () => apiRequest<DietaryTag[]>(ENDPOINTS.catalog.dietaryTags),

  products: (query: ProductFilters = {}) =>
    apiRequest<Product[]>(ENDPOINTS.catalog.products, {
      query: {
        branchId: query.branchId,
        categoryId: query.categoryId,
        search: query.search,
        dietaryTags: csv(query.dietaryTags),
        excludeAllergens: csv(query.excludeAllergens),
        // El backend espera 'true' literal; `false` no filtra nada, así que se omite.
        featured: query.featured || undefined,
      },
    }),

  product: (slug: string, branchId?: number | null) =>
    apiRequest<ProductDetail>(ENDPOINTS.catalog.product(slug), { query: { branchId } }),
};
