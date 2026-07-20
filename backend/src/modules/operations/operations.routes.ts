import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { requirePermissions } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { PERMISSIONS } from '@config/constants';
import { operationsController } from './operations.controller';

/**
 * Modulo OPERATIONS (M10) - Cocina e inventario.
 * Prefijo: /api/v1/operations
 * Todo exige sesion y permisos: es zona de personal.
 */
const router = Router();

router.use(authenticate);

// --- Cocina ---
router.get(
  '/kitchen/board',
  requirePermissions(PERMISSIONS.KITCHEN_READ),
  validate(
    z.object({
      query: z.object({
        branchId: z.coerce.number().int().positive(),
        status: z.string().optional(),
      }),
    }),
  ),
  operationsController.board,
);

router.post(
  '/kitchen/tickets/:ticketId/advance',
  requirePermissions(PERMISSIONS.KITCHEN_OPERATE),
  validate(
    z.object({
      params: z.object({ ticketId: z.coerce.number().int().positive() }),
      body: z.object({
        status: z.enum(['ACCEPTED', 'PREPARING', 'READY', 'DISPATCHED', 'CANCELLED']),
        comment: z.string().max(255).optional(),
      }),
    }),
  ),
  operationsController.advance,
);

// --- Inventario ---
router.get(
  '/inventory',
  requirePermissions(PERMISSIONS.INVENTORY_READ),
  validate(z.object({ query: z.object({ branchId: z.coerce.number().int().positive() }) })),
  operationsController.stock,
);

router.post(
  '/inventory/items',
  requirePermissions(PERMISSIONS.INVENTORY_MANAGE),
  validate(
    z.object({
      body: z.object({
        branchId: z.coerce.number().int().positive(),
        code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/),
        name: z.string().trim().min(2).max(80),
        unit: z.string().trim().min(1).max(10),
        unitCost: z.coerce.number().min(0).default(0),
        minLevel: z.coerce.number().min(0).default(0),
        initialStock: z.coerce.number().min(0).default(0),
      }),
    }),
  ),
  operationsController.createInventoryItem,
);

router.post(
  '/inventory/adjust',
  requirePermissions(PERMISSIONS.INVENTORY_MANAGE),
  validate(
    z.object({
      body: z.object({
        branchId: z.coerce.number().int().positive(),
        inventoryItemId: z.coerce.number().int().positive(),
        type: z.enum(['PURCHASE', 'WASTE', 'ADJUSTMENT']),
        quantity: z.coerce.number().positive(),
        reason: z.string().min(3).max(255),
      }),
    }),
  ),
  operationsController.adjustStock,
);

export default router;
