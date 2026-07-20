import { Router } from 'express';
import { validate } from '@middlewares/validate.middleware';
import { customizationController } from './customization.controller';
import { configSchema, quoteSchema } from './customization.validation';
import { builderEventSchema } from './customization.validation';
import { optionalAuth } from '@middlewares/auth.middleware';

/**
 * Modulo CUSTOMIZATION (M05) - Constructor de bowls.
 * Prefijo: /api/v1/customizations
 */
const router = Router();

router.post('/quote', validate(quoteSchema), customizationController.quote);
router.post('/events', optionalAuth, validate(builderEventSchema), customizationController.trackEvent);
router.get('/:productId', validate(configSchema), customizationController.config);

export default router;
