import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { requirePermissions } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { PERMISSIONS } from '@config/constants';
import { isDevelopment } from '@config/env';
import { paymentsController } from './payments.controller';

/**
 * Modulo PAYMENTS (M08).
 * Prefijo: /api/v1/payments
 *
 * Los webhooks NO llevan sesion: se autentican con la FIRMA del proveedor.
 * En app.ts se les entrega el body crudo (express.raw) para poder verificarla.
 */
const router = Router();

// Stripe apunta aqui: stripe listen --forward-to localhost:4000/api/v1/payments/webhooks/stripe
router.post('/webhooks/stripe', paymentsController.webhook);
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

router.post(
  '/:paymentId/refund',
  authenticate,
  requirePermissions(PERMISSIONS.PAYMENT_REFUND),
  validate(
    z.object({
      params: z.object({ paymentId: z.coerce.number().int().positive() }),
      body: z.object({
        amount: z.coerce.number().positive(),
        reason: z.string().min(3).max(255),
      }),
    }),
  ),
  paymentsController.refund,
);

export default router;
