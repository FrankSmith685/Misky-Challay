import { Router } from 'express';
import { validate } from '@middlewares/validate.middleware';
import { optionalAuth } from '@middlewares/auth.middleware';
import { couponLimiter, quoteLimiter } from '@middlewares/rateLimit.middleware';
import { checkoutController } from './checkout.controller';
import { placeSchema, quoteSchema } from './checkout.validation';

/**
 * Modulo CHECKOUT (M08).
 * Prefijo: /api/v1/checkout
 *
 * optionalAuth: se puede comprar como invitado; si hay sesion, el pedido queda
 * asociado al cliente y aparece en "Mis pedidos".
 */
const router = Router();

router.post(
  '/quote',
  quoteLimiter,
  couponLimiter,
  optionalAuth,
  validate(quoteSchema),
  checkoutController.quote,
);
router.post('/place', couponLimiter, optionalAuth, validate(placeSchema), checkoutController.place);

export default router;
