import fs from 'node:fs/promises';
import type { Request, Response } from 'express';
import { ApiError } from '@shared/errors/ApiError';
import { created, noContent, ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { mediaService, resolveMediaFile } from './media.service';
import { audit } from '@shared/utils/audit';

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
  upload: asyncHandler(async (req: Request, res: Response) => {
    const asset = await mediaService.upload({ ...req.body, createdBy: req.user?.sub ?? null });
    await audit(req, { action: 'media.upload', entity: 'media_assets', entityId: asset.id, after: asset });
    return created(res, asset, 'Imagen optimizada y guardada');
  }),
  importFromUrl: asyncHandler(async (req: Request, res: Response) => {
    const asset = await mediaService.importFromUrl({ ...req.body, createdBy: req.user?.sub ?? null });
    await audit(req, { action: 'media.import_url', entity: 'media_assets', entityId: asset.id, after: asset });
    return created(res, asset, 'Imagen importada y guardada');
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const asset = await mediaService.update(Number(req.params.id), req.body);
    await audit(req, { action: 'media.update', entity: 'media_assets', entityId: asset.id, after: asset });
    return ok(res, asset, 'Imagen actualizada');
  }),
  setStatus: asyncHandler(async (req: Request, res: Response) => {
    const asset = await mediaService.setReviewStatus(Number(req.params.id), req.body.reviewStatus);
    await audit(req, { action: 'media.status', entity: 'media_assets', entityId: asset.id, after: asset });
    return ok(res, asset, 'Estado de revisión actualizado');
  }),
  health: asyncHandler(async (_req: Request, res: Response) => ok(res, await mediaService.health())),
  remove: asyncHandler(async (req: Request, res: Response) => {
    await mediaService.remove(Number(req.params.id));
    await audit(req, { action: 'media.trash', entity: 'media_assets', entityId: req.params.id });
    return noContent(res);
  }),
  restore: asyncHandler(async (req: Request, res: Response) => {
    const asset = await mediaService.restore(Number(req.params.id));
    await audit(req, { action: 'media.restore', entity: 'media_assets', entityId: asset.id, after: asset });
    return ok(res, asset, 'Imagen restaurada');
  }),
  replace: asyncHandler(async (req: Request, res: Response) => {
    const result = await mediaService.replaceReferences(Number(req.params.id), Number(req.body.replacementId));
    await audit(req, { action: 'media.replace_references', entity: 'media_assets', entityId: req.params.id, after: result });
    return ok(res, result, 'Referencias reemplazadas');
  }),
};
