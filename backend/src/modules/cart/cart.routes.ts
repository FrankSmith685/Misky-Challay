import { Router } from 'express';
import { cartController } from './cart.controller';

/**
 * Modulo CART - Carrito persistente, items y personalizaciones temporales.
 * Prefijo: /api/v1/cart
 * Pendiente: Fase 3 del roadmap.
 */
const router = Router();

router.get('/', cartController.placeholder);

export default router;
