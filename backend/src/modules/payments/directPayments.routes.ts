import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { requirePermissions, requireAnyPermission } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { PERMISSIONS } from '@config/constants';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ok } from '@shared/http/ApiResponse';
import { audit } from '@shared/utils/audit';
import { branchScopeCheck, resolveBranchId } from '@shared/utils/scope';
import { directPaymentsService } from './directPayments.service';

const router = Router();
const params = z.object({ paymentId: z.coerce.number().int().positive() });
const access = (req: import('express').Request) =>
  req.user!.isSuperAdmin ||
  req.user!.permissions.some(
    (permission) =>
      permission === PERMISSIONS.PAYMENT_VERIFY || permission === PERMISSIONS.PAYMENT_REFUND,
  )
    ? { scopeCheck: branchScopeCheck(req) }
    : { userId: req.user!.sub };

export const directReportBody = z.object({
  operationCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{3,24}$/, 'Ingresa la referencia de operación de 3 a 24 caracteres'),
  payerName: z.string().trim().min(2).max(120),
  payerPhone: z
    .string()
    .trim()
    .regex(/^\d{9}$/, 'El celular debe tener 9 dígitos')
    .optional(),
  paidAt: z.string().datetime(),
  amount: z.coerce.number().positive().multipleOf(0.01).max(1000000),
  evidenceDataUrl: z.string().max(750000).optional(),
});

router.get(
  '/mobile',
  authenticate,
  requireAnyPermission(PERMISSIONS.PAYMENT_VERIFY, PERMISSIONS.PAYMENT_REFUND),
  validate(
    z.object({
      query: z.object({
        branchId: z.coerce.number().int().positive().optional(),
        state: z
          .enum([
            'AWAITING_PAYMENT',
            'REVIEW',
            'OBSERVED',
            'CONFIRMED',
            'REJECTED',
            'EXPIRED',
            'REFUND_PENDING',
            'REFUNDED',
          ])
          .optional(),
        provider: z.enum(['yape', 'plin']).optional(),
        search: z.string().trim().max(80).optional(),
        page: z.coerce.number().int().min(1).default(1),
      }),
    }),
  ),
  asyncHandler(async (req, res) => {
    return ok(
      res,
      await directPaymentsService.list(
        resolveBranchId(req, req.query.branchId as string),
        req.query as never,
      ),
    );
  }),
);

router.get(
  '/:paymentId/mobile',
  authenticate,
  validate(z.object({ params })),
  asyncHandler(async (req, res) => {
    return ok(res, await directPaymentsService.detail(Number(req.params.paymentId), access(req)));
  }),
);

router.post(
  '/:paymentId/mobile/report',
  authenticate,
  validate(z.object({ params, body: directReportBody })),
  asyncHandler(async (req, res) => {
    const result = await directPaymentsService.report(
      Number(req.params.paymentId),
      req.user!.sub,
      req.body,
    );
    await audit(req, {
      action: 'payment.mobile.report',
      entity: 'payments',
      entityId: req.params.paymentId,
      after: {
        operationCode: req.body.operationCode,
        amount: req.body.amount,
        hasEvidence: Boolean(req.body.evidenceDataUrl),
      },
    });
    return ok(res, result, 'Reporte recibido. La tienda verificará el movimiento.');
  }),
);

router.post(
  '/:paymentId/mobile/decision',
  authenticate,
  requirePermissions(PERMISSIONS.PAYMENT_VERIFY),
  validate(
    z.object({
      params,
      body: z
        .object({
          decision: z.enum(['APPROVE', 'OBSERVE', 'REJECT']),
          reason: z.string().trim().min(3).max(255).optional(),
        })
        .refine((value) => value.decision === 'APPROVE' || Boolean(value.reason), {
          path: ['reason'],
          message: 'Indica el motivo para el cliente',
        }),
    }),
  ),
  asyncHandler(async (req, res) => {
    const result = await directPaymentsService.review(
      Number(req.params.paymentId),
      req.body.decision,
      req.user!.sub,
      req.body.reason,
      branchScopeCheck(req),
    );
    await audit(req, {
      action: `payment.mobile.${req.body.decision.toLowerCase()}`,
      entity: 'payments',
      entityId: req.params.paymentId,
      after: { state: result.state, reason: req.body.reason },
    });
    return ok(res, result, 'Revisión registrada');
  }),
);

router.post(
  '/:paymentId/mobile/recovery-report',
  authenticate,
  requirePermissions(PERMISSIONS.PAYMENT_VERIFY),
  validate(
    z.object({
      params,
      body: directReportBody.extend({ reason: z.string().trim().min(3).max(255) }),
    }),
  ),
  asyncHandler(async (req, res) => {
    const result = await directPaymentsService.recoveryReport(
      Number(req.params.paymentId),
      req.user!.sub,
      req.body,
      req.body.reason,
      branchScopeCheck(req),
    );
    await audit(req, {
      action: 'payment.mobile.recovery_report',
      entity: 'payments',
      entityId: req.params.paymentId,
      after: {
        operationCode: req.body.operationCode,
        amount: req.body.amount,
        reason: req.body.reason,
      },
    });
    return ok(res, result, 'Pago registrado para revisión, sin reabrir el pedido');
  }),
);

router.get(
  '/:paymentId/mobile/evidence/:eventId',
  authenticate,
  validate(z.object({ params: params.extend({ eventId: z.coerce.number().int().positive() }) })),
  asyncHandler(async (req, res) => {
    const evidence = await directPaymentsService.evidence(
      Number(req.params.paymentId),
      Number(req.params.eventId),
      access(req),
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(evidence.mime).send(evidence.bytes);
  }),
);

router.post(
  '/:paymentId/mobile/refund-record',
  authenticate,
  requirePermissions(PERMISSIONS.PAYMENT_REFUND),
  validate(
    z.object({
      params,
      body: z.object({
        amount: z.coerce.number().positive().multipleOf(0.01),
        reference: z.string().trim().min(3).max(120),
        reason: z.string().trim().min(3).max(255),
      }),
    }),
  ),
  asyncHandler(async (req, res) => {
    const result = await directPaymentsService.recordRefund(
      Number(req.params.paymentId),
      req.body.amount,
      req.body.reference,
      req.body.reason,
      req.user!.sub,
      branchScopeCheck(req),
    );
    await audit(req, {
      action: 'payment.mobile.refund_recorded',
      entity: 'payments',
      entityId: req.params.paymentId,
      after: req.body,
    });
    return ok(res, result, 'Devolución manual registrada');
  }),
);

export default router;
