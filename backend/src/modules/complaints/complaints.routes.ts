import { Router, type Request, type Response } from 'express';
import { authenticate, optionalAuth } from '@middlewares/auth.middleware';
import { requirePermissions } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { authLimiter } from '@middlewares/rateLimit.middleware';
import { PERMISSIONS } from '@config/constants';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { complaintsService } from './complaints.service';
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
  '/summary',
  authenticate,
  requirePermissions(PERMISSIONS.COMPLAINT_MANAGE),
  complaintsController.summary,
);
/**
 * Descarga del libro con los filtros que tenga el panel aplicados.
 *
 * Va ANTES de `/:id`: Express resuelve por orden y "export" se comeria como
 * identificador de reclamo. No pasa por el controlador porque la respuesta es un
 * archivo, no el sobre `{ success, data }` que devuelve `ok()`.
 */
router.get(
  '/export',
  authenticate,
  requirePermissions(PERMISSIONS.COMPLAINT_MANAGE),
  asyncHandler(async (req: Request, res: Response) => {
    const csv = await complaintsService.exportCsv(req.query);
    const stamp = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="libro-reclamaciones-${stamp}.csv"`);
    res.send(csv);
  }),
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
