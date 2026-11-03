import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { requireAnyPermission, requirePermissions } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { PERMISSIONS, type PermissionCode } from '@config/constants';
import { ApiError } from '@shared/errors/ApiError';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { audit } from '@shared/utils/audit';
import { customizationAdminService } from '@modules/customization/customizationAdmin.service';
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

/** Hora del reloj de verdad: `\d{2}:\d{2}` daba por buena "99:99". */
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:MM, de 00:00 a 23:59');

/**
 * Enlazar una opcion a un insumo con cantidad 0 no descuenta nada y no la agota
 * nunca: el enlace es decorativo y el hueco, invisible. El servicio lo vuelve a
 * comprobar sobre el estado real de la fila (un PATCH puede traer solo uno de los
 * dos campos); esto es para que el formulario reciba el error en su sitio.
 */
const linkedInventoryNeedsQuantity = (value: {
  inventoryItemId?: number | null;
  consumptionQuantity?: number;
}): boolean =>
  value.inventoryItemId === undefined
  || value.inventoryItemId === null
  || (value.consumptionQuantity ?? 0) > 0;

const INVENTORY_QUANTITY_ISSUE = {
  message: 'Indica cuanto descuenta: una opcion enlazada a un insumo no puede consumir 0',
  path: ['consumptionQuantity'],
};

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
      /* El codigo y el tipo de descuento NO se editan: un cupon ya repartido que
       * cambiara de PERCENT a FIXED valdria otra cosa para quien lo tiene
       * guardado. Todo lo demas —importe, minimo, tope y limite de usos— si, que
       * es lo que la tabla del panel ya prometia y nadie podia corregir. */
      body: z.object({
        isActive: z.boolean().optional(),
        description: z.string().min(3).max(150).optional(),
        validUntil: z.string().nullable().optional(),
        value: z.coerce.number().min(0).optional(),
        minOrderAmount: z.coerce.number().min(0).optional(),
        maxDiscountAmount: z.coerce.number().positive().nullable().optional(),
        usageLimit: z.coerce.number().int().positive().nullable().optional(),
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
      /* Un cierre MENOR que la apertura es legitimo: es el horario que cruza
       * medianoche, y el evaluador de geo.service ya lo entiende. Lo que no
       * describe nada es una franja de longitud cero, que se guardaba con un 200
       * y dejaba la cocina cerrada las 24 horas. */
      body: z
        .object({
          weekday: z.coerce.number().int().min(0).max(6),
          opensAt: clockTime,
          closesAt: clockTime,
          isClosed: z.boolean().default(false),
        })
        .refine((value) => value.isClosed || value.opensAt !== value.closesAt, {
          message: 'La hora de cierre no puede ser igual a la de apertura',
          path: ['closesAt'],
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
        extraCoverageKm: z.coerce.number().min(0).max(50).default(0),
        extraFeePerKm: z.coerce.number().min(0).default(0),
        minimumOrder: z.coerce.number().min(0).default(0),
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
        extraCoverageKm: z.coerce.number().min(0).max(50).optional(),
        extraFeePerKm: z.coerce.number().min(0).optional(),
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
        carCapacity: z.coerce.number().int().min(0).max(500).optional(),
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

/**
 * Que campos de una opcion puede tocar quien NO administra el constructor.
 *
 * Los alergenos y las etiquetas de cada ingrediente se validan aquí. El precio,
 * estado, insumo y orden siguen siendo responsabilidad del gestor del constructor.
 */
const OPTION_FIELD_PERMISSION: Record<string, PermissionCode> = {
  allergens: PERMISSIONS.ALLERGEN_WRITE,
  dietaryTags: PERMISSIONS.DIETARY_TAG_WRITE,
};

const restrictOptionFields = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.user?.isSuperAdmin) {
    next();
    return;
  }

  const granted = new Set(req.user?.permissions ?? []);
  if (granted.has(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE)) {
    next();
    return;
  }

  // El body ya viene parseado por zod, asi que aqui solo quedan campos conocidos.
  const blocked = Object.keys((req.body ?? {}) as Record<string, unknown>).filter((field) => {
    const required = OPTION_FIELD_PERMISSION[field];
    return required === undefined || !granted.has(required);
  });

  if (blocked.length > 0) {
    next(
      ApiError.forbidden(
        'Sobre este ingrediente solo puedes editar los alérgenos y las etiquetas',
      ),
    );
    return;
  }

  next();
};

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
        variantId: z.coerce.number().int().positive().nullable().optional(),
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
      body: z
        .object({
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
          cakeScaleWithServings: z.boolean().default(true),
          maxPerItem: z.coerce.number().int().min(1).max(10).default(1),
          inventoryItemId: z.coerce.number().int().positive().nullable().optional(),
          consumptionQuantity: z.coerce.number().min(0).optional(),
        })
        .refine(linkedInventoryNeedsQuantity, INVENTORY_QUANTITY_ISSUE),
    }),
  ),
  commercialAdminController.createOption,
);

router.patch(
  '/builder/options/:optionId',
  requireAnyPermission(
    PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE,
    PERMISSIONS.ALLERGEN_WRITE,
    PERMISSIONS.DIETARY_TAG_WRITE,
  ),
  validate(
    z.object({
      params: optionId,
      body: z
        .object({
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
          cakeScaleWithServings: z.boolean().optional(),
          maxPerItem: z.coerce.number().int().min(1).max(10).optional(),
          status: z.enum(['ACTIVE', 'OUT_OF_STOCK', 'INACTIVE']).optional(),
          inventoryItemId: z.coerce.number().int().positive().nullable().optional(),
          consumptionQuantity: z.coerce.number().min(0).optional(),
        })
        .refine(linkedInventoryNeedsQuantity, INVENTORY_QUANTITY_ISSUE),
    }),
  ),
  restrictOptionFields,
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

// ------------------------- Orden del constructor -------------------------
/**
 * Reordenar es RENUMERAR, no intercambiar.
 *
 * El panel intercambiaba el `sortOrder` de dos filas, lo que exige que los
 * valores sean unicos, y no lo eran: con dos empatados el desempate pasaba a ser
 * alfabetico y la flecha no movia nada mientras el toast decia "Orden
 * actualizado". Estos tres endpoints reciben la lista completa en el orden
 * deseado y la reescriben 0..n-1 en una transaccion, asi que ademas reparan los
 * empates que ya hubiera.
 *
 * Los handlers viven aqui, y no en `commercialAdmin.controller`, porque ese
 * archivo pertenece a otro paquete de trabajo; son tres lineas cada uno y hacen
 * lo mismo que sus vecinos: servicio, auditoria y respuesta.
 */
const idList = z.array(z.coerce.number().int().positive()).min(1).max(200);

router.patch(
  '/builder/:productId/groups/order',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(
    z.object({
      params: z.object({ productId: z.coerce.number().int().positive() }),
      body: z.object({ groupIds: idList }),
    }),
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const productId = Number(req.params.productId);
    const groupIds = req.body.groupIds as number[];
    const result = await customizationAdminService.reorderGroups(productId, groupIds);

    await audit(req, {
      action: 'builder.group.reorder',
      entity: 'customization_groups',
      entityId: productId,
      after: { groupIds },
    });

    return ok(res, result, 'Orden de pasos actualizado');
  }),
);

router.patch(
  '/builder/groups/:groupId/options/order',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(z.object({ params: groupId, body: z.object({ optionIds: idList }) })),
  asyncHandler(async (req: Request, res: Response) => {
    const group = Number(req.params.groupId);
    const optionIds = req.body.optionIds as number[];
    const result = await customizationAdminService.reorderOptions(group, optionIds);

    await audit(req, {
      action: 'builder.option.reorder',
      entity: 'customization_options',
      entityId: group,
      after: { optionIds },
    });

    return ok(res, result, 'Orden de ingredientes actualizado');
  }),
);

router.patch(
  '/builder/:productId/presets/order',
  requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE),
  validate(
    z.object({
      params: z.object({ productId: z.coerce.number().int().positive() }),
      body: z.object({ presetIds: idList }),
    }),
  ),
  asyncHandler(async (req: Request, res: Response) => {
    const productId = Number(req.params.productId);
    const presetIds = req.body.presetIds as number[];
    const result = await customizationAdminService.reorderPresets(productId, presetIds);

    await audit(req, {
      action: 'builder.preset.reorder',
      entity: 'builder_presets',
      entityId: productId,
      after: { presetIds },
    });

    return ok(res, result, 'Orden de recomendaciones actualizado');
  }),
);

export default router;
