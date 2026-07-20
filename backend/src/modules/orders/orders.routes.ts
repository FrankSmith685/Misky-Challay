import { Router } from 'express';
import { authenticate, optionalAuth } from '@middlewares/auth.middleware';
import { validate } from '@middlewares/validate.middleware';
import { ordersController } from './orders.controller';
import { cancelOrderSchema, listOrdersSchema, orderNumberSchema } from './orders.validation';

/**
 * Modulo ORDERS (M09).
 * Prefijo: /api/v1/orders
 *
 * El detalle usa optionalAuth: un invitado puede seguir su pedido con el numero,
 * pero si el pedido pertenece a un cliente, solo ese cliente lo ve.
 */
const router = Router();

router.get('/', authenticate, validate(listOrdersSchema), ordersController.list);
router.get('/:orderNumber', optionalAuth, validate(orderNumberSchema), ordersController.detail);
router.post(
  '/:orderNumber/cancel',
  authenticate,
  validate(cancelOrderSchema),
  ordersController.cancel,
);

export default router;
