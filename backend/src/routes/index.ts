import { Router } from 'express';
import { sequelize } from '@database/connection';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';

import authRoutes from '@modules/auth/auth.routes';
import accountRoutes from '@modules/account/account.routes';
import geoRoutes from '@modules/geo/geo.routes';
import catalogRoutes from '@modules/catalog/catalog.routes';
import customizationRoutes from '@modules/customization/customization.routes';
import pricingRoutes from '@modules/pricing/pricing.routes';
import plansRoutes from '@modules/plans/plans.routes';
import cartRoutes from '@modules/cart/cart.routes';
import checkoutRoutes from '@modules/checkout/checkout.routes';
import ordersRoutes from '@modules/orders/orders.routes';
import paymentsRoutes from '@modules/payments/payments.routes';
import operationsRoutes from '@modules/operations/operations.routes';
import deliveryRoutes from '@modules/delivery/delivery.routes';
import engagementRoutes from '@modules/engagement/engagement.routes';
import adminRoutes from '@modules/admin/admin.routes';
import accessRoutes from '@modules/access/access.routes';
import mediaRoutes from '@modules/media/media.routes';

const router = Router();

/**
 * SONDAS DE SALUD
 * ---------------------------------------------------------------------------
 * Son dos preguntas distintas y mezclarlas cuesta caro:
 *
 *   /live   ¿el proceso responde? -> si falla, reiniciame.
 *   /ready  ¿puedo atender trafico? -> si falla, sacame del balanceador, pero NO
 *           me reinicies: un hipo de la base tumbaria todas las instancias a la vez.
 *
 * `/live` no toca la base a proposito. `/ready` si, porque servir peticiones sin
 * base de datos no sirve de nada.
 */
router.get('/live', (_req, res) =>
  ok(res, { service: 'verde-bowl-api', status: 'up', uptimeSeconds: Math.round(process.uptime()) }),
);

router.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    await sequelize.authenticate();
    return ok(res, { service: 'verde-bowl-api', status: 'ready', database: 'up' });
  }),
);

/** Se mantiene por compatibilidad: la portada lo usa como diagnostico. */
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    await sequelize.authenticate();
    return ok(
      res,
      {
        service: 'verde-bowl-api',
        status: 'up',
        database: 'up',
        timestamp: new Date().toISOString(),
      },
      'API operativa',
    );
  }),
);

// Mapa de rutas (seccion 16.3 del analisis funcional)
router.use('/auth', authRoutes);
router.use('/account', accountRoutes);
router.use('/locations', geoRoutes);
router.use('/catalog', catalogRoutes);
router.use('/customizations', customizationRoutes);
router.use('/pricing', pricingRoutes);
router.use('/plans', plansRoutes);
router.use('/cart', cartRoutes);
router.use('/checkout', checkoutRoutes);
router.use('/orders', ordersRoutes);
router.use('/payments', paymentsRoutes);
router.use('/operations', operationsRoutes);
router.use('/delivery', deliveryRoutes);
router.use('/engagement', engagementRoutes);
router.use('/admin', adminRoutes);
router.use('/access', accessRoutes);
router.use('/media', mediaRoutes);

export default router;
