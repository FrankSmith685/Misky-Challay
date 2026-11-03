import type { Request, Response } from 'express';
import { created, ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { checkoutService, type CheckoutInput } from './checkout.service';

/** Modulo CHECKOUT (M08). El cliente puede estar autenticado o ser invitado. */
const buildInput = (req: Request): Omit<CheckoutInput, 'idempotencyKey'> => ({
  ...req.body,
  userId: req.user?.sub ?? null,
  userEmail: req.user?.email ?? null,
});

export const checkoutController = {
  availability: asyncHandler(async (req: Request, res: Response) => ok(res, await checkoutService.availability({ ...buildInput(req), idempotencyKey: 'availability-only' }))),
  /** RN-007: recotiza todo contra el catalogo antes de mostrar el total. */
  quote: asyncHandler(async (req: Request, res: Response) => {
    const quote = await checkoutService.quote({
      ...buildInput(req),
      idempotencyKey: 'quote-only',
    });
    return ok(res, quote, 'Cotizacion del pedido');
  }),

  /** Crea el pedido en PENDING_PAYMENT y devuelve la URL de pago. */
  place: asyncHandler(async (req: Request, res: Response) => {
    const result = await checkoutService.place({
      ...buildInput(req),
      idempotencyKey: req.body.idempotencyKey,
    });

    const payload = {
      orderNumber: result.order.orderNumber,
      orderId: result.order.id,
      status: result.order.status,
      grandTotal: Number(result.order.grandTotal),
      currency: result.order.currency,
      checkoutUrl: result.checkoutUrl,
      provider: result.payment?.provider ?? null,
      reused: result.reused,
    };

    return result.reused
      ? ok(res, payload, 'Este pedido ya estaba creado')
      : created(res, payload, 'Pedido creado. Continua con el pago.');
  }),
};
