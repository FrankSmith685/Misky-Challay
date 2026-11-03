import { Router } from 'express';
import { authenticate, optionalAuth } from '@middlewares/auth.middleware';
import { validate } from '@middlewares/validate.middleware';
import { ordersController } from './orders.controller';
import {
  cancelOrderSchema,
  listOrdersSchema,
  orderNumberSchema,
  retryPaymentSchema,
  balancePaymentSchema,
} from './orders.validation';

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
router.post('/:orderNumber/whatsapp/stop', authenticate, validate(orderNumberSchema), ordersController.stopWhatsapp);

/*
 * Reintento del cobro. Exige sesion y solo lo puede pedir el dueno del pedido: el
 * numero de pedido viaja en correos y pantallas, y quien lo tenga no debe poder
 * abrir un cobro a nombre de otra persona.
 *
 * Sin limitador propio a proposito: el servicio devuelve la sesion que ya existe
 * mientras siga viva, asi que repetir la llamada no genera trabajo en la pasarela.
 */
router.post(
  '/:orderNumber/payment/retry',
  authenticate,
  validate(retryPaymentSchema),
  ordersController.retryPayment,
);

router.post('/:orderNumber/payment/reconcile', authenticate, validate(orderNumberSchema), ordersController.reconcilePayment);

router.post(
  '/:orderNumber/payment/balance',
  authenticate,
  validate(balancePaymentSchema),
  ordersController.balancePayment,
);

router.post(
  '/:orderNumber/cancel',
  authenticate,
  validate(cancelOrderSchema),
  ordersController.cancel,
);

export default router;
