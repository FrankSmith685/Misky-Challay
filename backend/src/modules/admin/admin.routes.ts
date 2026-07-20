import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { requirePermissions } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { PERMISSIONS } from '@config/constants';
import { adminController } from './admin.controller';
import catalogAdminRoutes from './catalogAdmin.routes';
import commercialAdminRoutes from './commercialAdmin.routes';

/**
 * Modulo ADMIN (M13).
 * Prefijo: /api/v1/admin
 * La UI oculta lo que el usuario no puede hacer, pero el permiso se valida AQUI.
 */
const router = Router();

// ABM de catalogo y ABM comercial (cada uno con su autenticacion y permisos).
router.use('/catalog', catalogAdminRoutes);
router.use(commercialAdminRoutes);

router.use(authenticate);

router.get(
  '/orders',
  requirePermissions(PERMISSIONS.ORDER_READ),
  validate(
    z.object({
      query: z.object({
        branchId: z.coerce.number().int().positive().optional(),
        status: z.string().optional(),
        search: z.string().max(30).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(1).max(50).optional(),
      }),
    }),
  ),
  adminController.orders,
);

router.post(
  '/orders/:orderNumber/status',
  requirePermissions(PERMISSIONS.ORDER_UPDATE_STATUS),
  validate(
    z.object({
      params: z.object({ orderNumber: z.string().min(5).max(20) }),
      body: z.object({
        // CONFIRMED no se incluye a proposito: un pedido solo pasa a confirmado por un
        // webhook de pago con firma valida (RN-015). Hacerlo a mano regalaba la comida y
        // ademas saltaba confirmPaidOrder, dejando el pedido sin ticket de cocina.
        status: z.enum(['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']),
        comment: z.string().max(255).optional(),
      }),
    }),
  ),
  adminController.updateOrderStatus,
);

router.get(
  '/reports',
  requirePermissions(PERMISSIONS.REPORT_SALES_READ),
  validate(
    z.object({
      query: z.object({
        branchId: z.coerce.number().int().positive().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      }),
    }),
  ),
  adminController.reports,
);

router.get(
  '/audit-logs',
  requirePermissions(PERMISSIONS.AUDIT_READ),
  validate(
    z.object({
      query: z.object({
        entity: z.string().max(60).optional(),
        actorId: z.coerce.number().int().positive().optional(),
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(1).max(50).optional(),
      }),
    }),
  ),
  adminController.auditLogs,
);

export default router;
