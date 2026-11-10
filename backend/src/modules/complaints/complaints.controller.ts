import type { Request, Response } from 'express';
import { ok, created } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ApiError } from '@shared/errors/ApiError';
import { audit } from '@shared/utils/audit';
import type { ComplaintStatus } from '@database/models/complaint.model';
import { complaintsService } from './complaints.service';
import { downloadComplaintEvidence, uploadComplaintEvidence } from './complaints.evidence';

export const complaintsController = {
  /** Publico: cualquiera puede presentar un reclamo, con sesion o sin ella. */
  create: asyncHandler(async (req: Request, res: Response) => {
    const complaint = await complaintsService.create({
      ...req.body,
      userId: req.user?.sub ?? null,
    });

    return created(
      res,
      {
        code: complaint.code,
        status: complaint.status,
        dueAt: complaint.dueAt,
        createdAt: complaint.createdAt,
      },
      'Reclamo registrado. Te enviamos una copia a tu correo.',
    );
  }),

  /** Publico: el consumidor consulta el estado con su correlativo y su documento. */
  track: asyncHandler(async (req: Request, res: Response) => {
    const result = await complaintsService.trackByCodeAndDoc(
      String(req.query.code),
      String(req.query.docNumber),
    );
    return ok(res, result);
  }),

  // --- Panel ---
  list: asyncHandler(async (req: Request, res: Response) => {
    const { complaints, meta } = await complaintsService.list(req.query);
    return ok(res, complaints, `${meta.total} reclamos`, meta);
  }),

  summary: asyncHandler(async (_req: Request, res: Response) => {
    const summary = await complaintsService.summary();
    return ok(res, summary);
  }),

  detail: asyncHandler(async (req: Request, res: Response) => {
    const complaint = await complaintsService.getById(Number(req.params.id));
    return ok(res, complaint);
  }),

  respond: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();

    const result = await complaintsService.respond(
      Number(req.params.id),
      req.body.response,
      req.body.status as ComplaintStatus,
      req.user.sub,
      req.body.expectedUpdatedAt,
      req.body.reason,
    );

    await audit(req, {
      action: 'complaint.respond',
      entity: 'complaints',
      entityId: result.id,
      after: { status: result.status, version: result.version, notificationStatus: result.notificationStatus },
    });

    return ok(res, result, result.notificationStatus === 'FAILED' ? 'Respuesta guardada, pero falta reenviar la notificación' : 'Respuesta registrada');
  }),

  reopen: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const result = await complaintsService.reopen(Number(req.params.id), req.user.sub, req.body.reason, req.body.expectedUpdatedAt);
    await audit(req, { action: 'complaint.reopen', entity: 'complaints', entityId: result.id, after: result });
    return ok(res, result, 'Reclamo reabierto');
  }),

  assign: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const result = await complaintsService.assign(Number(req.params.id), req.body.userId, req.user.sub, req.body.reason, req.body.expectedUpdatedAt);
    await audit(req, { action: 'complaint.assign', entity: 'complaints', entityId: result.id, after: result });
    return ok(res, result, 'Responsable actualizado');
  }),

  escalate: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const result = await complaintsService.escalate(Number(req.params.id), req.user.sub, req.body.reason, req.body.expectedUpdatedAt);
    await audit(req, { action: 'complaint.escalate', entity: 'complaints', entityId: result.id, after: result });
    return ok(res, result, 'Reclamo escalado');
  }),

  draft: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    return ok(res, await complaintsService.saveDraft(Number(req.params.id), req.body.response, req.user.sub, req.body.expectedUpdatedAt));
  }),

  note: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const note = await complaintsService.addNote(Number(req.params.id), req.user.sub, req.body.note);
    await audit(req, { action: 'complaint.note', entity: 'complaints', entityId: req.params.id, after: { noteId: note.id } });
    return created(res, note, 'Nota interna guardada');
  }),

  evidence: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const evidence = await uploadComplaintEvidence(Number(req.params.id), req.user.sub, req.body);
    await audit(req, { action: 'complaint.evidence', entity: 'complaints', entityId: req.params.id, after: { evidenceId: evidence.id, fileName: evidence.fileName } });
    return created(res, evidence, 'Evidencia guardada');
  }),

  evidenceFile: asyncHandler(async (req: Request, res: Response) => {
    const { evidence, bytes } = await downloadComplaintEvidence(Number(req.params.id), Number(req.params.evidenceId));
    res.setHeader('Content-Type', evidence.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(evidence.fileName)}"`);
    res.send(bytes);
  }),

  assignees: asyncHandler(async (_req: Request, res: Response) => ok(res, await complaintsService.assignees())),
  retryNotification: asyncHandler(async (req: Request, res: Response) => ok(res, await complaintsService.retryNotification(Number(req.params.id), Number(req.params.responseId)), 'Notificación reintentada')),
  holidays: asyncHandler(async (req: Request, res: Response) => ok(res, await complaintsService.holidays(Number(req.query.year)))),
  saveHoliday: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const { reason: _reason, ...holidayInput } = req.body as { holidayDate: string; label: string; isActive: boolean; reason: string };
    const holiday = await complaintsService.saveHoliday(holidayInput, req.user.sub);
    await audit(req, { action: 'complaint.holiday.save', entity: 'complaint_holidays', entityId: holiday.id, after: { ...(holiday.toJSON() as Record<string, unknown>), reason: _reason } });
    return ok(res, holiday, 'Calendario actualizado');
  }),
};
