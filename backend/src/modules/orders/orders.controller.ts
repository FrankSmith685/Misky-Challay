import type { Request, Response } from 'express';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ApiError } from '@shared/errors/ApiError';
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
    return ok(res, { orderNumber: order.orderNumber, status: order.status }, 'Pedido cancelado');
  }),
};
