import { Router } from 'express';
import { validate } from '@middlewares/validate.middleware';
import { authenticate, optionalAuth } from '@middlewares/auth.middleware';
import { couponLimiter, quoteLimiter } from '@middlewares/rateLimit.middleware';
import { checkoutController } from './checkout.controller';
import { placeSchema, quoteSchema } from './checkout.validation';

/**
 * Modulo CHECKOUT (M08).
 * Prefijo: /api/v1/checkout
 *
 * Cotizar es abierto: el visitante ve precio, delivery y tiempo antes de decidir
 * si se registra, y con sesion ademas se le aplican cupones y saldo.
 *
 * Confirmar EXIGE sesion. Un pedido sin cliente no tiene a quien notificar el
 * estado, ni donde aparecer en "Mis pedidos", ni contra quien validar el limite
 * de usos de un cupon o el saldo de la billetera. Es tambien lo que permite
 * reclamar despues: el Libro de Reclamaciones necesita saber de quien es el pedido.
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
router.post('/place', couponLimiter, authenticate, validate(placeSchema), checkoutController.place);
router.post('/availability', quoteLimiter, optionalAuth, validate(quoteSchema), checkoutController.availability);

export default router;
