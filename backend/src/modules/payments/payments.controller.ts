import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ApiError } from '@shared/errors/ApiError';
import { env, isProduction } from '@config/env';
import { PERMISSIONS } from '@config/constants';
import { getPaymentProvider } from '@integrations/payments';
import { paymentsService } from './payments.service';
import { audit } from '@shared/utils/audit';
import { branchScopeCheck, resolveBranchId } from '@shared/utils/scope';

export const paymentsController = {
  pendingMobile: asyncHandler(async (req: Request, res: Response) => {
    const branchId = resolveBranchId(req, req.query.branchId as string | undefined);
    return ok(res, await paymentsService.pendingMobilePayments(branchId));
  }),

  reviewMobile: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const result = await paymentsService.reviewMobilePayment(
      Number(req.params.paymentId), req.body.decision, req.user.sub, req.body.reason, branchScopeCheck(req),
    );
    await audit(req, {
      action: `payment.mobile.${req.body.decision === 'APPROVE' ? 'approve' : 'reject'}`,
      entity: 'payments', entityId: req.params.paymentId,
      after: result,
    });
    return ok(res, result, req.body.decision === 'APPROVE' ? 'Pago aprobado y pedido enviado a cocina' : 'Pago rechazado y reservas liberadas');
  }),

  /**
   * Webhook del proveedor. Es la unica via por la que un pedido se confirma (RN-014).
   * Llega con el body CRUDO (Buffer) para poder verificar la firma.
   */
  webhook: asyncHandler(async (req: Request, res: Response) => {
    const provider = getPaymentProvider();
    const signature =
      provider.name === 'stripe'
        ? (req.headers['stripe-signature'] as string | undefined)
        : (req.headers['x-mock-signature'] as string | undefined);

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    const result = await paymentsService.handleWebhook(rawBody, signature);

    // Siempre 200 cuando la firma es valida: si devolvemos error, el proveedor reintenta.
    return ok(res, result, result.reason);
  }),

  /** Reembolso: requiere permiso elevado y queda auditado (RN-019). */
  refund: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();

    const refund = await paymentsService.refund(
      Number(req.params.paymentId),
      Number(req.body.amount),
      req.body.reason,
      req.user.sub,
    );

    return ok(res, refund, 'Reembolso registrado');
  }),

  /**
   * SOLO DESARROLLO (simulador de pago).
   * Firma un evento como lo haria el proveedor y lo pasa por el MISMO webhook,
   * asi el camino que se prueba hoy es el que correra con Stripe manana.
   */
  simulate: asyncHandler(async (req: Request, res: Response) => {
    const provider = getPaymentProvider();
    if (isProduction || provider.isLive) {
      throw ApiError.forbidden('El simulador solo existe en desarrollo sin Stripe');
    }

    const event = {
      id: `evt_${crypto.randomUUID()}`,
      type: req.body.outcome === 'fail' ? 'payment.failed' : 'payment.succeeded',
      providerReference: req.body.providerReference,
      reason: req.body.outcome === 'fail' ? 'Tarjeta rechazada (simulado)' : undefined,
    };

    const rawBody = Buffer.from(JSON.stringify(event));
    const signature = crypto
      .createHmac('sha256', env.MOCK_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    const result = await paymentsService.handleWebhook(rawBody, signature);
    return ok(res, result, result.reason);
  }),
};

export const REFUND_PERMISSION = PERMISSIONS.PAYMENT_REFUND;
