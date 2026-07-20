import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { requirePermissions } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { PERMISSIONS } from '@config/constants';
import { deliveryController } from './delivery.controller';

/**
 * Modulo DELIVERY (M11).
 * Prefijo: /api/v1/delivery
 */
const router = Router();

router.use(authenticate);

router.get(
  '/board',
  requirePermissions(PERMISSIONS.DELIVERY_READ),
  validate(z.object({ query: z.object({ branchId: z.coerce.number().int().positive() }) })),
  deliveryController.board,
);

router.get(
  '/drivers',
  requirePermissions(PERMISSIONS.DELIVERY_READ),
  validate(z.object({ query: z.object({ branchId: z.coerce.number().int().positive() }) })),
  deliveryController.drivers,
);

router.post(
  '/:deliveryId/assign',
  requirePermissions(PERMISSIONS.DELIVERY_ASSIGN),
  validate(
    z.object({
      params: z.object({ deliveryId: z.coerce.number().int().positive() }),
      body: z
        .object({
          driverId: z.coerce.number().int().positive().optional(),
          provider: z.string().max(40).optional(),
          reference: z.string().max(120).optional(),
        })
        .refine((value) => value.driverId !== undefined || value.provider !== undefined, {
          message: 'Elige un repartidor propio o indica el proveedor externo',
        }),
    }),
  ),
  deliveryController.assign,
);

router.post(
  '/:deliveryId/advance',
  requirePermissions(PERMISSIONS.DELIVERY_OPERATE),
  validate(
    z.object({
      params: z.object({ deliveryId: z.coerce.number().int().positive() }),
      body: z.object({
        status: z.enum(['PICKED_UP', 'ON_ROUTE', 'DELIVERED', 'FAILED']),
        comment: z.string().max(255).optional(),
      }),
    }),
  ),
  deliveryController.advance,
);

export default router;
