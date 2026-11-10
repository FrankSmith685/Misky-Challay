import { z } from 'zod';

/** Acepta etiquetas dietarias separadas por comas o repetidas */
const csvList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    const list = Array.isArray(value) ? value : value.split(',');
    return list.map((item) => item.trim()).filter(Boolean);
  });

export const listProductsSchema = z.object({
  query: z.object({
    branchId: z.coerce.number().int().positive().optional(),
    productIds: csvList.transform((value) => value?.map(Number).filter((id) => Number.isInteger(id) && id > 0)),
    audience: z.enum(['RETAIL', 'BUSINESS']).default('RETAIL'),
    categoryId: z.coerce.number().int().positive().optional(),
    search: z.string().max(80).optional(),
    dietaryTags: csvList,
    excludeAllergens: csvList,
    sort: z.enum(['BEST_SELLERS', 'RECOMMENDED']).default('RECOMMENDED'),
    featured: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
  }),
});

export const productSlugSchema = z.object({
  params: z.object({ slug: z.string().min(1) }),
  query: z.object({ branchId: z.coerce.number().int().positive().optional() }),
});
