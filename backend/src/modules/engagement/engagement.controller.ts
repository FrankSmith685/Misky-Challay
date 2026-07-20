import type { Request, Response } from 'express';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { UxEvent } from '@database/models';

/** Controladores del modulo engagement: Favoritos, resenas, notificaciones, newsletter y soporte. */
export const engagementController = {
  track: asyncHandler(async (req: Request, res: Response) => {
    await UxEvent.create({ sessionId: req.body.sessionId, userId: req.user?.sub ?? null, eventType: req.body.eventType, metadata: req.body.metadata ?? null });
    return ok(res, null);
  }),
  placeholder: asyncHandler(async (_req: Request, res: Response) =>
    ok(res, { module: 'engagement', status: 'pendiente de implementar' }, 'Modulo engagement disponible'),
  ),
};
