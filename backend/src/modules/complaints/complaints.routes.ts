import { Router, type Request, type Response } from 'express';
import { authenticate, optionalAuth } from '@middlewares/auth.middleware';
import { requireAnyPermission, requireSuperAdmin } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { authLimiter } from '@middlewares/rateLimit.middleware';
import { PERMISSIONS } from '@config/constants';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { complaintsService } from './complaints.service';
import { complaintsController } from './complaints.controller';
import { audit } from '@shared/utils/audit';
import {
  createComplaintSchema,
  respondComplaintSchema,
  trackComplaintSchema,
  complaintActionSchema, assignComplaintSchema, complaintDraftSchema, complaintNoteSchema, complaintEvidenceSchema,
  complaintResponseIdSchema, complaintEvidenceIdSchema, complaintCalendarSchema, complaintHolidaySchema, complaintListSchema, complaintExportSchema,
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
  requireAnyPermission(PERMISSIONS.COMPLAINT_READ, PERMISSIONS.COMPLAINT_MANAGE),
  validate(complaintListSchema),
  complaintsController.list,
);
router.get(
  '/summary',
  authenticate,
  requireAnyPermission(PERMISSIONS.COMPLAINT_READ, PERMISSIONS.COMPLAINT_MANAGE),
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
  requireAnyPermission(PERMISSIONS.COMPLAINT_EXPORT, PERMISSIONS.COMPLAINT_MANAGE),
  validate(complaintExportSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const csv = await complaintsService.exportCsv(req.query);
    await audit(req, { action: 'complaint.export', entity: 'complaints', after: {
      from: req.query.from, to: req.query.to, status: req.query.status, search: Boolean(req.query.search), masked: req.query.masked,
      reason: req.query.reason,
    } });
    const stamp = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="libro-reclamaciones-${stamp}.csv"`);
    res.send(csv);
  }),
);

// Las rutas fijas van antes de `/:id`: de lo contrario Express trataría
// "assignees" o "holidays" como el identificador de un reclamo.
router.get('/assignees', authenticate, requireAnyPermission(PERMISSIONS.COMPLAINT_READ, PERMISSIONS.COMPLAINT_MANAGE), complaintsController.assignees);
router.get('/holidays', authenticate, requireAnyPermission(PERMISSIONS.COMPLAINT_READ, PERMISSIONS.COMPLAINT_MANAGE), validate(complaintCalendarSchema), complaintsController.holidays);
router.post('/holidays', authenticate, requireSuperAdmin, validate(complaintHolidaySchema), complaintsController.saveHoliday);

router.get(
  '/:id',
  authenticate,
  requireAnyPermission(PERMISSIONS.COMPLAINT_READ, PERMISSIONS.COMPLAINT_MANAGE),
  complaintsController.detail,
);
router.post(
  '/:id/respond',
  authenticate,
  requireAnyPermission(PERMISSIONS.COMPLAINT_RESPOND, PERMISSIONS.COMPLAINT_MANAGE),
  validate(respondComplaintSchema),
  complaintsController.respond,
);

router.post('/:id/reopen', authenticate, requireAnyPermission(PERMISSIONS.COMPLAINT_REOPEN, PERMISSIONS.COMPLAINT_MANAGE), validate(complaintActionSchema), complaintsController.reopen);
router.post('/:id/assign', authenticate, requireAnyPermission(PERMISSIONS.COMPLAINT_RESPOND, PERMISSIONS.COMPLAINT_MANAGE), validate(assignComplaintSchema), complaintsController.assign);
router.post('/:id/escalate', authenticate, requireAnyPermission(PERMISSIONS.COMPLAINT_RESPOND, PERMISSIONS.COMPLAINT_MANAGE), validate(complaintActionSchema), complaintsController.escalate);
router.post('/:id/draft', authenticate, requireAnyPermission(PERMISSIONS.COMPLAINT_RESPOND, PERMISSIONS.COMPLAINT_MANAGE), validate(complaintDraftSchema), complaintsController.draft);
router.post('/:id/notes', authenticate, requireAnyPermission(PERMISSIONS.COMPLAINT_RESPOND, PERMISSIONS.COMPLAINT_MANAGE), validate(complaintNoteSchema), complaintsController.note);
router.post('/:id/evidence', authenticate, requireAnyPermission(PERMISSIONS.COMPLAINT_RESPOND, PERMISSIONS.COMPLAINT_MANAGE), validate(complaintEvidenceSchema), complaintsController.evidence);
router.get('/:id/evidence/:evidenceId/file', authenticate, requireAnyPermission(PERMISSIONS.COMPLAINT_READ, PERMISSIONS.COMPLAINT_MANAGE), validate(complaintEvidenceIdSchema), complaintsController.evidenceFile);
router.post('/:id/responses/:responseId/retry', authenticate, requireAnyPermission(PERMISSIONS.COMPLAINT_RESPOND, PERMISSIONS.COMPLAINT_MANAGE), validate(complaintResponseIdSchema), complaintsController.retryNotification);

export default router;
