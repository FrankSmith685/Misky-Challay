import { Router } from 'express';
import { pricingController } from './pricing.controller';

/**
 * Modulo PRICING - Motor de cotizacion: precios, promociones, cupones, beneficios de plan e impuestos.
 * Prefijo: /api/v1/pricing
 * Pendiente: Fase 3 del roadmap.
 */
const router = Router();

router.get('/', pricingController.placeholder);

export default router;
