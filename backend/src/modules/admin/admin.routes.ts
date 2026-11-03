import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { requireAnyPermission, requirePermissions, requirePlatformOwner, requireSuperAdmin } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { PERMISSIONS } from '@config/constants';
import { adminController } from './admin.controller';
import catalogAdminRoutes from './catalogAdmin.routes';
import commercialAdminRoutes from './commercialAdmin.routes';
import cakeFinanceRoutes from '@modules/cakes/cakeFinance.routes';
import { orderContactBody } from './orderContact.service';

/**
 * Modulo ADMIN (M13).
 * Prefijo: /api/v1/admin
 * La UI oculta lo que el usuario no puede hacer, pero el permiso se valida AQUI.
 */
const router = Router();

// ABM de catalogo y ABM comercial (cada uno con su autenticacion y permisos).
router.use('/catalog', catalogAdminRoutes);
router.use(commercialAdminRoutes);
router.use('/cake-finance', cakeFinanceRoutes);

router.use(authenticate);

router.get(
  '/orders',
  requirePermissions(PERMISSIONS.ORDER_READ),
  validate(
    z.object({
      query: z.object({
        branchId: z.coerce.number().int().positive().optional(),
        status: z.string().optional(),
        // 60 y no 30: la busqueda ya no es solo el numero de pedido, tambien el
        // nombre del cliente, y un nombre completo peruano pasa de 30 caracteres.
        search: z.string().max(60).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(1).max(50).optional(),
      }),
    }),
  ),
  adminController.orders,
);

/**
 * Ficha del pedido. Se declara ANTES que `/orders/:orderNumber/status` no por
 * necesidad de Express, sino para que el GET y el POST del mismo recurso se lean
 * juntos.
 */
router.get(
  '/orders/:orderNumber',
  requirePermissions(PERMISSIONS.ORDER_READ),
  validate(
    z.object({
      params: z.object({ orderNumber: z.string().min(5).max(20) }),
    }),
  ),
  adminController.orderDetail,
);

router.post('/orders/:orderNumber/customer-contact', requirePermissions(PERMISSIONS.ORDER_READ), requireAnyPermission(PERMISSIONS.ORDER_UPDATE_STATUS, PERMISSIONS.COMMUNICATION_REPLY), validate(z.object({ params: z.object({ orderNumber: z.string().min(5).max(20) }), body: orderContactBody })), adminController.recordCustomerContact);

router.post(
  '/orders/:orderNumber/invoice',
  requirePermissions(PERMISSIONS.INVOICE_MANAGE),
  validate(
    z.object({
      params: z.object({ orderNumber: z.string().min(5).max(20) }),
      body: z.object({
        series: z.string().trim().toUpperCase().regex(/^[BF][A-Z0-9]{3}$/),
        number: z.string().trim().regex(/^\d{1,8}$/),
        providerReference: z.string().trim().max(100).optional(),
        pdfUrl: z.string().trim().url().max(500).optional(),
        xmlUrl: z.string().trim().url().max(500).optional(),
      }),
    }),
  ),
  adminController.registerInvoice,
);

router.post(
  '/orders/:orderNumber/internal-receipt/print',
  requirePermissions(PERMISSIONS.ORDER_READ),
  validate(z.object({ params: z.object({ orderNumber: z.string().min(5).max(20) }) })),
  adminController.recordInternalReceiptPrint,
);

/** Pedidos solo gestiona la cancelacion; los avances viven en su modulo operativo. */
router.post(
  '/orders/:orderNumber/status',
  requirePermissions(PERMISSIONS.ORDER_CANCEL),
  validate(
    z.object({
      params: z.object({ orderNumber: z.string().min(5).max(20) }),
      body: z.object({
        // CONFIRMED no se incluye a proposito: un pedido solo pasa a confirmado por un
        // webhook de pago con firma valida (RN-015). Hacerlo a mano regalaba la comida y
        // ademas saltaba confirmPaidOrder, dejando el pedido sin ticket de cocina.
        // Pedidos administra incidencias. Cocina, Reparto y Salon son los unicos
        // modulos que avanzan su tramo operativo para no desincronizar tickets,
        // inventario, conductores o mesas.
        status: z.literal('CANCELLED'),
        comment: z.string().max(255).optional(),
      }),
    }),
  ),
  adminController.updateOrderStatus,
);

/**
 * El Resumen es el aterrizaje diario del Administrador de sucursal, que tiene
 * `report.operations.read` y NO `report.sales.read`: exigir solo el segundo le
 * devolvia un 403 cada 30 s y una pantalla en blanco. El bloque de dinero se
 * omite en el servicio segun el permiso real (ver `adminService.reports`).
 */
router.get(
  '/reports',
  requireAnyPermission(PERMISSIONS.REPORT_SALES_READ, PERMISSIONS.REPORT_OPERATIONS_READ),
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
  '/reports/export',
  requireAnyPermission(PERMISSIONS.REPORT_SALES_READ, PERMISSIONS.REPORT_OPERATIONS_READ),
  validate(
    z.object({
      query: z.object({
        branchId: z.coerce.number().int().positive().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      }),
    }),
  ),
  adminController.reportsExport,
);

router.get(
  '/cake-commissions',
  requireSuperAdmin,
  validate(z.object({ query: z.object({ branchId: z.coerce.number().int().positive().optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), status: z.enum(['PENDING', 'LIQUIDATED']).optional() }) })),
  adminController.cakeCommissions,
);

router.patch(
  '/cake-commissions/:id/adjustment',
  requirePlatformOwner,
  validate(z.object({ params: z.object({ id: z.coerce.number().int().positive() }), body: z.object({ adjustmentAmount: z.coerce.number().min(-100000).max(100000), notes: z.string().trim().max(500).optional() }) })),
  adminController.adjustCakeCommission,
);

router.post(
  '/cake-commissions/:id/liquidate',
  requirePlatformOwner,
  validate(z.object({ params: z.object({ id: z.coerce.number().int().positive() }), body: z.object({ reference: z.string().trim().min(3).max(120), amount: z.coerce.number().positive().max(1000000).optional(), notes: z.string().trim().max(500).optional() }) })),
  adminController.liquidateCakeCommission,
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
