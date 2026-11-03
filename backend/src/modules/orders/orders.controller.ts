import type { Request, Response } from 'express';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ApiError } from '@shared/errors/ApiError';
import { paymentsService, type PaymentClient } from '@modules/payments/payments.service';
import { ordersService } from './orders.service';
import { directPaymentsService } from '@modules/payments/directPayments.service';

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

  stopWhatsapp: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    await ordersService.stopWhatsapp(req.params.orderNumber, req.user.sub);
    return ok(res, { whatsappOptInAt: null }, 'Ya no recibirás avisos de este pedido por WhatsApp');
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

  reconcilePayment: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    await paymentsService.reconcileOrder(req.params.orderNumber, req.user.sub);
    return ok(res, await ordersService.getForUser(req.params.orderNumber, req.user.sub));
  }),

  balancePayment: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    if (req.body?.method === 'YAPE' || req.body?.method === 'PLIN') {
      const directPayment = await directPaymentsService.openBalance(req.params.orderNumber, req.user.sub, req.body.method === 'YAPE' ? 'yape' : 'plin');
      return ok(res, { orderNumber: req.params.orderNumber, checkoutUrl: null, paymentId: directPayment.paymentId, directPayment });
    }
    const result = await paymentsService.openBalanceCheckout(req.params.orderNumber, req.user.sub, {
      client: resolveClient(req.body),
      customerEmail: req.user.email,
    });
    return ok(res, {
      orderNumber: result.order.orderNumber,
      status: result.order.status,
      checkoutUrl: result.checkoutUrl,
      amount: Number(result.payment.amount),
      currency: result.payment.currency,
      reused: result.reused,
    }, result.reused ? 'Tu enlace de saldo sigue activo' : 'Listo, abre el enlace para pagar el saldo');
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
    if (refund) await order.reload();
    const refundPending = (await paymentsService.refundablePaymentsForOrder(order)).length > 0;

    return ok(
      res,
      { orderNumber: order.orderNumber, status: order.status, refunded: refund !== null, refundPending },
      refundPending
        ? 'Pedido cancelado. Hay un cobro cuya devolución requiere coordinación con el negocio.'
        : refund
          ? 'Pedido cancelado. La devolución online fue procesada.'
          : 'Pedido cancelado',
    );
  }),
};
