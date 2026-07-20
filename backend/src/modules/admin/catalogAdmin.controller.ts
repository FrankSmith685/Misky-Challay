import type { Request, Response } from 'express';
import { created, ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { audit } from '@shared/utils/audit';
import { resolveBranchId } from '@shared/utils/scope';
import { Allergen, DietaryTag } from '@database/models';
import type { ProductStatus } from '@database/models/product.model';
import { catalogAdminService } from './catalogAdmin.service';

/** ABM de catalogo (M04). Cada endpoint exige su permiso; los cambios sensibles se auditan. */
export const catalogAdminController = {
  products: asyncHandler(async (req: Request, res: Response) => {
    const products = await catalogAdminService.listProducts({
      search: req.query.search as string | undefined,
      categoryId: req.query.categoryId ? Number(req.query.categoryId) : undefined,
      status: req.query.status as string | undefined,
    });

    return ok(res, products, `${products.length} productos`);
  }),

  /** Catalogos auxiliares para los formularios (categorias, alergenos, etiquetas). */
  meta: asyncHandler(async (_req: Request, res: Response) => {
    const [categories, allergens, tags] = await Promise.all([
      catalogAdminService.listCategories(),
      Allergen.findAll({ order: [['name', 'ASC']] }),
      DietaryTag.findAll({ order: [['name', 'ASC']] }),
    ]);

    return ok(res, { categories, allergens, dietaryTags: tags });
  }),

  createProduct: asyncHandler(async (req: Request, res: Response) => {
    const product = await catalogAdminService.createProduct(req.body);

    await audit(req, {
      action: 'catalog.product.create',
      entity: 'products',
      entityId: product.id,
      after: { name: product.name, status: product.status },
    });

    return created(res, { id: product.id, slug: product.slug }, 'Producto creado como borrador');
  }),

  updateProduct: asyncHandler(async (req: Request, res: Response) => {
    const { product, before } = await catalogAdminService.updateProduct(
      Number(req.params.productId),
      req.body,
    );

    await audit(req, {
      action: 'catalog.product.update',
      entity: 'products',
      entityId: product.id,
      before,
      after: req.body,
    });

    return ok(res, { id: product.id }, 'Producto actualizado');
  }),

  /** Publicar o retirar del menu. Permiso propio: editar no es publicar. */
  changeStatus: asyncHandler(async (req: Request, res: Response) => {
    const { product, before } = await catalogAdminService.changeStatus(
      Number(req.params.productId),
      req.body.status as ProductStatus,
    );

    await audit(req, {
      action: 'catalog.product.publish',
      entity: 'products',
      entityId: product.id,
      before,
      after: { status: product.status },
    });

    return ok(res, { id: product.id, status: product.status }, 'Estado actualizado');
  }),

  addVariant: asyncHandler(async (req: Request, res: Response) => {
    const variant = await catalogAdminService.addVariant(Number(req.params.productId), req.body);

    await audit(req, {
      action: 'catalog.variant.create',
      entity: 'product_variants',
      entityId: variant.id,
      after: { name: variant.name, basePrice: Number(variant.basePrice) },
    });

    return created(res, { id: variant.id }, 'Presentacion agregada');
  }),

  /** RN-021: el cambio de PRECIO siempre queda registrado con quien lo hizo. */
  updateVariant: asyncHandler(async (req: Request, res: Response) => {
    const { variant, before } = await catalogAdminService.updateVariant(
      Number(req.params.variantId),
      req.body,
    );

    await audit(req, {
      action: 'catalog.price.update',
      entity: 'product_variants',
      entityId: variant.id,
      before,
      after: {
        name: variant.name,
        basePrice: Number(variant.basePrice),
        isActive: variant.isActive,
      },
    });

    return ok(res, { id: variant.id }, 'Presentacion actualizada');
  }),

  /** Lo unico que toca el nutricionista. */
  updateNutrition: asyncHandler(async (req: Request, res: Response) => {
    const { nutrition, before } = await catalogAdminService.updateNutrition(
      Number(req.params.variantId),
      req.body,
    );

    await audit(req, {
      action: 'catalog.nutrition.update',
      entity: 'product_nutrition',
      entityId: nutrition.id,
      before,
      after: req.body,
    });

    return ok(res, { id: nutrition.id }, 'Nutricion actualizada');
  }),

  setAllergens: asyncHandler(async (req: Request, res: Response) => {
    const productId = Number(req.params.productId);
    const result = await catalogAdminService.setAllergens(productId, req.body.allergenIds);

    await audit(req, {
      action: 'catalog.allergens.update',
      entity: 'products',
      entityId: productId,
      before: { allergenIds: result.before },
      after: { allergenIds: result.after },
    });

    return ok(res, { productId }, 'Alergenos actualizados');
  }),

  setDietaryTags: asyncHandler(async (req: Request, res: Response) => {
    const productId = Number(req.params.productId);
    const result = await catalogAdminService.setDietaryTags(productId, req.body.tagIds);

    await audit(req, {
      action: 'catalog.tags.update',
      entity: 'products',
      entityId: productId,
      before: { tagIds: result.before },
      after: { tagIds: result.after },
    });

    return ok(res, { productId }, 'Etiquetas actualizadas');
  }),

  /** RN-005: retirar un plato del menu de una sucursal concreta. */
  setAvailability: asyncHandler(async (req: Request, res: Response) => {
    const productId = Number(req.params.productId);
    const branchId = resolveBranchId(req, req.body.branchId);

    const { before } = await catalogAdminService.setBranchAvailability(
      productId,
      branchId,
      req.body.isAvailable,
      req.body.reason,
    );

    await audit(req, {
      action: 'catalog.availability.update',
      entity: 'branch_product_availability',
      entityId: `${branchId}:${productId}`,
      before,
      after: { isAvailable: req.body.isAvailable, reason: req.body.reason ?? null },
    });

    return ok(res, { productId, branchId }, 'Disponibilidad actualizada');
  }),

  availability: asyncHandler(async (req: Request, res: Response) => {
    const rows = await catalogAdminService.listBranchAvailability(Number(req.params.productId));
    return ok(res, rows);
  }),

  createCategory: asyncHandler(async (req: Request, res: Response) => {
    const category = await catalogAdminService.createCategory(req.body);

    await audit(req, {
      action: 'catalog.category.create',
      entity: 'categories',
      entityId: category.id,
      after: { name: category.name },
    });

    return created(res, { id: category.id }, 'Categoria creada');
  }),
};
