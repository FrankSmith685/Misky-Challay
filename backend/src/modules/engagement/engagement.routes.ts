import { Router } from 'express';
import { engagementController } from './engagement.controller';
import { z } from 'zod';
import { validate } from '@middlewares/validate.middleware';
import { optionalAuth } from '@middlewares/auth.middleware';
import { UX_EVENT_TYPES } from '@database/models/uxEvent.model';

/**
 * Modulo ENGAGEMENT - Favoritos, resenas, notificaciones, newsletter y soporte.
 * Prefijo: /api/v1/engagement
 * Pendiente: Fase 4 del roadmap.
 */
const router = Router();

router.post('/events', optionalAuth, validate(z.object({ body: z.object({ sessionId: z.string().uuid(), eventType: z.enum(UX_EVENT_TYPES), metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional() }) })), engagementController.track);

router.get('/', engagementController.placeholder);

export default router;
