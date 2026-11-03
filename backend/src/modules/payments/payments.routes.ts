import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { requirePermissions } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { PERMISSIONS } from '@config/constants';
import { isDevelopment } from '@config/env';
import { paymentsController } from './payments.controller';
import directPaymentRoutes from './directPayments.routes';

/**
 * Modulo PAYMENTS (M08).
 * Prefijo: /api/v1/payments
 *
 * Los webhooks NO llevan sesion: se autentican con la FIRMA del proveedor.
 * En app.ts se les entrega el body crudo (express.raw) para poder verificarla.
 */
const router = Router();
router.use(directPaymentRoutes);

router.get(
  '/mobile/pending',
  authenticate,
  requirePermissions(PERMISSIONS.PAYMENT_VERIFY),
  validate(z.object({ query: z.object({ branchId: z.coerce.number().int().positive().optional() }) })),
  paymentsController.pendingMobile,
);

router.post(
  '/:paymentId/mobile/review',
  authenticate,
  requirePermissions(PERMISSIONS.PAYMENT_VERIFY),
  validate(z.object({
    params: z.object({ paymentId: z.coerce.number().int().positive() }),
    body: z.object({
      decision: z.enum(['APPROVE', 'REJECT']),
      reason: z.string().trim().min(3).max(255).optional(),
    }).superRefine((value, context) => {
      if (value.decision === 'REJECT' && !value.reason) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Indica por que se rechaza' });
      }
    }),
  })),
  paymentsController.reviewMobile,
);

router.post('/:paymentId/cash/capture', authenticate, requirePermissions(PERMISSIONS.PAYMENT_VERIFY), validate(z.object({
  params: z.object({ paymentId: z.coerce.number().int().positive() }),
  body: z.object({ reference: z.string().trim().min(3).max(120) }),
})), paymentsController.captureCash);

// Stripe apunta aqui: stripe listen --forward-to localhost:4000/api/v1/payments/webhooks/stripe
router.post('/webhooks/stripe', paymentsController.webhook);
router.post('/webhooks/mercadopago', paymentsController.webhook);
// Mismo handler para el simulador local (firma HMAC propia).
router.post('/webhooks/mock', paymentsController.webhook);

// Solo desarrollo: la pagina del simulador llama aqui para "pagar".
// La ruta NO se registra fuera de desarrollo: montarla siempre convertia cualquier
// despliegue sin NODE_ENV (cuyo default es 'development') en un boton publico de
// "confirmar mi pedido sin pagar", con la referencia entregada en la checkoutUrl.
if (isDevelopment) {
  router.post(
    '/dev/simulate',
    validate(
      z.object({
        body: z.object({
          providerReference: z.string().min(5),
          outcome: z.enum(['pay', 'fail']).default('pay'),
        }),
      }),
    ),
    paymentsController.simulate,
  );
}

/**
 * Devolucion manual (RN-019). Es el unico boton del sistema que saca dinero por
 * decision de una persona, y ahora tiene interfaz: la ficha del pedido del panel.
 *
 * `amount` es OBLIGATORIO a proposito —no hay reembolso "total" implicito— y se
 * exige a dos decimales: el importe acaba en un DECIMAL(12,2) y un S/ 10.005
 * enviado al proveedor dejaba de cuadrar contra lo asentado. El tope real (lo que
 * queda por devolver de ese cobro) lo calcula el servicio con la fila bloqueada.
 */
router.post(
  '/:paymentId/refund',
  authenticate,
  requirePermissions(PERMISSIONS.PAYMENT_REFUND),
  validate(
    z.object({
      params: z.object({ paymentId: z.coerce.number().int().positive() }),
      body: z.object({
        amount: z.coerce.number().positive().multipleOf(0.01),
        reason: z.string().min(3).max(255),
      }),
    }),
  ),
  paymentsController.refund,
);

export default router;
