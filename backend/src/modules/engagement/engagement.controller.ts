import type { Request, Response } from 'express';
import { created, ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ApiError } from '@shared/errors/ApiError';
import { UxEvent } from '@database/models';
import { engagementService } from './engagement.service';

const userId = (req: Request): number => {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.sub;
};

export const engagementController = {
  track: asyncHandler(async (req: Request, res: Response) => {
    await UxEvent.create({ sessionId: req.body.sessionId, userId: req.user?.sub ?? null, branchId: req.body.branchId ?? null, eventType: req.body.eventType, metadata: req.body.metadata ?? null });
    return ok(res, null);
  }),
  favorites: asyncHandler(async (req: Request, res: Response) => ok(res, await engagementService.listFavorites(userId(req), req.query.branchId ? Number(req.query.branchId) : undefined))),
  addFavorite: asyncHandler(async (req: Request, res: Response) => created(res, await engagementService.addFavorite(userId(req), Number(req.params.productId)), 'Producto guardado en favoritos')),
  removeFavorite: asyncHandler(async (req: Request, res: Response) => ok(res, await engagementService.removeFavorite(userId(req), Number(req.params.productId)), 'Producto retirado de favoritos')),
  productReviews: asyncHandler(async (req: Request, res: Response) => {
    const result = await engagementService.listProductReviews(Number(req.params.productId), Number(req.query.page), Number(req.query.pageSize));
    return ok(res, { summary: result.summary, reviews: result.reviews }, 'Reseñas verificadas', result.meta);
  }),
  pendingReviews: asyncHandler(async (req: Request, res: Response) => ok(res, await engagementService.pendingReviews(userId(req)))),
  myReviews: asyncHandler(async (req: Request, res: Response) => ok(res, await engagementService.myReviews(userId(req)))),
  createReview: asyncHandler(async (req: Request, res: Response) => created(res, await engagementService.createReview(userId(req), req.body), 'Gracias por compartir tu experiencia')),
  updateReview: asyncHandler(async (req: Request, res: Response) => ok(res, await engagementService.updateReview(userId(req), Number(req.params.reviewId), req.body), 'Reseña actualizada')),
  newsletterStatus: asyncHandler(async (req: Request, res: Response) => ok(res, await engagementService.newsletterStatus(userId(req)))),
  newsletter: asyncHandler(async (req: Request, res: Response) => ok(res, await engagementService.setNewsletter(userId(req), req.body.subscribed, req.body.source), req.body.subscribed ? 'Novedades activadas' : 'Novedades desactivadas')),
  recommendations: asyncHandler(async (req: Request, res: Response) => ok(res, await engagementService.recommendations(req.user?.sub ?? null, req.query.branchId ? Number(req.query.branchId) : undefined, Number(req.query.limit)))),
};
