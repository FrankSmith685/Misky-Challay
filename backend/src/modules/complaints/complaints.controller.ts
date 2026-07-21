import type { Request, Response } from 'express';
import { ok, created } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ApiError } from '@shared/errors/ApiError';
import { audit } from '@shared/utils/audit';
import type { ComplaintStatus } from '@database/models/complaint.model';
import { complaintsService } from './complaints.service';

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

    const complaint = await complaintsService.respond(
      Number(req.params.id),
      req.body.response,
      req.body.status as ComplaintStatus,
      req.user.sub,
    );

    await audit(req, {
      action: 'complaint.respond',
      entity: 'complaints',
      entityId: complaint.id,
      after: { status: complaint.status },
    });

    return ok(res, { id: complaint.id, status: complaint.status }, 'Respuesta registrada');
  }),
};
