import fs from 'node:fs/promises';
import type { Request, Response } from 'express';
import { ApiError } from '@shared/errors/ApiError';
import { created, noContent, ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { mediaService, resolveMediaFile } from './media.service';

export const mediaController = {
  file: asyncHandler(async (req: Request, res: Response) => {
    const filePath = resolveMediaFile(req.params.filename);
    try { await fs.access(filePath); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw ApiError.notFound('Imagen no encontrada');
      throw error;
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(filePath);
  }),
  list: asyncHandler(async (req: Request, res: Response) =>
    ok(res, await mediaService.list(
      typeof req.query.category === 'string' ? req.query.category : undefined,
      req.query.includeDeleted === 'true',
    )),
  ),
  upload: asyncHandler(async (req: Request, res: Response) =>
    created(res, await mediaService.upload({ ...req.body, createdBy: req.user?.sub ?? null }), 'Imagen optimizada y guardada'),
  ),
  importFromUrl: asyncHandler(async (req: Request, res: Response) =>
    created(res, await mediaService.importFromUrl({ ...req.body, createdBy: req.user?.sub ?? null }), 'Imagen importada y guardada'),
  ),
  update: asyncHandler(async (req: Request, res: Response) =>
    ok(res, await mediaService.update(Number(req.params.id), req.body), 'Imagen actualizada'),
  ),
  remove: asyncHandler(async (req: Request, res: Response) => {
    await mediaService.remove(Number(req.params.id));
    return noContent(res);
  }),
  restore: asyncHandler(async (req: Request, res: Response) =>
    ok(res, await mediaService.restore(Number(req.params.id)), 'Imagen restaurada'),
  ),
  replace: asyncHandler(async (req: Request, res: Response) =>
    ok(res, await mediaService.replaceReferences(Number(req.params.id), Number(req.body.replacementId)), 'Referencias reemplazadas'),
  ),
};
