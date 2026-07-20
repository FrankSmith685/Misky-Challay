import type { Request, Response } from 'express';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ApiError } from '@shared/errors/ApiError';
import { paymentsService } from '@modules/payments/payments.service';
import { ordersService } from './orders.service';

/** Modulo ORDERS (M09): historial, detalle, seguimiento y cancelacion. */
export const ordersController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const { orders, meta } = await ordersService.listByUser(req.user.sub, req.query);
    return ok(res, orders, `${meta.total} pedidos`, meta);
  }),

  detail: asyncHandler(async (req: Request, res: Response) => {
    const result = await ordersService.getForUser(
      req.params.orderNumber,
      req.user?.sub ?? null,
    );
    return ok(res, result);
  }),

  cancel: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const order = await ordersService.cancelByCustomer(
      req.params.orderNumber,
      req.user.sub,
      req.body.reason,
    );

    // Fuera de la transaccion de cancelacion: es una llamada de red al proveedor y
    // no debe poder revertir una cancelacion ya confirmada al cliente.
    const refund = await paymentsService.refundOrderPayment(
      order,
      req.body.reason ?? 'Cancelado por el cliente',
      req.user.sub,
    );

    return ok(
      res,
      { orderNumber: order.orderNumber, status: order.status, refunded: refund !== null },
      refund
        ? 'Pedido cancelado. La devolucion ya esta en camino a tu medio de pago.'
        : 'Pedido cancelado',
    );
  }),
};
