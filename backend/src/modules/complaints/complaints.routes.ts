import { Router } from 'express';
import { authenticate, optionalAuth } from '@middlewares/auth.middleware';
import { requirePermissions } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { authLimiter } from '@middlewares/rateLimit.middleware';
import { PERMISSIONS } from '@config/constants';
import { complaintsController } from './complaints.controller';
import {
  createComplaintSchema,
  respondComplaintSchema,
  trackComplaintSchema,
} from './complaints.validation';

/**
 * Modulo COMPLAINTS - Libro de Reclamaciones Virtual (INDECOPI).
 * Prefijo: /api/v1/complaints
 *
 * Presentar un reclamo es publico por obligacion legal: no se puede exigir cuenta.
 * optionalAuth solo sirve para vincularlo al cliente si resulta que tiene sesion.
 * authLimiter frena el abuso del formulario abierto sin estorbar al usuario legitimo.
 */
const router = Router();

router.post('/', authLimiter, optionalAuth, validate(createComplaintSchema), complaintsController.create);
router.get('/track', authLimiter, validate(trackComplaintSchema), complaintsController.track);

// --- Panel: gestionar y responder ---
router.get(
  '/',
  authenticate,
  requirePermissions(PERMISSIONS.COMPLAINT_MANAGE),
  complaintsController.list,
);
router.get(
  '/:id',
  authenticate,
  requirePermissions(PERMISSIONS.COMPLAINT_MANAGE),
  complaintsController.detail,
);
router.post(
  '/:id/respond',
  authenticate,
  requirePermissions(PERMISSIONS.COMPLAINT_MANAGE),
  validate(respondComplaintSchema),
  complaintsController.respond,
);

export default router;
