import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { PERMISSIONS } from '@config/constants';
import { authenticate } from '@middlewares/auth.middleware';
import { requireAnyPermission } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { mediaController } from './media.controller';
import { MEDIA_CATEGORIES, mediaService } from './media.service';
import { fluxImageService } from './fluxImage.service';

const listQuery = z.object({
  query: z.object({
    category: z.enum(MEDIA_CATEGORIES).optional(),
    includeDeleted: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().positive().max(10_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().max(120).optional(),
    sort: z.enum(['recent', 'name']).optional(),
    reviewStatus: z.enum(['APPROVED', 'DRAFT', 'ARCHIVED']).optional(),
  }),
});

const router = Router();
router.get('/files/:filename', mediaController.file);
router.use(authenticate);
const canUseMedia = requireAnyPermission(PERMISSIONS.CATALOG_PRODUCT_WRITE, PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE, PERMISSIONS.INVENTORY_MANAGE);
const canManageMedia = requireAnyPermission(PERMISSIONS.CATALOG_PRODUCT_WRITE, PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE);
const generationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 12,
  keyGenerator: (req) => String(req.user!.sub),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Alcanzaste el limite de 12 imagenes por hora. Intentalo mas tarde', code: 'TOO_MANY_REQUESTS' },
});
/**
 * El listado se resuelve aqui y no en el controlador porque su respuesta lleva
 * `meta` ademas de `data`: el panel necesita el total REAL para paginar y para
 * que el contador de recursos deje de mostrar el tamano de la pagina.
 */
router.get(
  '/',
  canUseMedia,
  validate(listQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof listQuery>['query'];
    const { items, total, page, limit } = await mediaService.listPaged({
      category: query.category,
      includeDeleted: query.includeDeleted === 'true',
      page: query.page,
      limit: query.limit,
      search: query.search,
      sort: query.sort,
      reviewStatus: query.reviewStatus,
    });
    return ok(res, items, 'OK', {
      page,
      pageSize: limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);
router.get('/generation-status', canUseMedia, (_req, res) => ok(res, { configured: fluxImageService.isConfigured() }));
router.get('/health', canManageMedia, mediaController.health);
router.post(
  '/generate',
  canUseMedia,
  generationLimiter,
  validate(z.object({ body: z.object({ prompt: z.string().trim().min(10).max(1500) }) })),
  asyncHandler(async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    return ok(res, await fluxImageService.generate(req.body.prompt));
  }),
);
router.post(
  '/',
  canUseMedia,
  validate(z.object({ body: z.object({
    fileName: z.string().min(1).max(180),
    mimeType: z.enum(['image/webp', 'image/jpeg', 'image/png']),
    dataUrl: z.string().min(20).max(7_500_000),
    altText: z.string().max(180).nullable().optional(),
    category: z.enum(MEDIA_CATEGORIES).optional(),
    sourceType: z.enum(['UPLOAD', 'AI', 'PROFILE']).optional(),
    sourcePrompt: z.string().max(1500).nullable().optional(),
  }) })),
  mediaController.upload,
);
router.post(
  '/import-url',
  canUseMedia,
  validate(z.object({ body: z.object({
    sourceUrl: z.string().url().max(2_048),
    altText: z.string().max(180).nullable().optional(),
    category: z.enum(MEDIA_CATEGORIES).optional(),
  }) })),
  mediaController.importFromUrl,
);
router.patch(
  '/:id',
  canManageMedia,
  validate(z.object({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({ altText: z.string().max(180).nullable().optional(), category: z.enum(MEDIA_CATEGORIES).optional(), reviewStatus: z.enum(['APPROVED', 'DRAFT', 'ARCHIVED']).optional() }),
  })),
  mediaController.update,
);
router.patch('/:id/status', canManageMedia, validate(z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({ reviewStatus: z.enum(['APPROVED', 'DRAFT', 'ARCHIVED']) }),
})), mediaController.setStatus);
router.delete('/:id', canManageMedia, validate(z.object({ params: z.object({ id: z.coerce.number().int().positive() }) })), mediaController.remove);
router.post('/:id/restore', canManageMedia, validate(z.object({ params: z.object({ id: z.coerce.number().int().positive() }) })), mediaController.restore);
router.post('/:id/replace', canManageMedia, validate(z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({ replacementId: z.coerce.number().int().positive() }),
})), mediaController.replace);

export default router;
