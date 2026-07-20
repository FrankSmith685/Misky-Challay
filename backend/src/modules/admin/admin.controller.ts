import type { Request, Response } from 'express';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ApiError } from '@shared/errors/ApiError';
import { audit } from '@shared/utils/audit';
import { assertBranchScope } from '@shared/utils/scope';
import { Order } from '@database/models';
import { ORDER_STATUS, type OrderStatus } from '@config/constants';
import { ordersService } from '@modules/orders/orders.service';
import { inventoryService } from '@modules/operations/inventory.service';
import { sequelize } from '@database/models';
import { adminService, type OrderBoardFilters } from './admin.service';

/** Modulo ADMIN (M13): tablero, reportes y auditoria. */
export const adminController = {
  orders: asyncHandler(async (req: Request, res: Response) => {
    const filters = req.query as unknown as OrderBoardFilters;

    // Un admin de sucursal solo ve SUS pedidos, aunque cambie el branchId en la URL.
    const scope = req.user?.branchIds ?? [];
    if (!req.user?.isSuperAdmin && scope.length > 0) {
      filters.branchId = assertBranchScope(req, Number(filters.branchId ?? scope[0]));
    }

    const { orders, meta } = await adminService.orderBoard(filters);
    return ok(res, orders, `${meta.total} pedidos`, meta);
  }),

  /** Cambio de estado desde el panel (soporte / administrador), auditado. */
  updateOrderStatus: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();

    const order = await Order.findOne({ where: { orderNumber: req.params.orderNumber } });
    if (!order) throw ApiError.notFound('Pedido no encontrado');

    const before = { status: order.status };
    const next = req.body.status as OrderStatus;

    await sequelize.transaction(async (transaction) => {
      if (next === ORDER_STATUS.CANCELLED) {
        order.cancelReason = req.body.comment ?? 'Cancelado por soporte';
        await ordersService.releaseReservations(order, transaction);
        await inventoryService.releaseForOrder(order, transaction);
      }

      await ordersService.changeStatus(order, next, {
        actorId: req.user?.sub ?? null,
        source: 'STAFF',
        comment: req.body.comment ?? null,
        transaction,
      });
    });

    await audit(req, {
      action: 'order.update_status',
      entity: 'orders',
      entityId: order.id,
      before,
      after: { status: order.status, comment: req.body.comment ?? null },
    });

    return ok(res, { orderNumber: order.orderNumber, status: order.status }, 'Estado actualizado');
  }),

  reports: asyncHandler(async (req: Request, res: Response) => {
    const scope = req.user?.branchIds ?? [];
    const requested = req.query.branchId ? Number(req.query.branchId) : undefined;

    const reports = await adminService.reports({
      branchId:
        !req.user?.isSuperAdmin && scope.length > 0
          ? assertBranchScope(req, requested ?? scope[0])
          : requested,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    return ok(res, reports);
  }),

  auditLogs: asyncHandler(async (req: Request, res: Response) => {
    const { logs, meta } = await adminService.auditLogs(req.query);
    return ok(res, logs, `${meta.total} registros`, meta);
  }),
};
