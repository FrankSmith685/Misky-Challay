import type { Request, Response } from 'express';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { catalogService, type CatalogFilters } from './catalog.service';

/** Modulo CATALOG (M04): categorias, productos, alergenos y filtros. */
export const catalogController = {
  categories: asyncHandler(async (_req: Request, res: Response) => {
    const categories = await catalogService.listCategories();
    return ok(res, categories);
  }),

  allergens: asyncHandler(async (_req: Request, res: Response) => {
    const allergens = await catalogService.listAllergens();
    return ok(res, allergens);
  }),

  dietaryTags: asyncHandler(async (_req: Request, res: Response) => {
    const tags = await catalogService.listDietaryTags();
    return ok(res, tags);
  }),

  products: asyncHandler(async (req: Request, res: Response) => {
    const filters = req.query as unknown as CatalogFilters;
    const products = await catalogService.listProducts(filters);
    return ok(res, products, `${products.length} productos`);
  }),

  product: asyncHandler(async (req: Request, res: Response) => {
    const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
    const product = await catalogService.getProductBySlug(req.params.slug, branchId);
    return ok(res, product);
  }),
};
