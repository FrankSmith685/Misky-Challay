import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { requireAnyPermission, requirePermissions } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { PERMISSIONS } from '@config/constants';
import { commercialAdminController } from './commercialAdmin.controller';

/**
 * ABM comercial y de cobertura.
 * Prefijo: /api/v1/admin
 *
 * Con estos endpoints ya NADA del negocio vive en los seeders: cupones, planes,
 * sucursales, zonas, horarios, franjas y las reglas del constructor se administran
 * desde el panel.
 */
const router = Router();
const imageUrl = z
  .string()
  .max(255)
  .refine((value) => value.startsWith('/') || /^https?:\/\//i.test(value), {
    message: 'Usa una ruta local /images/... o una URL http(s)',
  });

router.use(authenticate);

router.get('/drafts/:key', requirePermissions(PERMISSIONS.GEO_WRITE), validate(z.object({ params: z.object({ key: z.string().min(2).max(120) }) })), commercialAdminController.getDraft);
router.put('/drafts/:key', requirePermissions(PERMISSIONS.GEO_WRITE), validate(z.object({ params: z.object({ key: z.string().min(2).max(120) }), body: z.object({ scope: z.string().min(2).max(60), payload: z.record(z.unknown()), publishAt: z.string().datetime().nullable().optional() }) })), commercialAdminController.saveDraft);
router.delete('/drafts/:key', requirePermissions(PERMISSIONS.GEO_WRITE), validate(z.object({ params: z.object({ key: z.string().min(2).max(120) }) })), commercialAdminController.deleteDraft);

// ============================ CUPONES ============================
router.get(
  '/coupons',
  requirePermissions(PERMISSIONS.PROMOTION_MANAGE),
  commercialAdminController.coupons,
);

router.post(
  '/coupons',
  requirePermissions(PERMISSIONS.PROMOTION_MANAGE),
  validate(
    z.object({
      body: z.object({
        code: z.string().min(3).max(40),
        description: z.string().min(3).max(150),
        discountType: z.enum(['PERCENT', 'FIXED', 'FREE_DELIVERY']),
        value: z.coerce.number().min(0),
        minOrderAmount: z.coerce.number().min(0).default(0),
        maxDiscountAmount: z.coerce.number().positive().nullable().optional(),
        validUntil: z.string().nullable().optional(),
        usageLimit: z.coerce.number().int().positive().nullable().optional(),
        usageLimitPerUser: z.coerce.number().int().min(1).default(1),
      }),
    }),
  ),
  commercialAdminController.createCoupon,
);

router.patch(
  '/coupons/:couponId',
  requirePermissions(PERMISSIONS.PROMOTION_MANAGE),
  validate(
    z.object({
      params: z.object({ couponId: z.coerce.number().int().positive() }),
      body: z.object({
        isActive: z.boolean().optional(),
        description: z.string().min(3).max(150).optional(),
        validUntil: z.string().nullable().optional(),
      }),
    }),
  ),
  commercialAdminController.updateCoupon,
);

// ============================ PLANES ============================
router.get(
  '/plans',
  requireAnyPermission(PERMISSIONS.PLAN_MANAGE, PERMISSIONS.PLAN_READ),
  commercialAdminController.plans,
);

router.post(
  '/plans',
  requirePermissions(PERMISSIONS.PLAN_MANAGE),
  validate(
    z.object({
      body: z.object({
        code: z.string().min(3).max(40),
        name: z.string().min(3).max(80),
        description: z.string().max(255).optional(),
        price: z.coerce.number().positive(),
        grantedCredit: z.coerce.number().positive(),
        validityDays: z.coerce.number().int().min(1).max(365),
        sortOrder: z.coerce.number().int().min(0).optional(),
      }),
    }),
  ),
  commercialAdminController.createPlan,
);

router.patch(
  '/plans/:planId',
  requirePermissions(PERMISSIONS.PLAN_MANAGE),
  validate(
    z.object({
      params: z.object({ planId: z.coerce.number().int().positive() }),
      body: z.object({
        name: z.string().min(3).max(80).optional(),
        description: z.string().max(255).optional(),
        price: z.coerce.number().positive().optional(),
        grantedCredit: z.coerce.number().positive().optional(),
        validityDays: z.coerce.number().int().min(1).max(365).optional(),
        isActive: z.boolean().optional(),
        isFeatured: z.boolean().optional(),
      }),
    }),
  ),
  commercialAdminController.updatePlan,
);

router.put(
  '/plans/:planId/benefits',
  requirePermissions(PERMISSIONS.PLAN_MANAGE),
  validate(
    z.object({
      params: z.object({ planId: z.coerce.number().int().positive() }),
      body: z.object({
        type: z.enum(['DISCOUNT_PERCENT', 'FREE_DELIVERY']),
        value: z.coerce.number().min(0).max(100),
        maxAmountPerOrder: z.coerce.number().positive().nullable().optional(),
        description: z.string().min(3).max(150),
      }),
    }),
  ),
  commercialAdminController.setPlanBenefit,
);

router.delete(
  '/plans/:planId/benefits/:benefitId',
  requirePermissions(PERMISSIONS.PLAN_MANAGE),
  validate(
    z.object({
      params: z.object({
        planId: z.coerce.number().int().positive(),
        benefitId: z.coerce.number().int().positive(),
      }),
    }),
  ),
  commercialAdminController.removePlanBenefit,
);

// ============================ COBERTURA ============================
router.get(
  '/coverage',
  requireAnyPermission(PERMISSIONS.GEO_READ, PERMISSIONS.GEO_WRITE),
  commercialAdminController.coverage,
);

router.post(
  '/coverage/branches',
  requirePermissions(PERMISSIONS.GEO_WRITE),
  validate(
    z.object({
      body: z.object({
        cityId: z.coerce.number().int().positive(),
        name: z.string().min(3).max(100),
        addressLine: z.string().min(5).max(200),
        districtId: z.coerce.number().int().positive().nullable().optional(),
        latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
        longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
        phone: z.string().max(30).optional(),
        prepMinutes: z.coerce.number().int().min(1).max(240).default(20),
        acceptsPickup: z.boolean().default(true),
        acceptsDelivery: z.boolean().default(true),
      }),
    }),
  ),
  commercialAdminController.createBranch,
);

router.patch(
  '/coverage/branches/:branchId',
  requirePermissions(PERMISSIONS.GEO_WRITE),
  validate(
    z.object({
      params: z.object({ branchId: z.coerce.number().int().positive() }),
      body: z.object({
        name: z.string().min(3).max(100).optional(),
        addressLine: z.string().min(5).max(200).optional(),
        districtId: z.coerce.number().int().positive().nullable().optional(),
        latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
        longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
        phone: z.string().max(30).nullable().optional(),
        prepMinutes: z.coerce.number().int().min(1).max(240).optional(),
        acceptsPickup: z.boolean().optional(),
        acceptsDelivery: z.boolean().optional(),
        isActive: z.boolean().optional(),
      }),
    }),
  ),
  commercialAdminController.updateBranch,
);

router.put(
  '/coverage/branches/:branchId/schedule',
  requirePermissions(PERMISSIONS.GEO_WRITE),
  validate(
    z.object({
      params: z.object({ branchId: z.coerce.number().int().positive() }),
      body: z.object({
        weekday: z.coerce.number().int().min(0).max(6),
        opensAt: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
        closesAt: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
        isClosed: z.boolean().default(false),
      }),
    }),
  ),
  commercialAdminController.setSchedule,
);

router.post(
  '/coverage/zones',
  requirePermissions(PERMISSIONS.GEO_WRITE),
  validate(
    z.object({
      body: z.object({
        cityId: z.coerce.number().int().positive(),
        name: z.string().min(3).max(80),
        deliveryFee: z.coerce.number().min(0),
        minimumOrder: z.coerce.number().min(0),
        estimatedMinutes: z.coerce.number().int().min(5).max(240),
        priority: z.coerce.number().int().min(1).default(1),
        polygon: z
          .array(z.object({ lat: z.coerce.number(), lng: z.coerce.number() }))
          .min(3)
          .optional(),
      }),
    }),
  ),
  commercialAdminController.createZone,
);

router.patch(
  '/coverage/zones/:zoneId',
  requirePermissions(PERMISSIONS.GEO_WRITE),
  validate(
    z.object({
      params: z.object({ zoneId: z.coerce.number().int().positive() }),
      body: z.object({
        name: z.string().min(3).max(80).optional(),
        deliveryFee: z.coerce.number().min(0).optional(),
        minimumOrder: z.coerce.number().min(0).optional(),
        estimatedMinutes: z.coerce.number().int().min(5).max(240).optional(),
        priority: z.coerce.number().int().min(1).optional(),
        isActive: z.boolean().optional(),
        polygon: z.array(z.object({ lat: z.coerce.number(), lng: z.coerce.number() })).min(3).nullable().optional(),
      }),
    }),
  ),
  commercialAdminController.updateZone,
);

router.post(
  '/coverage/zones/:zoneId/branches',
  requirePermissions(PERMISSIONS.GEO_WRITE),
  validate(
    z.object({
      params: z.object({ zoneId: z.coerce.number().int().positive() }),
      body: z.object({
        branchId: z.coerce.number().int().positive(),
        priority: z.coerce.number().int().min(1).optional(),
      }),
    }),
  ),
  commercialAdminController.assignZone,
);

router.post(
  '/coverage/districts',
  requirePermissions(PERMISSIONS.GEO_WRITE),
  validate(
    z.object({
      body: z.object({
        cityId: z.coerce.number().int().positive(),
        name: z.string().min(3).max(80),
        ubigeoCode: z.string().regex(/^\d{6}$/, 'El UBIGEO debe tener 6 dígitos').optional(),
        coverageZoneId: z.coerce.number().int().positive().nullable().optional(),
      }),
    }),
  ),
  commercialAdminController.createDistrict,
);

router.patch(
  '/coverage/districts/:districtId',
  requirePermissions(PERMISSIONS.GEO_WRITE),
  validate(
    z.object({
      params: z.object({ districtId: z.coerce.number().int().positive() }),
      body: z.object({
        coverageZoneId: z.coerce.number().int().positive().nullable(),
      }),
    }),
  ),
  commercialAdminController.setDistrictZone,
);

router.post(
  '/coverage/slots',
  requirePermissions(PERMISSIONS.GEO_WRITE),
  validate(
    z.object({
      body: z.object({
        branchId: z.coerce.number().int().positive(),
        days: z.coerce.number().int().min(1).max(30).default(7),
        capacity: z.coerce.number().int().min(1).max(500).default(20),
        cutoffHours: z.coerce.number().int().min(0).max(48).default(2),
        windows: z
          .array(
            z.object({
              startHour: z.coerce.number().int().min(0).max(23),
              endHour: z.coerce.number().int().min(1).max(24),
            }),
          )
          .min(1),
      }),
    }),
  ),
  commercialAdminController.generateSlots,
);

// ======================= CONSTRUCTOR DE BOWLS =======================
const groupId = z.object({ groupId: z.coerce.number().int().positive() });
const optionId = z.object({ optionId: z.coerce.number().int().positive() });

router.get(
  '/builder/:productId',
  requireAnyPermission(
    PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE,
    PERMISSIONS.CATALOG_PRODUCT_READ,
  ),
  validate(z.object({ params: z.object({ productId: z.coerce.number().int().positive() }) })),
  commercialAdminController.builderConfig,
);

router.get(
  '/builder/:productId/history',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(z.object({
    params: z.object({ productId: z.coerce.number().int().positive() }),
    query: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }),
  })),
  commercialAdminController.builderHistory,
);

router.get(
  '/builder/:productId/analytics',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(z.object({
    params: z.object({ productId: z.coerce.number().int().positive() }),
    query: z.object({ days: z.coerce.number().int().min(1).max(365).optional() }),
  })),
  commercialAdminController.builderAnalytics,
);

router.post(
  '/builder/:productId/groups',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(
    z.object({
      params: z.object({ productId: z.coerce.number().int().positive() }),
      body: z.object({
        code: z
          .string()
          .min(2)
          .max(40)
          .regex(/^[a-z0-9_]+$/),
        name: z.string().min(2).max(80),
        description: z.string().max(255).optional(),
        selectionType: z.enum(['SINGLE', 'MULTIPLE']),
        minSelection: z.coerce.number().int().min(0).max(20),
        maxSelection: z.coerce.number().int().min(1).max(20),
        freeQuantity: z.coerce.number().int().min(0).max(20),
        sortOrder: z.coerce.number().int().min(0).default(0),
      }),
    }),
  ),
  commercialAdminController.createGroup,
);

router.patch(
  '/builder/groups/:groupId',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(
    z.object({
      params: groupId,
      body: z.object({
        name: z.string().min(2).max(80).optional(),
        description: z.string().max(255).nullable().optional(),
        selectionType: z.enum(['SINGLE', 'MULTIPLE']).optional(),
        minSelection: z.coerce.number().int().min(0).max(20).optional(),
        maxSelection: z.coerce.number().int().min(1).max(20).optional(),
        freeQuantity: z.coerce.number().int().min(0).max(20).optional(),
        sortOrder: z.coerce.number().int().min(0).optional(),
      }),
    }),
  ),
  commercialAdminController.updateGroup,
);

router.delete(
  '/builder/groups/:groupId',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(z.object({ params: groupId })),
  commercialAdminController.deleteGroup,
);

router.post(
  '/builder/groups/:groupId/options',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(
    z.object({
      params: groupId,
      body: z.object({
        name: z.string().min(2).max(80),
        description: z.string().max(255).nullable().optional(),
        imageUrl: imageUrl.nullable().optional(),
        imageAlt: z.string().max(180).nullable().optional(),
        imagePosition: z.string().regex(/^\d{1,3}% \d{1,3}%$/).optional(),
        dietaryTags: z.array(z.string().min(1).max(40)).max(10).optional(),
        allergens: z.array(z.string().min(1).max(40)).max(10).optional(),
        spiceLevel: z.coerce.number().int().min(0).max(3).optional(),
        sortOrder: z.coerce.number().int().min(0).optional(),
        priceDelta: z.coerce.number().min(0),
        chargeAlways: z.boolean().default(false),
        calories: z.coerce.number().min(0).default(0),
        protein: z.coerce.number().min(0).default(0),
        carbs: z.coerce.number().min(0).default(0),
        fat: z.coerce.number().min(0).default(0),
        maxPerItem: z.coerce.number().int().min(1).max(10).default(1),
        inventoryItemId: z.coerce.number().int().positive().nullable().optional(),
        consumptionQuantity: z.coerce.number().min(0).optional(),
      }),
    }),
  ),
  commercialAdminController.createOption,
);

router.patch(
  '/builder/options/:optionId',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(
    z.object({
      params: optionId,
      body: z.object({
        name: z.string().min(2).max(80).optional(),
        description: z.string().max(255).nullable().optional(),
        imageUrl: imageUrl.nullable().optional(),
        imageAlt: z.string().max(180).nullable().optional(),
        imagePosition: z.string().regex(/^\d{1,3}% \d{1,3}%$/).optional(),
        dietaryTags: z.array(z.string().min(1).max(40)).max(10).optional(),
        allergens: z.array(z.string().min(1).max(40)).max(10).optional(),
        spiceLevel: z.coerce.number().int().min(0).max(3).optional(),
        sortOrder: z.coerce.number().int().min(0).optional(),
        priceDelta: z.coerce.number().min(0).optional(),
        chargeAlways: z.boolean().optional(),
        calories: z.coerce.number().min(0).optional(),
        protein: z.coerce.number().min(0).optional(),
        carbs: z.coerce.number().min(0).optional(),
        fat: z.coerce.number().min(0).optional(),
        maxPerItem: z.coerce.number().int().min(1).max(10).optional(),
        status: z.enum(['ACTIVE', 'OUT_OF_STOCK', 'INACTIVE']).optional(),
        inventoryItemId: z.coerce.number().int().positive().nullable().optional(),
        consumptionQuantity: z.coerce.number().min(0).optional(),
      }),
    }),
  ),
  commercialAdminController.updateOption,
);

router.delete(
  '/builder/options/:optionId',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(z.object({ params: optionId })),
  commercialAdminController.deleteOption,
);

router.post(
  '/builder/options/:optionId/incompatibilities',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(
    z.object({
      params: optionId,
      body: z.object({
        incompatibleOptionId: z.coerce.number().int().positive(),
        reason: z.string().max(255).optional(),
      }),
    }),
  ),
  commercialAdminController.addIncompatibility,
);

router.delete(
  '/builder/options/:optionId/incompatibilities/:otherId',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(
    z.object({
      params: z.object({
        optionId: z.coerce.number().int().positive(),
        otherId: z.coerce.number().int().positive(),
      }),
    }),
  ),
  commercialAdminController.removeIncompatibility,
);

router.post(
  '/builder/options/:optionId/duplicate',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(z.object({ params: optionId })),
  commercialAdminController.duplicateOption,
);

router.patch(
  '/builder/options/actions/bulk',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(z.object({ body: z.object({
    optionIds: z.array(z.coerce.number().int().positive()).min(1).max(100),
    status: z.enum(['ACTIVE', 'OUT_OF_STOCK', 'INACTIVE']),
  }) })),
  commercialAdminController.bulkUpdateOptions,
);

router.put(
  '/builder/options/:optionId/availability',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(z.object({
    params: optionId,
    body: z.object({
      branchId: z.coerce.number().int().positive(),
      isAvailable: z.boolean().default(true),
      priceOverride: z.coerce.number().min(0).nullable().optional(),
      availableFrom: z.coerce.date().nullable().optional(),
      availableUntil: z.coerce.date().nullable().optional(),
    }),
  })),
  commercialAdminController.setOptionSchedule,
);

const presetBody = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(255).nullable().optional(),
  imageUrl: imageUrl.nullable().optional(),
  badge: z.string().max(40).nullable().optional(),
  isFeatured: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  selections: z.array(z.object({
    optionId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().min(1).max(10),
  })).min(1).max(30),
});

router.post(
  '/builder/:productId/presets',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(z.object({
    params: z.object({ productId: z.coerce.number().int().positive() }),
    body: presetBody.extend({ code: z.string().min(2).max(60).regex(/^[a-z0-9_]+$/) }),
  })),
  commercialAdminController.createPreset,
);
router.patch(
  '/builder/presets/:presetId',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(z.object({
    params: z.object({ presetId: z.coerce.number().int().positive() }),
    body: presetBody.partial(),
  })),
  commercialAdminController.updatePreset,
);
router.delete(
  '/builder/presets/:presetId',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(z.object({ params: z.object({ presetId: z.coerce.number().int().positive() }) })),
  commercialAdminController.deletePreset,
);

export default router;
