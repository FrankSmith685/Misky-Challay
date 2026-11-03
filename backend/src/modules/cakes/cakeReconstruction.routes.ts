import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { validate } from '@middlewares/validate.middleware';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ok } from '@shared/http/ApiResponse';
import { ApiError } from '@shared/errors/ApiError';
import { cakeReconstructionService, reconstructionToken } from './cakeReconstruction.service';

const router = Router();
// Short request throttle; the service counts accepted, distinct generations.
const createLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { success: false, code: 'TOO_MANY_REQUESTS', message: 'Recibimos muchos intentos seguidos. Espera un minuto antes de volver a intentar; tu foto está guardada.' } });
const readLimiter = rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: 'draft-7', legacyHeaders: false });
const params = z.object({ params: z.object({ token: z.string().regex(reconstructionToken) }) });
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); next(); });
router.get('/capabilities', asyncHandler(async (_req, res) => ok(res, await cakeReconstructionService.availability())));
router.post('/', createLimiter, validate(z.object({ body: z.object({ referenceDataUrl: z.string().max(300_000), requestId: z.string().uuid() }) })), asyncHandler(async (req, res) => {
  try {
    const data = await cakeReconstructionService.create(req.body.referenceDataUrl, req.body.requestId, req.ip ?? req.socket.remoteAddress ?? 'unknown');
    return res.status(202).json({ success: true, message: 'Conversión iniciada', data });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'MODEL_QUOTA_EXCEEDED') res.setHeader('Retry-After', (error.details as { retryAfterSeconds: number }).retryAfterSeconds);
    throw error;
  }
}));
router.get('/:token', readLimiter, validate(params), asyncHandler(async (req, res) => ok(res, await cakeReconstructionService.get(req.params.token))));
router.get('/:token/model', readLimiter, validate(params), asyncHandler(async (req, res) => {
  res.setHeader('Content-Type', 'model/gltf-binary');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline; filename="torta-3d.glb"');
  return res.send(await cakeReconstructionService.model(req.params.token));
}));
export default router;
