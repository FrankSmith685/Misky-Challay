import { z } from 'zod';

/** Acepta ?dietaryTags=vegano,alto-en-proteina o repetido: ?dietaryTags=a&dietaryTags=b */
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
    categoryId: z.coerce.number().int().positive().optional(),
    search: z.string().max(80).optional(),
    dietaryTags: csvList,
    excludeAllergens: csvList,
    maxCalories: z.coerce.number().positive().optional(),
    minProtein: z.coerce.number().positive().optional(),
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
