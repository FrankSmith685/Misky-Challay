import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { requirePermissions } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { PERMISSIONS } from '@config/constants';
import { ApiError } from '@shared/errors/ApiError';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { plansController } from './plans.controller';

/**
 * Modulo PLANS (M06).
 * Prefijo: /api/v1/plans
 */
const router = Router();

// Publico: comparar planes antes de crear cuenta.
router.get('/', plansController.list);

// El resto exige sesion: es dinero del cliente.
router.post(
  '/purchase',
  authenticate,
  validate(
    z.object({
      body: z.object({
        planCode: z.string().min(2).max(40),
        idempotencyKey: z.string().min(8).max(80),
        termsAccepted: z.literal(true, {
          errorMap: () => ({ message: 'Debes aceptar las condiciones del plan' }),
        }),
        termsVersion: z.string().min(8).max(20),
        client: z.enum(['WEB', 'MOBILE']).default('WEB'),
      }),
    }),
  ),
  asyncHandler(async () => {
    throw ApiError.conflict('Las recargas anteriores ya no se venden. Elige una caja mensual en Suscripciones.');
  }),
);

router.get('/wallet', authenticate, plansController.wallet);

router.get(
  '/wallet/transactions',
  authenticate,
  validate(
    z.object({
      query: z.object({
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(1).max(50).optional(),
      }),
    }),
  ),
  plansController.transactions,
);

// Mantenimiento: normalmente lo dispara el job programado.
router.post(
  '/expire',
  authenticate,
  requirePermissions(PERMISSIONS.PLAN_MANAGE),
  plansController.runExpiration,
);

export default router;
