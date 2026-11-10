import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { requireAnyPermission, requirePermissions, requireSuperAdmin } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { PERMISSIONS } from '@config/constants';
import { catalogAdminController } from './catalogAdmin.controller';
import { PRODUCT_FAMILIES, PREPARATION_MODES } from '@database/models/product.model';

/**
 * ABM de catalogo.
 * Prefijo: /api/v1/admin/catalog
 *
 * Los permisos separan la edición, los precios, la publicación y los datos de seguridad.
 */
const router = Router();

router.use(authenticate);

const productId = z.object({ productId: z.coerce.number().int().positive() });
const variantId = z.object({ variantId: z.coerce.number().int().positive() });
const presentationContent = z.coerce.number().min(0.01).max(100000).multipleOf(0.01).nullable().optional();
const imageUrl = z
  .string()
  .max(255)
  .refine((value) => value.startsWith('/') || /^https?:\/\//i.test(value), {
    message: 'Usa una ruta local /images/... o una URL http(s)',
  });
const imageAlt = z.string().trim().max(180).nullable().optional();

// --- Lectura ---
router.get(
  '/products',
  requirePermissions(PERMISSIONS.CATALOG_PRODUCT_READ),
  catalogAdminController.products,
);

router.get(
  '/meta',
  requirePermissions(PERMISSIONS.CATALOG_PRODUCT_READ),
  catalogAdminController.meta,
);

router.get(
  '/categories',
  requirePermissions(PERMISSIONS.CATALOG_CATEGORY_WRITE),
  catalogAdminController.categories,
);

// --- Producto ---
router.post(
  '/products',
  requirePermissions(PERMISSIONS.CATALOG_PRODUCT_WRITE),
  validate(
    z.object({
      body: z.object({
        name: z.string().min(3).max(120),
        categoryId: z.coerce.number().int().positive(),
        type: z.enum(['FIXED', 'CUSTOMIZABLE']).default('FIXED'),
        family: z.enum(PRODUCT_FAMILIES).default('CAKE'),
        preparationMode: z.enum(PREPARATION_MODES).default('MADE_TO_ORDER'),
        minLeadHours: z.coerce.number().int().min(0).max(720).default(24),
        servingSize: presentationContent,
        servingUnit: z.enum(['porciones', 'unidades', 'g', 'kg', 'ml', 'cajas']).optional(),
        description: z.string().max(2000).optional(),
        imageUrl: imageUrl.nullable().optional(),
        imageAlt,
        variantName: z.string().min(1).max(80).default('Unico'),
        basePrice: z.coerce.number().positive(),
      }),
    }),
  ),
  catalogAdminController.createProduct,
);

router.patch(
  '/products/:productId',
  requirePermissions(PERMISSIONS.CATALOG_PRODUCT_WRITE),
  validate(
    z.object({
      params: productId,
      body: z.object({
        name: z.string().min(3).max(120).optional(),
        description: z.string().max(2000).nullable().optional(),
        categoryId: z.coerce.number().int().positive().optional(),
        family: z.enum(PRODUCT_FAMILIES).optional(),
        preparationMode: z.enum(PREPARATION_MODES).optional(),
        isFeatured: z.boolean().optional(),
        imageUrl: imageUrl.nullable().optional(),
        imageAlt,
        expectedVersion: z.coerce.number().int().positive().optional(),
      }),
    }),
  ),
  catalogAdminController.updateProduct,
);

router.post(
  '/products/:productId/duplicate',
  requirePermissions(PERMISSIONS.CATALOG_PRODUCT_WRITE),
  validate(z.object({ params: productId })),
  catalogAdminController.duplicateProduct,
);

// Publicar o retirar: permiso propio.
router.patch(
  '/products/:productId/status',
  requirePermissions(PERMISSIONS.CATALOG_PRODUCT_PUBLISH),
  validate(
    z.object({
      params: productId,
      body: z.object({ status: z.enum(['ACTIVE', 'INACTIVE']), expectedVersion: z.coerce.number().int().positive().optional() }),
    }),
  ),
  catalogAdminController.changeStatus,
);

router.delete(
  '/products/:productId',
  requirePermissions(PERMISSIONS.CATALOG_PRODUCT_WRITE),
  validate(z.object({ params: productId })),
  catalogAdminController.deleteDraftProduct,
);

router.post(
  '/products/:productId/archive',
  requirePermissions(PERMISSIONS.CATALOG_PRODUCT_WRITE),
  validate(z.object({ params: productId })),
  catalogAdminController.archiveProduct,
);

router.post(
  '/products/:productId/restore',
  requirePermissions(PERMISSIONS.CATALOG_PRODUCT_WRITE),
  validate(z.object({ params: productId })),
  catalogAdminController.restoreProduct,
);

router.get(
  '/products/:productId/purge-preview',
  requireSuperAdmin,
  validate(z.object({ params: productId })),
  catalogAdminController.previewDemoProductPurge,
);

router.post(
  '/products/:productId/purge',
  requireSuperAdmin,
  validate(z.object({ params: productId, body: z.object({ slug: z.string().regex(/^[a-z0-9-]+$/) }) })),
  catalogAdminController.purgeDemoProduct,
);

// --- Variantes y precios ---
router.post(
  '/products/:productId/variants',
  requirePermissions(PERMISSIONS.CATALOG_PRODUCT_WRITE),
  validate(
    z.object({
      params: productId,
      body: z.object({
        name: z.string().min(1).max(80),
        basePrice: z.coerce.number().positive(),
        servingSize: presentationContent,
        servingUnit: z.enum(['porciones', 'unidades', 'g', 'kg', 'ml', 'cajas']).optional(),
      }),
    }),
  ),
  catalogAdminController.addVariant,
);

router.patch(
  '/variants/:variantId',
  requirePermissions(PERMISSIONS.CATALOG_PRODUCT_WRITE),
  validate(
    z.object({
      params: variantId,
      body: z.object({
        name: z.string().min(1).max(80).optional(),
        basePrice: z.coerce.number().positive().optional(),
        servingSize: presentationContent,
        servingUnit: z.enum(['porciones', 'unidades', 'g', 'kg', 'ml', 'cajas']).optional(),
        isActive: z.boolean().optional(),
        expectedVersion: z.coerce.number().int().positive().optional(),
      }),
    }),
  ),
  catalogAdminController.updateVariant,
);

router.patch(
  '/products/:productId/allergens',
  requirePermissions(PERMISSIONS.ALLERGEN_WRITE),
  validate(
    z.object({
      params: productId,
      body: z.object({ allergenIds: z.array(z.coerce.number().int().positive()), reviewed: z.literal(true) }),
    }),
  ),
  catalogAdminController.setAllergens,
);

router.post(
  '/allergens/initialize',
  requirePermissions(PERMISSIONS.ALLERGEN_WRITE),
  catalogAdminController.initializeAllergens,
);

router.patch(
  '/products/:productId/dietary-tags',
  requirePermissions(PERMISSIONS.DIETARY_TAG_WRITE),
  validate(
    z.object({
      params: productId,
      body: z.object({ tagIds: z.array(z.coerce.number().int().positive()) }),
    }),
  ),
  catalogAdminController.setDietaryTags,
);

// --- Disponibilidad por sucursal ---
// Quien puede ESCRIBIR la disponibilidad tiene que poder leerla: el interruptor
// del panel necesita saber como esta hoy antes de ofrecer cambiarlo, y un rol a
// medida con solo `catalog.availability.write` no llegaba a la lectura.
router.get(
  '/products/:productId/availability',
  requireAnyPermission(PERMISSIONS.CATALOG_PRODUCT_READ, PERMISSIONS.CATALOG_AVAILABILITY_WRITE),
  validate(z.object({ params: productId })),
  catalogAdminController.availability,
);

router.patch(
  '/products/:productId/availability',
  requirePermissions(PERMISSIONS.CATALOG_AVAILABILITY_WRITE),
  validate(
    z.object({
      params: productId,
      body: z
        .object({
          branchId: z.coerce.number().int().positive().optional(),
          isAvailable: z.boolean(),
          reason: z.string().trim().min(3).max(255).optional(),
        })
        // Retirar un plato del menu de una cocina SIN motivo deja al cliente con
        // un "no disponible" sin explicacion y al siguiente turno sin saber por
        // que se apago. Reponerlo no necesita motivo: el servicio lo borra.
        .refine((body) => body.isAvailable || Boolean(body.reason), {
          message: 'Indica el motivo por el que se retira de esa cocina',
          path: ['reason'],
        }),
    }),
  ),
  catalogAdminController.setAvailability,
);

// --- Categorias ---
router.post(
  '/categories',
  requirePermissions(PERMISSIONS.CATALOG_CATEGORY_WRITE),
  validate(
    z.object({
      body: z.object({
        name: z.string().min(3).max(80),
        sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
        isActive: z.boolean().optional(),
        imageUrl: imageUrl.nullable().optional(),
      }),
    }),
  ),
  catalogAdminController.createCategory,
);

router.patch(
  '/categories/:categoryId',
  requirePermissions(PERMISSIONS.CATALOG_CATEGORY_WRITE),
  validate(z.object({
    params: z.object({ categoryId: z.coerce.number().int().positive() }),
    body: z.object({
      name: z.string().min(3).max(80).optional(),
      sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
      isActive: z.boolean().optional(),
      imageUrl: imageUrl.nullable().optional(),
      expectedVersion: z.coerce.number().int().positive().optional(),
    }).refine((body) => Object.keys(body).length > 0, { message: 'Indica al menos un campo para actualizar' }),
  })),
  catalogAdminController.updateCategory,
);

router.delete(
  '/categories/:categoryId',
  requirePermissions(PERMISSIONS.CATALOG_CATEGORY_WRITE),
  validate(z.object({ params: z.object({ categoryId: z.coerce.number().int().positive() }) })),
  catalogAdminController.deleteCategory,
);

export default router;
