import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { requireAnyPermission, requirePermissions } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { PERMISSIONS } from '@config/constants';
import { catalogAdminController } from './catalogAdmin.controller';

/**
 * ABM de catalogo.
 * Prefijo: /api/v1/admin/catalog
 *
 * Fijate en los permisos: EDITAR un producto, cambiar su PRECIO, PUBLICARLO y
 * tocar su NUTRICION son cuatro permisos distintos. Por eso el nutricionista
 * puede entrar aqui sin poder cambiar un solo precio.
 */
const router = Router();

router.use(authenticate);

const productId = z.object({ productId: z.coerce.number().int().positive() });
const variantId = z.object({ variantId: z.coerce.number().int().positive() });
const imageUrl = z
  .string()
  .max(255)
  .refine((value) => value.startsWith('/') || /^https?:\/\//i.test(value), {
    message: 'Usa una ruta local /images/... o una URL http(s)',
  });

// --- Lectura (la comparten el gestor de catalogo y el nutricionista) ---
router.get(
  '/products',
  requireAnyPermission(PERMISSIONS.CATALOG_PRODUCT_READ, PERMISSIONS.NUTRITION_READ),
  catalogAdminController.products,
);

router.get(
  '/meta',
  requireAnyPermission(PERMISSIONS.CATALOG_PRODUCT_READ, PERMISSIONS.NUTRITION_READ),
  catalogAdminController.meta,
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
        description: z.string().max(2000).optional(),
        imageUrl: imageUrl.nullable().optional(),
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
        isFeatured: z.boolean().optional(),
        imageUrl: imageUrl.nullable().optional(),
      }),
    }),
  ),
  catalogAdminController.updateProduct,
);

// Publicar o retirar: permiso propio.
router.patch(
  '/products/:productId/status',
  requirePermissions(PERMISSIONS.CATALOG_PRODUCT_PUBLISH),
  validate(
    z.object({
      params: productId,
      body: z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']) }),
    }),
  ),
  catalogAdminController.changeStatus,
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
        isActive: z.boolean().optional(),
      }),
    }),
  ),
  catalogAdminController.updateVariant,
);

// --- Nutricion (el nutricionista) ---
router.patch(
  '/variants/:variantId/nutrition',
  requirePermissions(PERMISSIONS.NUTRITION_WRITE),
  validate(
    z.object({
      params: variantId,
      body: z.object({
        calories: z.coerce.number().min(0).max(5000),
        protein: z.coerce.number().min(0).max(500),
        carbs: z.coerce.number().min(0).max(500),
        fat: z.coerce.number().min(0).max(500),
        fiber: z.coerce.number().min(0).max(200).optional(),
        sodium: z.coerce.number().min(0).max(10000).optional(),
      }),
    }),
  ),
  catalogAdminController.updateNutrition,
);

router.patch(
  '/products/:productId/allergens',
  requirePermissions(PERMISSIONS.ALLERGEN_WRITE),
  validate(
    z.object({
      params: productId,
      body: z.object({ allergenIds: z.array(z.coerce.number().int().positive()) }),
    }),
  ),
  catalogAdminController.setAllergens,
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
        sortOrder: z.coerce.number().int().min(0).optional(),
      }),
    }),
  ),
  catalogAdminController.createCategory,
);

export default router;
