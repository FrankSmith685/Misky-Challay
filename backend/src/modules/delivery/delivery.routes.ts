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

// La flota solo sirve para ASIGNAR, asi que se pide el permiso de asignar: con
// `delivery.read` a secas, un repartidor se descargaba el listado con el nombre y
// el telefono de todos sus companeros sin poder hacer nada con el.
router.get(
  '/drivers',
  requirePermissions(PERMISSIONS.DELIVERY_ASSIGN),
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
          /** Motivo del cambio de repartidor. Queda en el evento del reparto. */
          reason: z.string().trim().max(200).optional(),
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
      body: z
        .object({
          status: z.enum(['PICKED_UP', 'ON_ROUTE', 'DELIVERED', 'FAILED']),
          comment: z.string().trim().max(255).optional(),
        })
        // Una entrega fallida sin motivo no se puede atender despues: no se sabe si
        // el cliente estaba ausente, si la direccion era falsa o si se pincho la moto.
        .refine((value) => value.status !== 'FAILED' || (value.comment?.length ?? 0) >= 3, {
          message: 'Explica por que no se pudo entregar',
          path: ['comment'],
        }),
    }),
  ),
  deliveryController.advance,
);

export default router;
