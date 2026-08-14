import type { Request, Response } from 'express';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ApiError } from '@shared/errors/ApiError';
import { paymentsService, type PaymentClient } from '@modules/payments/payments.service';
import { ordersService } from './orders.service';

/**
 * Canal del que viene la peticion, por lista blanca. Decide a que pantalla devuelve
 * la pasarela; nunca se acepta una URL de retorno enviada por el cliente.
 */
const resolveClient = (body: unknown): PaymentClient =>
  (body as { client?: unknown } | undefined)?.client === 'MOBILE' ? 'MOBILE' : 'WEB';

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

  /**
   * Reintento del cobro. Devuelve una URL de pago vigente para un pedido que
   * quedo en PENDING_PAYMENT: la anterior pudo caducar y dejar al cliente sin
   * ninguna forma de pagar un pedido que ya le retiene stock y saldo.
   */
  retryPayment: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();

    const result = await ordersService.retryPayment(req.params.orderNumber, req.user.sub, {
      client: resolveClient(req.body),
      customerEmail: req.user.email,
    });

    return ok(
      res,
      {
        orderNumber: result.order.orderNumber,
        status: result.order.status,
        checkoutUrl: result.checkoutUrl,
        provider: result.payment.provider,
        amount: Number(result.payment.amount),
        currency: result.payment.currency,
        reused: result.reused,
      },
      result.reused
        ? 'Tu enlace de pago sigue activo'
        : 'Listo, abre el enlace para terminar de pagar tu pedido',
    );
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
